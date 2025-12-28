#!/usr/bin/env python3

import sqlite3
# import json

DB_PATH = 'congressus_cache.db'

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = cursor.fetchall()
print("Tables in the database:")
for table in tables:
    print(f"- {table[0]}")

for table_name in [table[0] for table in tables]:
    cursor.execute(f"PRAGMA table_info({table_name});")
    columns = cursor.fetchall()
    print(f"\nColumns in table '{table_name}':")
    # Validate table_name to prevent SQL injection
    if table_name.isidentifier() and table_name in [t[0] for t in tables]:
        query = f'SELECT COUNT(*) FROM "{table_name}";'
        entries = cursor.execute(query).fetchone()[0]
    else:
        raise ValueError(f"Invalid table name: {table_name}")
    print(f"Total entries: {entries}")
    for column in columns:
        print(f"  - {column[1]} ({column[2]})")

for participation_id, event_id, data, last_updated in cursor.execute("SELECT participation_id, event_id, data, last_updated FROM participations;"):
    print(f"Participation ID: {participation_id}, Event ID: {event_id}, Data: {data}, Last Updated: {last_updated}")

conn.close()


