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
        this.pingInterval = 25000;
        this.pingTimeout = 20000;
        this.deviceVersion = '0.7.0';
        this.logFile = 'bot_activity.log';
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
            this.logToFile(`Error loading config: ${error.message}`);
            process.exit(1);
        }
    }

    parseProxy(proxyString) {
        try {
            let protocol, host, port;
            if (proxyString.includes('://')) {
                const url = new URL(proxyString);
                protocol = url.protocol.replace(':', '');
                host = url.hostname;
                port = url.port;
            } else {
                const parts = proxyString.split(':');
                if (parts.length === 3) {
                    [host, port, protocol] = parts;
                } else if (parts.length === 2) {
                    [host, port] = parts;
                    protocol = 'http';
                }
            }
            return { protocol: protocol.toLowerCase(), host, port: parseInt(port) };
        } catch (error) {
            console.error(chalk.red('Error parsing proxy:', proxyString, error.message));
            this.logToFile(`Error parsing proxy ${proxyString}: ${error.message}`);
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
            this.logToFile('No proxies found, using direct connection');
            return [];
        }
    }

    getProxyAgent(proxy) {
        if (!proxy) return null;
        const proxyUrl = `${proxy.protocol}://${proxy.host}:${proxy.port}`;
        switch (proxy.protocol.toLowerCase()) {
            case 'socks4':
            case 'socks5':
                return new SocksProxyAgent(proxyUrl);
            case 'http':
            case 'https':
                return new HttpsProxyAgent(proxyUrl);
            default:
                return null;
        }
    }

    getNextProxy() {
        if (this.proxies.length === 0) return null;
        const proxy = this.proxies[this.proxyIndex];
        this.proxyIndex = (this.proxyIndex + 1) % this.proxies.length;
        return proxy;
    }

    logToFile(message) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}\n`;
        fs.appendFileSync(this.logFile, logMessage);
    }

    handleMessage(ws, data, token) {
        const message = data.toString();
        console.log(chalk.cyan(`Received [${token.substring(0, 15)}...]:`, message));
        this.logToFile(`Received from ${token.substring(0, 15)}...: ${message}`);

        if (message.startsWith('0')) {
            const handshake = JSON.parse(message.substring(1));
            this.pingInterval = handshake.pingInterval;
            this.pingTimeout = handshake.pingTimeout;

            setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(`40{"sid":"${handshake.sid}"}`);
                }
            }, 500);
        } else if (message.startsWith('2')) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send('3');
            }
        }
    }

    setupPingPong(ws, token) {
        let upMessageSent = false;
        let messageCount = 0;

        ws.on('message', (data) => {
            this.handleMessage(ws, data, token);
            messageCount++;

            if (!upMessageSent && messageCount >= 10) {
                upMessageSent = true;
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send('42["up",{}]');
                }
            }
        });
    }

    checkConnectionStatus() {
        setInterval(() => {
            this.connections.forEach((ws, token) => {
                if (ws.readyState !== WebSocket.OPEN) {
                    console.log(chalk.yellow(`Connection lost for ${token.substring(0, 15)}..., attempting to reconnect`));
                    this.reconnect(this.config.find(d => d.tokens.includes(token)), token);
                }
            });
        }, 30000); // Check every 30 seconds
    }

    createConnection(device, token) {
        const proxy = this.getNextProxy();
        const agent = this.getProxyAgent(proxy);

        const wsUrl = `wss://ws-v2.sparkchain.ai/socket.io/?token=${token}&device_id=${device.deviceId}&device_version=${this.deviceVersion}&EIO=4&transport=websocket`;

        const wsOptions = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                'Origin': 'chrome-extension://jlpniknnodfkbmbgkjelcailjljlecch',
                'Accept-Encoding': 'gzip, deflate, br',
                'Accept': 'application/json, text/plain, */*',
                'Connection': 'keep-alive',
                'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
                'Sec-WebSocket-Extensions': 'permessage-deflate; client_max_window_bits'
            },
            agent: agent
        };

        const ws = new WebSocket(wsUrl, wsOptions);

        ws.on('open', () => {
            console.log(chalk.green(`Connected: ${token.substring(0, 15)}... ${proxy ? `via ${proxy.protocol} proxy` : 'direct'}`));
            this.logToFile(`Connected: ${token.substring(0, 15)}... ${proxy ? `via ${proxy.protocol} proxy` : 'direct'}`);
            this.connections.set(token, ws);
        });

        ws.on('error', (error) => {
            console.error(chalk.red(`Error for ${token.substring(0, 15)}...: ${error.message}`));
            this.logToFile(`Error for ${token.substring(0, 15)}...: ${error.message}`);
            this.reconnect(device, token);
        });

        ws.on('close', () => {
            console.log(chalk.yellow(`Connection closed for ${token.substring(0, 15)}...`));
            this.logToFile(`Connection closed for ${token.substring(0, 15)}...`);
            this.connections.delete(token);
            this.reconnect(device, token);
        });

        this.setupPingPong(ws, token);
    }

    reconnect(device, token, attempt = 1) {
        const maxRetries = 5;
        const retryDelay = 5000;

        if (attempt <= maxRetries) {
            console.log(chalk.yellow(`Reconnecting attempt ${attempt}/${maxRetries} for ${token.substring(0, 15)}...`));
            this.logToFile(`Reconnecting attempt ${attempt}/${maxRetries} for ${token.substring(0, 15)}...`);
            setTimeout(() => {
                if (!this.connections.has(token)) {
                    this.createConnection(device, token);
                }
            }, retryDelay * attempt);
        } else {
            console.log(chalk.red(`Max retries reached for ${token.substring(0, 15)}..., giving up`));
            this.logToFile(`Max retries reached for ${token.substring(0, 15)}..., giving up`);
        }
    }

    start() {
        console.log(banner);
        console.log(chalk.green(`Starting bot with ${this.config.length} devices`));
        this.logToFile(`Starting bot with ${this.config.length} devices`);
        this.config.forEach(device => {
            device.tokens.forEach(token => {
                this.createConnection(device, token);
            });
        });
        this.checkConnectionStatus();
    }
}

const bot = new WebSocketBot();
bot.start();