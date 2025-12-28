#!/usr/bin/env python3
import httpx
import sys
import json
import time

# Get current working directory of the script
working_directory = __file__.rsplit('/', 1)[0]

# Get scriptname
script_name = __file__.rsplit('/', 1)[-1].split('.')[0]

# print(f"Working directory: {working_directory}")

api_access_key = open(f'{working_directory}/../api-key-2.txt').read().strip()

# print(f"Using API key: #{api_access_key}#")

# Specify the event ID as argument
if len(sys.argv) != 3:
    print("Usage: get_event.py <event_id> <ticket_id>")
    sys.exit(1)
event_id = sys.argv[1]
obj_id = sys.argv[2]


headers = {'Authorization': f'Bearer {api_access_key}'}
url = f'https://api.congressus.nl/v30/events/{event_id}/participations/{obj_id}'

params = {}

resp = httpx.get(url, params=params, headers=headers, timeout=10)
resp.raise_for_status()

result = resp.json()
result['last_updated'] = time.strftime('%Y-%m-%d %H:%M:%S')
# print (result)

with open(f'{working_directory}/{script_name}_{event_id}-{obj_id}.json', 'w') as f:
    json.dump(result, f, indent=4)
print(f"Event data saved to {script_name}_{event_id}-{obj_id}.json")

with open(f'{working_directory}/{script_name}_{event_id}-{obj_id}.txt', 'w') as f:
    f.write(f'URL: {url}\n')
    f.write(f'Event ID: {event_id}\n')
    f.write(f'Params: {params}\n')
print(f"Event URL saved to {script_name}_{event_id}-{obj_id}.txt")
