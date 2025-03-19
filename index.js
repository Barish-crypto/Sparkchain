const fs = require('fs');
const WebSocket = require('ws');
const SocksProxyAgent = require('socks-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');
const chalk = require('chalk');
const UserAgent = require('user-agents'); // Thêm thư viện user-agents

class WebSocketBot {
    constructor() {
        this.config = this.loadConfig();
        this.proxies = this.loadProxies();
        this.connections = new Map();
        this.proxyIndex = 0;
        this.pingInterval = 25000;
        this.pingTimeout = 20000;
        this.deviceVersion = '0.7.0';
        this.isRunning = true;
        this.connectionTimeout = 10000; // Timeout 10 giây
        this.userAgentGenerator = new UserAgent(); // Khởi tạo generator user-agent
    }

    // Load config không log
    loadConfig() {
        const data = fs.readFileSync('config.json', 'utf8');
        const config = JSON.parse(data);

        if (!Array.isArray(config)) {
            throw new Error('Config must be an array of devices.');
        }

        config.forEach((device, index) => {
            if (!device.deviceId || !device.tokens || !Array.isArray(device.tokens)) {
                throw new Error(`Device at index ${index} must have deviceId and an array of tokens.`);
            }
        });

        return config;
    }

    // Parse proxy không log
    parseProxy(proxyString) {
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
            } else {
                return null;
            }
        }
        const parsedPort = parseInt(port);
        if (isNaN(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
            return null;
        }
        return { protocol: protocol.toLowerCase(), host, port: parsedPort };
    }

    // Load proxies không log
    loadProxies() {
        try {
            const data = fs.readFileSync('proxies.txt', 'utf8');
            return data.split('\n')
                .filter(line => line.trim())
                .map(proxy => this.parseProxy(proxy))
                .filter(proxy => proxy !== null);
        } catch {
            return [];
        }
    }

    // Lấy proxy tiếp theo
    getNextProxy() {
        if (this.proxies.length === 0) return null;
        const proxy = this.proxies[this.proxyIndex];
        this.proxyIndex = (this.proxyIndex + 1) % this.proxies.length;
        return proxy;
    }

    // Tạo proxy agent
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

    // Lấy timestamp cho log
    getTimestamp() {
        return new Date().toISOString();
    }

    // Chọn user-agent ngẫu nhiên từ thư viện
    getRandomUserAgent() {
        return this.userAgentGenerator.random().toString();
    }

    // Xử lý message không log
    handleMessage(ws, data, token) {
        const message = data.toString();
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

    // Thiết lập ping-pong không log
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

    // Tạo kết nối WebSocket, chỉ log khi thành công
    createConnection(device, token) {
        if (!this.isRunning) return;

        const proxy = this.getNextProxy();
        const agent = this.getProxyAgent(proxy);

        const wsUrl = `wss://ws-v2.sparkchain.ai/socket.io/?token=${token}&device_id=${device.deviceId}&device_version=${this.deviceVersion}&EIO=4&transport=websocket`;

        const wsOptions = {
            headers: {
                'User-Agent': this.getRandomUserAgent(), // User-agent ngẫu nhiên từ thư viện
                'Origin': 'chrome-extension://jlpniknnodfkbmbgkjelcailjljlecch',
                'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
                'Sec-WebSocket-Extensions': 'permessage-deflate; client_max_window_bits'
            },
            agent: agent,
            timeout: this.connectionTimeout
        };

        const ws = new WebSocket(wsUrl, wsOptions);

        const timeout = setTimeout(() => {
            if (ws.readyState !== WebSocket.OPEN) {
                ws.terminate();
                this.reconnect(device, token);
            }
        }, this.connectionTimeout);

        ws.on('open', () => {
            clearTimeout(timeout);
            console.log(chalk.green(`[${this.getTimestamp()}] Connected: ${token.substring(0, 15)}... ${proxy ? `via ${proxy.protocol} proxy` : 'direct'}`));
            this.connections.set(token, ws);
        });

        this.setupPingPong(ws, token);

        ws.on('error', () => {
            clearTimeout(timeout);
            this.reconnect(device, token);
        });

        ws.on('close', () => {
            clearTimeout(timeout);
            this.connections.delete(token);
            this.reconnect(device, token);
        });
    }

    // Kết nối lại với retry logic, không log
    reconnect(device, token, attempt = 1) {
        if (!this.isRunning) return;

        const maxRetries = 500;
        const retryDelay = 5000;

        if (attempt <= maxRetries) {
            setTimeout(() => {
                if (this.connections.has(token)) {
                    this.createConnection(device, token);
                }
            }, retryDelay * attempt);
        }
    }

    // Dừng bot không log
    stop() {
        this.isRunning = false;
        this.connections.forEach((ws, token) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        });
        this.connections.clear();
    }

    // Khởi động bot không log khởi động
    start() {
        this.config.forEach(device => {
            device.tokens.forEach(token => {
                this.createConnection(device, token);
            });
        });

        process.on('SIGINT', () => {
            this.stop();
            process.exit(0);
        });
    }
}

// Khởi tạo và chạy bot
const bot = new WebSocketBot();
bot.start();