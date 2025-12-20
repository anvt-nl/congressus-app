#!/usr/bin/env python3

import ast
import json

# with open('events2.json') as f:
with open('events.json') as f:
    data = f.read()
    
result = ast.literal_eval(data)
json_output = json.dumps(result, indent=4)
print(json_output)

# print(result.keys())
# print(len(result['data']))
# print(result['data'][2].keys())

# print(result)

# for event in result['data']:
#     print(f"Event ID: {event['id']}")
#     print(f"Event: {event['name']}")
#     print(f"  Start: {event['start']}")
#     print()