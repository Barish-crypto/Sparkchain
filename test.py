with open('proxies.txt', 'r') as f:
    proxies = [proxy.strip() for proxy in f.readlines()]

PORT_MAX = 65535
proxies = [proxy for proxy in proxies if int(proxy.split(':')[-1]) <= PORT_MAX]

with open('proxies.txt', 'w') as f:
    for proxy in proxies:
        f.write(proxy + '\n')

