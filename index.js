const fs = require('fs');
const WebSocket = require('ws');
const SocksProxyAgent = require('socks-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');
const banner = require('./banner');
const chalk = require('chalk');

class WebSocketBot {
    constructor() {
        this.config = this.loadConfig();
        this.proxies = this.loadProxies();
        this.connections = new Map();
        this.proxyIndex = 0;
        this.deviceVersion = '0.7.0';
    }

    loadConfig() {
        try {
            const data = fs.readFileSync('config.json', 'utf8');
            const config = JSON.parse(data);

            if (!Array.isArray(config)) {
                throw new Error('Invalid config format. Config should be an array of devices.');
            }

            config.forEach(device => {
                if (!device.deviceId || !device.tokens || !Array.isArray(device.tokens)) {
                    throw new Error('Invalid config format. Each device must have a deviceId and an array of tokens.');
                }
            });

            return config;
        } catch (error) {
            console.error(chalk.red('Error loading config:', error.message));
            process.exit(1);
        }
    }

    parseProxy(proxyString) {
        try {
            let protocol, host, port, username, password;
            proxyString = proxyString.trim();

            if (proxyString.includes('://')) {
                const url = new URL(proxyString);
                protocol = url.protocol.replace(':', '');
                host = url.hostname;
                port = url.port;
                username = url.username || undefined;
                password = url.password || undefined;
            } else {
                const parts = proxyString.split(':');
                if (parts.length === 4) { // host:port:username:password
                    [host, port, username, password] = parts;
                    protocol = 'http';
                } else if (parts.length === 2) { // host:port
                    [host, port] = parts;
                    protocol = 'http';
                } else {
                    throw new Error('Invalid proxy format');
                }
            }

            return {
                protocol: protocol.toLowerCase(),
                host,
                port: parseInt(port),
                username,
                password
            };
        } catch (error) {
            console.error(chalk.red(`Error parsing proxy "${proxyString}":`, error.message));
            return null;
        }
    }

    loadProxies() {
        try {
            const data = fs.readFileSync('proxies.txt', 'utf8');
            return data.split('\n')
                .filter(line => line.trim())
                .map(proxy => this.parseProxy(proxy))
                .filter(proxy => proxy !== null);
        } catch (error) {
            console.log(chalk.yellow('No proxies found, using direct connection'));
            return [];
        }
    }

    getProxyAgent(proxy) {
        if (!proxy) return null;

        const options = {
            host: proxy.host,
            port: proxy.port,
            protocol: proxy.protocol + ':'
        };

        if (proxy.username && proxy.password) {
            options.auth = `${proxy.username}:${proxy.password}`;
        }

        const proxyUrl = `${proxy.protocol}://${proxy.host}:${proxy.port}`;

        switch (proxy.protocol.toLowerCase()) {
            case 'socks4':
            case 'socks5':
                return new SocksProxyAgent(proxyUrl);
            case 'http':
            case 'https':
                return new HttpsProxyAgent(options);
            default:
                console.warn(chalk.yellow(`Unsupported proxy protocol: ${proxy.protocol}`));
                return null;
        }
    }

    getNextProxy() {
        if (this.proxies.length === 0) return null;
        const proxy = this.proxies[this.proxyIndex];
        this.proxyIndex = (this.proxyIndex + 1) % this.proxies.length;
        return proxy;
    }

    handleMessage(ws, data, token, deviceId) {
        const message = data.toString();
        console.log(chalk.cyan(`Received [${token.substring(0, 15)}...] (${deviceId}):`, message));

        if (message.startsWith('0')) {
            const handshake = JSON.parse(message.substring(1));
            ws.pingInterval = handshake.pingInterval || 25000;
            ws.pingTimeout = handshake.pingTimeout || 20000;

            setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(`40{"sid":"${handshake.sid}"}`);
                }
            }, 500);

            // Start ping/pong
            ws.pingTimer = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send('2');
                }
            }, ws.pingInterval);
        } else if (message.startsWith('2')) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send('3');
            }
        }
    }

    createConnection(device, token) {
        const proxy = this.getNextProxy();
        const agent = this.getProxyAgent(proxy);

        const wsUrl = `wss://ws-v2.sparkchain.ai/socket.io/?token=${token}&device_id=${device.deviceId}&device_version=${this.deviceVersion}&EIO=4&transport=websocket`;

        const wsOptions = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                'Origin': 'chrome-extension://jlpniknnodfkbmbgkjelcailjljlecch',
                'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
                'Sec-WebSocket-Extensions': 'permessage-deflate; client_max_window_bits'
            },
            agent: agent,
            rejectUnauthorized: false // Optional: bypass SSL verification if needed
        };

        const ws = new WebSocket(wsUrl, wsOptions);

        ws.on('open', () => {
            console.log(chalk.green(`✅ Connected: ${token.substring(0, 15)}... (${device.deviceId}) ${proxy ? `via ${proxy.protocol}://${proxy.host}:${proxy.port}` : 'direct'}`));
            this.connections.set(token, ws);
        });

        ws.on('message', (data) => this.handleMessage(ws, data, token, device.deviceId));

        ws.on('error', (error) => {
            console.error(chalk.red(`Error [${token.substring(0, 15)}...]:`, error.message));
            this.reconnect(device, token);
        });

        ws.on('close', (code, reason) => {
            console.log(chalk.yellow(`Disconnected [${token.substring(0, 15)}...]: Code ${code}, Reason: ${reason}`));
            if (ws.pingTimer) clearInterval(ws.pingTimer);
            this.connections.delete(token);
            this.reconnect(device, token);
        });

        return ws;
    }

    reconnect(device, token, attempt = 1) {
        const maxRetries = 500;
        const retryDelay = Math.min(5000 * attempt, 300000); // Cap at 5 minutes

        if (attempt > maxRetries) {
            console.error(chalk.red(`Max retries reached for ${token.substring(0, 15)}...`));
            return;
        }

        if (!this.connections.has(token)) {
            console.log(chalk.yellow(`♻️ Reconnecting [${token.substring(0, 15)}...] (Attempt ${attempt})`));
            setTimeout(() => {
                this.createConnection(device, token);
            }, retryDelay);
        }
    }

    shutdown() {
        for (const [token, ws] of this.connections) {
            if (ws.readyState !== WebSocket.CLOSED) {
                ws.close();
            }
        }
        this.connections.clear();
    }

    start() {
        console.log(banner);
        console.log(chalk.green(`🚀 Starting bot with ${this.config.length} devices`));

        this.config.forEach(device => {
            device.tokens.forEach(token => {
                this.createConnection(device, token);
            });
        });

        // Handle graceful shutdown
        process.on('SIGINT', () => {
            console.log(chalk.yellow('Shutting down...'));
            this.shutdown();
            process.exit(0);
        });
    }
}

const bot = new WebSocketBot();
bot.start();