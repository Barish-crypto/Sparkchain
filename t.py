import ipaddress

def is_valid_proxy(proxy):
    parts = proxy.split(':')
    if len(parts) != 2:
        return False
    host, port = parts
    try:
        addr = ipaddress.ip_address(host)
        if addr.is_private or addr.is_unspecified or addr.is_loopback or addr.is_multicast or addr.is_reserved:
            return False
        port = int(port)
        if not (0 <= port <= 65535):
            return False
    except ValueError:
        return False
    return True

def remove_invalid_proxies(file_path):
    with open(file_path, 'r') as f:
        proxies = [line.strip() for line in f]
    
    valid_proxies = [proxy for proxy in proxies if is_valid_proxy(proxy)]
    
    with open(file_path, 'w') as f:
        for proxy in valid_proxies:
            f.write(proxy + '\n')

remove_invalid_proxies('proxies.txt')

