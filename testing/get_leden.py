#!/usr/bin/env python3
import httpx

working_directory = __file__.rsplit('/', 1)[0]
print(f"Working directory: {working_directory}")

api_access_key = open(f'{working_directory}/../api-key-2.txt').read().strip()

# headers = {'Authorization': 'Bearer {api_access_key}'}
# params = {}
# url = 'https://api.congressus.nl/v30'

# congreessus_api = httpx.Client(base_url=url, headers=headers)

# resp = congreessus_api.get('', params=params)
# resp.raise_for_status()

# result = resp.json()
# data = result['data']
# print (data)



import requests

print(f"Using API key: #{api_access_key}#")
headers = {'Authorization': f'Bearer {api_access_key}'}
params = {}
url = 'https://manager.congressus.nl/_api/v30/events?page=1&page_size=25&order=start%3Adesc'

resp = requests.get(url, params=params, headers=headers)
resp.raise_for_status()

result = resp.json()
data = result['data']