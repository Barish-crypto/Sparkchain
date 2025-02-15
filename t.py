def convert_proxy(proxy):
    parts = proxy.strip().split(':')
    if len(parts) == 4:
        protocol, user, password, host_port = parts
        host, port = host_port.rsplit('@', 1)
        return f"{protocol}://{user}:{password}@{host}:{port}"
    elif len(parts) == 3:
        protocol, host_port, port = parts
        host = host_port.rsplit('@', 1)[-1]
        return f"http://{host}:{port}"
    else:
        return f"http://{proxy}"

with open('proxies.txt', 'r') as f:
    proxies = f.readlines()

with open('proxiesFixed.txt', 'w') as f:
    for proxy in proxies:
        f.write(convert_proxy(proxy) + '\n')

