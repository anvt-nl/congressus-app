#!/usr/bin/env python3
import httpx
import sys
import json
import time

# Get current working directory of the script
working_directory = __file__.rsplit('/', 1)[0]
# print(f"Working directory: {working_directory}")

# Get scriptname
script_name = __file__.rsplit('/', 1)[-1].split('.')[0]

api_access_key = open(f'{working_directory}/../source/api-key-2.txt').read().strip()

# print(f"Using API key: #{api_access_key}#")

# Specify the event ID as argument
if len(sys.argv) != 2:
    print(f"Usage: {script_name}.py <event_id>")
    sys.exit(1)
event_id = sys.argv[1]

page = 1
next_page = True

headers = {'Authorization': f'Bearer {api_access_key}'}
url = f'https://api.congressus.nl/v30/events/{event_id}/participations'
data = []
while next_page:

    params = {'page_size': 100, 'page': page}

    resp = httpx.get(url, params=params, headers=headers, timeout=10)
    resp.raise_for_status()

    data += resp.json().get('data', [])
    next_page = resp.json().get('has_next', False)
    if next_page:
        page = resp.json().get('next_num', page + 1)
result = {'data': data,
            'total': len(data),
            'nr_pages': page,
            'event_id': event_id,
            'last_updated': time.strftime('%Y-%m-%d %H:%M:%S')
             }

with open(f'{working_directory}/{script_name}_{event_id}.json', 'w') as f:
    json.dump(result, f, indent=4)
print(f"Event data saved to {script_name}_{event_id}.json")

with open(f'{working_directory}/{script_name}_{event_id}.txt', 'w') as f:
    f.write(f'URL: {url}\n')
    f.write(f'Event ID: {event_id}\n')
    f.write(f'Params: {params}\n')
print(f"Event URL saved to {script_name}_{event_id}.txt")
next_page = result.get('has_next', False)
if next_page:
    page = result.get('next_num', page + 1)