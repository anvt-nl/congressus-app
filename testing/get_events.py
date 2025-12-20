#!/usr/bin/env python3
import requests

# Get current working directory of the script
working_directory = __file__.rsplit('/', 1)[0]
# print(f"Working directory: {working_directory}")

api_access_key = open(f'{working_directory}/../api-key-2.txt').read().strip()

# print(f"Using API key: #{api_access_key}#")

headers = {'Authorization': f'Bearer {api_access_key}'}
params = {}
url = 'https://api.congressus.nl/v30/events'

resp = requests.get(url, params=params, headers=headers)
resp.raise_for_status()

result = resp.json()

print (result)
