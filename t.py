def is_valid_proxy(proxy):
    parts = proxy.split(':')
    if len(parts) != 2:
        return False
    ip, port = parts
    try:
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

