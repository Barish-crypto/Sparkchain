import requests
import json

# URL đích
url = "https://proxy6.net/port-check"

# Headers từ request của bạn
headers = {
    "accept": "application/json, text/javascript, */*; q=0.01",
    "accept-encoding": "gzip, deflate, br, zstd",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "no-cache",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    "origin": "https://proxy6.net",
    "pragma": "no-cache",
    "priority": "u=1, i",
    "referer": "https://proxy6.net/port-check",
    "sec-ch-ua": '"Chromium";v="134", "Not:A-Brand";v="24", "Microsoft Edge";v="134"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0",
    "x-requested-with": "XMLHttpRequest"
}

# Cookie từ request
cookies = {
    "ref_url": "https%3A%2F%2Fproxy6.net%2F",
    "uId": "339920",
    "uPassword": "f838f174366f894d448fa6dbcbaadd1d",
    "_uId": "339920",
    "px_limit": "50",
    "lng": "en",
    "PHPSESSID": "422788bb2e4ee3725130430736510eb1",
    "order_count": "0",
    "npd": "no"
}

# Hàm đọc proxy từ file proxies.txt
def load_proxies(file_path="proxies.txt"):
    proxies_list = []
    try:
        with open(file_path, "r") as file:
            for line in file:
                line = line.strip()
                if line:
                    ip, port = line.split(":")
                    proxies_list.append({"ip": ip, "port": port})
        return proxies_list
    except FileNotFoundError:
        print(f"Không tìm thấy file {file_path}")
        return []
    except ValueError:
        print("Định dạng proxy trong file không đúng (phải là IP:PORT)")
        return []

# Hàm ghi proxy vào file ok.txt
def save_working_proxy(ip, port, file_path="ok.txt"):
    with open(file_path, "a") as file:
        file.write(f"{ip}:{port}\n")
    print(f"Đã ghi proxy {ip}:{port} vào {file_path}")

# Hàm xử lý response
def process_response(json_response, expected_ip, expected_port):
    try:
        ip = json_response.get("ip")
        result = json_response.get("result", {})
        
        if ip != expected_ip:
            print(f"Cảnh báo: IP trả về ({ip}) không khớp với IP gửi ({expected_ip})")
        
        for port, status in result.items():
            if port == expected_port:
                status_text = "Open" if status else "Closed"
                print(f"Port {port}: {status_text}")
                # Ghi proxy nếu cổng mở (bất kỳ cổng nào)
                if status:
                    save_working_proxy(ip, port)
            else:
                print(f"Cảnh báo: Cổng trả về ({port}) không khớp với cổng gửi ({expected_port})")
    except Exception as e:
        print(f"Lỗi xử lý response: {e}")

# Hàm parse JSON từ response bị hỏng
def parse_raw_response(raw_text):
    try:
        json_start = raw_text.index("{")
        json_str = raw_text[json_start:]
        return json.loads(json_str)
    except (ValueError, IndexError) as e:
        print(f"Lỗi parse JSON từ raw text: {e}")
        print("Raw Response:", raw_text)
        return None

# Đọc danh sách proxy từ file
proxies = load_proxies("proxies.txt")

# Kiểm tra từng proxy
for proxy in proxies:
    # Dữ liệu POST cho proxy hiện tại
    data = {
        "ip": proxy["ip"],
        "port": proxy["port"],
        "hash": "009c5aa54cbbbb74b7127dcc820a6eda",
        "form_id": "form-port-check"
    }

    # Gửi request POST
    try:
        response = requests.post(url, headers=headers, cookies=cookies, data=data, timeout=10)
        print(f"Proxy: {proxy['ip']}:{proxy['port']}")
        print("Status Code:", response.status_code)

        # Kiểm tra nội dung response
        if "application/json" in response.headers.get("content-type", ""):
            if response.text.strip():
                try:
                    json_response = response.json()
                except ValueError:
                    json_response = parse_raw_response(response.text)
                
                if json_response:
                    process_response(json_response, proxy["ip"], proxy["port"])
            else:
                print("Response rỗng, không có dữ liệu JSON để parse")
        else:
            print("Response không phải JSON:", response.text)

        print("-" * 50)

    except requests.exceptions.RequestException as e:
        print(f"Proxy: {proxy['ip']}:{proxy['port']} - Lỗi: {e}")
        print("-" * 50)