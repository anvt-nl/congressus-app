#!/usr/bin/env python3
import requests
import sys
import json

# Get current working directory of the script
working_directory = __file__.rsplit('/', 1)[0]
# print(f"Working directory: {working_directory}")

api_access_key = open(f'{working_directory}/../api-key-2.txt').read().strip()

# print(f"Using API key: #{api_access_key}#")

# Specify the event ID as argument
if len(sys.argv) != 2:
    print("Usage: get_event.py <event_id>")
    sys.exit(1)
event_id = sys.argv[1]


page = 1
next_page = True


headers = {'Authorization': f'Bearer {api_access_key}'}
url = f'https://api.congressus.nl/v30/events/{event_id}/participations'
while next_page:

    params = {'page_size': 50, 'page': page}

    resp = requests.get(url, params=params, headers=headers, timeout=10)
    resp.raise_for_status()

    result = resp.json()

    # print (result)

    with open(f'{working_directory}/event_{event_id}-{page}.json', 'w') as f:
        json.dump(result, f, indent=4)
    print(f"Event data saved to event_{event_id}-{page}.json")

    with open(f'{working_directory}/event_{event_id}-{page}.txt', 'w') as f:
        f.write(f'URL: {url}\n')
        f.write(f'Event ID: {event_id}\n')
        f.write(f'Params: {params}\n')
    print(f"Event URL saved to event_{event_id}-{page}.txt")
    next_page = result.get('has_next', False)
    if next_page:
        page = result.get('next_num', page + 1)