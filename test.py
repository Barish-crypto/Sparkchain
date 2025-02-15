def filter_proxies_by_ports(proxies, ports):
    filtered_proxies = []
    for proxy in proxies:
        for port in ports:
            if proxy.endswith(f":{port}"):
                filtered_proxies.append(proxy)
                break
    return filtered_proxies

with open('proxies55.txt', 'r') as f:
    proxies = f.readlines()

filtered_proxies = filter_proxies_by_ports(proxies, ['80', '8080', '3128'])

with open('filtered_proxies.txt', 'w') as f:
    for proxy in filtered_proxies:
        f.write(proxy)

