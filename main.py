import json
import asyncio
import aiohttp
import signal
import platform
from aiohttp import WSMsgType
from colorama import Fore, init

# Initialize colorama for colored output
init(autoreset=True)

class WebSocketBot:
    def __init__(self):
        self.config = self.load_config()
        self.proxies = self.load_proxies()
        self.connections = {}
        self.proxy_index = 0
        self.semaphore = asyncio.Semaphore(50)  # Limit number of concurrent connections

    def load_config(self):
        """Load the configuration from the config.json file."""
        with open('config.json', 'r') as f:
            return json.load(f)

    def load_proxies(self):
        """Load proxies from proxies.txt."""
        try:
            with open('proxies.txt', 'r') as f:
                return [p.strip() for p in f if p.strip()]
        except FileNotFoundError:
            return []  # No proxies provided, using direct connection

    def get_next_proxy(self):
        """Get the next proxy from the proxy list."""
        if not self.proxies:
            return None
        proxy = self.proxies[self.proxy_index]
        self.proxy_index = (self.proxy_index + 1) % len(self.proxies)
        return proxy

    async def ping_loop(self, ws, token, device_id):
        """Send a ping message every 25 seconds to keep the WebSocket connection alive."""
        while not ws.closed:
            try:
                await ws.send_str("2")
                print(Fore.CYAN + f"📡 Ping sent [{token[:10]}] ({device_id})")
                await asyncio.sleep(25)  # Send ping every 25 seconds
            except Exception as e:
                print(Fore.RED + f"Error pinging {token[:10]} ({device_id}): {e}")
                break

    async def handle_message(self, ws, msg, token, device_id):
        """Handle incoming WebSocket messages."""
        message = msg
        print(Fore.CYAN + f"Received [{token[:10]}] ({device_id}): {message}")

        if message.startswith('0'):
            handshake = json.loads(message[1:])
            self.ping_interval = handshake.get('pingInterval', 25000)
            self.ping_timeout = handshake.get('pingTimeout', 20000)
            await ws.send_str(f"40{{\"sid\":\"{handshake['sid']}\"}}")

        elif message.startswith('2'):
            if ws.open:
                await ws.send_str("3")

    async def reconnect(self, token, device_id):
        """Attempt to reconnect after a failure."""
        print(Fore.YELLOW + f"♻️ Reconnecting [{token[:10]}] ({device_id})...")
        await asyncio.sleep(5)  # Wait 5 seconds before retrying
        await self.create_connection(token, device_id)

    async def create_connection(self, token, device_id):
        """Create a new WebSocket connection with proxy support."""
        while True:
            proxy = self.get_next_proxy()
            proxy_url = f"http://{proxy}" if proxy else None
            ws_url = f"wss://ws-v2.sparkchain.ai/socket.io/?token={token}&device_id={device_id}&device_version=0.7.0&EIO=4&transport=websocket"

            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                'Origin': 'chrome-extension://jlpniknnodfkbmbgkjelcailjljlecch',
                'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
                'Sec-WebSocket-Extensions': 'permessage-deflate; client_max_window_bits'
            }

            try:
                async with self.semaphore:
                    async with aiohttp.ClientSession() as session:
                        async with session.ws_connect(ws_url, proxy=proxy_url, headers=headers) as ws:
                            print(Fore.GREEN + f"✅ Connected [{token[:10]}] ({device_id}) via {proxy if proxy else 'direct'}")
                            self.connections[token] = ws
                            asyncio.create_task(self.ping_loop(ws, token, device_id))

                            async for msg in ws:
                                if msg.type == WSMsgType.TEXT:
                                    await self.handle_message(ws, msg.data, token, device_id)

                            return  # Exit when the connection is successful
            except Exception as e:
                print(Fore.RED + f"Error connecting [{token[:10]}] ({device_id}): {e}")
                if not self.proxies:
                    break  # No proxy, do not retry
                else:
                    print(Fore.YELLOW + f"Retrying with next proxy...")

    async def start(self):
        """Start the bot with the provided tokens."""
        devices = self.config.get("devices", [])
        if not devices:
            print(Fore.RED + "No devices found in config.json.")
            return

        print(Fore.GREEN + f"🚀 Starting bot with {len(devices)} devices")
        tasks = []
        for device in devices:
            device_id = device["deviceId"]
            tokens = device.get("tokens", [])
            if not tokens:
                print(Fore.RED + f"No tokens found for device {device_id}.")
                continue
            for token in tokens:
                tasks.append(self.create_connection(token, device_id))
        
        await asyncio.gather(*tasks)

    def shutdown(self):
        """Gracefully shut down the bot."""
        for ws in self.connections.values():
            if not ws.closed:
                asyncio.create_task(ws.close())
        self.connections.clear()

    def run(self):
        """Run the bot."""
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        if platform.system() != "Windows":
            for signame in ('SIGINT', 'SIGTERM'):
                loop.add_signal_handler(getattr(signal, signame), self.shutdown)

        try:
            loop.run_until_complete(self.start())
        except KeyboardInterrupt:
            pass
        finally:
            self.shutdown()
            loop.close()

if __name__ == '__main__':
    bot = WebSocketBot()
    bot.run()
