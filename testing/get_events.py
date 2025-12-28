#!/usr/bin/env python3
import httpx
import json
import time

# Get current working directory of the script
working_directory = __file__.rsplit('/', 1)[0]

# Get scriptname
script_name = __file__.rsplit('/', 1)[-1].split('.')[0]

# print(f"Working directory: {working_directory}")

api_access_key = open(f'{working_directory}/../api-key-2.txt').read().strip()

# print(f"Using API key: #{api_access_key}#")

has_next = True
headers = {'Authorization': f'Bearer {api_access_key}'}
params = {
    'page_size': 100,
    'page': 1
}
url = 'https://api.congressus.nl/v30/events'
data = []
while has_next:
    resp = httpx.get(url, params=params, headers=headers, timeout=10)
    resp.raise_for_status()

    data += resp.json().get('data', [])
    has_next = resp.json().get('has_next', False)
    if has_next:
        params['page'] = resp.json().get('next_num', params['page'] + 1)

result = {'data': data,
          'total': len(data),
          'nr_pages': params['page'],
          'last_updated': time.strftime('%Y-%m-%d %H:%M:%S')
         }

with open(f'{working_directory}/{script_name}.json', 'w') as f:
    json.dump(result, f, indent=4)
print(f"Event data saved to {script_name}.json")
with open(f'{working_directory}/{script_name}.txt', 'w') as f:
    f.write(f'URL: {url}\n')
    f.write(f'Params: {params}\n')
print(f"Event URL saved to {script_name}.txt")
