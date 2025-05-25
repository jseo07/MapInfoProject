import requests 


url = "https://api.bigvalue.co.kr/api/bv-platform/land-owner/pnu"
headers = {
    "Authorization": "Bearer YOUR_JWT_TOKEN",   # ← 발급받은 JWT 토큰으로 교체
    "Content-Type": "application/json"
}
json_data = {
    "REQUEST_DATA": [
        { "pnu": "4420033025109590001" }
    ]
}

response = requests.post(url=url, json=json_data, headers=headers)
print(response.json())