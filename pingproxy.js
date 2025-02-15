const WebSocket = require('ws');
const SocksProxyAgent = require('socks-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fs = require('fs');

// Hàm phân tích proxy từ chuỗi
function parseProxy(proxyString) {
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
        console.error('Error parsing proxy:', proxyString, error.message);
        return null;
    }
}

// Hàm tạo WebSocket kết nối qua proxy
function createWebSocketConnection(token, proxy, onValidProxy) {
    const wsUrl = `wss://ws-v2.sparkchain.ai/socket.io/?token=${token}&EIO=4&transport=websocket`;

    const agent = getProxyAgent(proxy);
    const wsOptions = {
        agent: agent,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            'Origin': 'chrome-extension://jlpniknnodfkbmbgkjelcailjljlecch',
            'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
            'Sec-WebSocket-Extensions': 'permessage-deflate; client_max_window_bits'
        }
    };

    const ws = new WebSocket(wsUrl, wsOptions);

    ws.on('open', () => {
        console.log('Proxy is valid. Connection established.');
        if (onValidProxy) onValidProxy(proxy);
        ws.close();
    });

    ws.on('error', (error) => {
        console.error('Error with WebSocket connection:', error.message);
    });

    ws.on('close', () => {
        console.log('Connection closed.');
    });
}

// Hàm lấy Proxy Agent tương ứng
function getProxyAgent(proxy) {
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

// Hàm kiểm tra proxy
function checkProxy(proxyString, token, onValidProxy) {
    const proxy = parseProxy(proxyString);
    if (!proxy) {
        console.error('Invalid proxy format');
        return;
    }
    createWebSocketConnection(token, proxy, onValidProxy);
}

// Ghi proxy hợp lệ vào file
function writeValidProxyToFile(validProxy) {
    const filePath = 'valid_proxies.txt';
    const proxyString = `${validProxy.protocol}:${validProxy.host}:${validProxy.port}`; // Ghi theo định dạng protocol:IP:PORT
    fs.appendFile(filePath, `${proxyString}\n`, (err) => {
        if (err) {
            console.error('Error writing to file:', err.message);
        } else {
            console.log('Valid proxy written to file:', proxyString);
        }
    });
}



// Đọc proxy từ file và kiểm tra
fs.readFile('proxies.txt', 'utf8', (err, data) => {
    if (err) {
        console.error('Error reading proxies file:', err.message);
        return;
    }

    const proxies = data.split('\n').map(line => line.trim()).filter(line => line !== '');
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjQ5MTc2LCJuYW1lIjoiQWx1bGFSMTU0MjgiLCJlbWFpbCI6Imw1YXpoMzhhQGZyZWVzb3VyY2Vjb2Rlcy5jb20iLCJyZWZlcnJlcl9pZCI6NDY3NzY4MDEsImV4cCI6MTc3MDYxMTg0OX0.55rzu5qXzCooCEsiayBPQWgPgNzEKAgzCIwXqrOU5HA'; // Thay token tại đây

    proxies.forEach(proxyString => {
        checkProxy(proxyString, token, writeValidProxyToFile);
    });
});
