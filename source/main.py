#!/usr/bin/env python3

"""
This script retrieves all events from the Congressus API and caches it in a SQLite database.
It handles pagination to ensure all events are fetched.
Next to the events data it also collects the tickets sold for each event and the participation details for each ticket.

All this information will be available via API calls to this script via FastAPI:

API Endpoints:

GET /
    Redirects to /html/index.html

GET /html/
    Redirects to /html/index.html

GET /html/{page_name}
    Serves HTML pages from the html/ directory

GET /events
    Returns all events (cached unless refreshed)

GET /events/refresh
    Forces refresh and returns all events from Congressus API

GET /event/{event_id}
    Returns details for a specific event

GET /event/{event_id}/collect-tickets
    Collects tickets for a specific event

GET /participations/{event_id}
    Returns participation details for an event (cached unless refreshed)

GET /participations/{event_id}/refresh
    Forces refresh and returns participation details for an event

GET /ticket/{event_id}/{obj_id}
    Returns ticket details for a specific ticket

GET /ticket/{event_id}/{obj_id}/{new_status}
    Updates the status of a ticket and returns the result

All endpoints return JSON unless otherwise specified. Errors are returned with appropriate HTTP status codes and messages.
"""

import json
import os
import sqlite3
import time
from datetime import datetime, timedelta
from typing import Dict, List


import httpx
import fastapi
# from fastapi import Request
# from fastapi.responses import StreamingResponse


API_URL = "https://api.congressus.nl/v30"
API_KEY_PATH = "api-key-2.txt"
DB_PATH = os.getenv("CONGRESSUS_CACHE_DB", "/db/congressus_cache.db")
PAGE_SIZE = 100

# Get current working directory of the script
WORKING_DIRECTORY = __file__.rsplit("/", 1)[0]

# Get scriptname
SCRIPT_NAME = __file__.rsplit("/", 1)[-1].split(".")[0]
api_access_key = open(f"{WORKING_DIRECTORY}/{API_KEY_PATH}").read().strip()
headers = {"Authorization": f"Bearer {api_access_key}"}

app = fastapi.FastAPI()
# Expose via FastAPI

@app.get("/")
async def root() -> fastapi.responses.RedirectResponse:
    """
    Function to redirect to the main HTML dashboard page.
    """

    return fastapi.responses.RedirectResponse(url="/html/index.html")


@app.get("/html/")
async def html_root() -> fastapi.responses.RedirectResponse:
    """
    Function to redirect to the main HTML dashboard page.
    """

    return fastapi.responses.RedirectResponse(url="/html/index.html")


@app.get("/html/{page_name}")
async def html_page(page_name: str) -> fastapi.responses.HTMLResponse:
    """
    Function to serve HTML pages from the html/ directory.

    :param page_name: Description
    :type page_name: str
    """

    if page_name == "":
        page_name = "index.html"
    file_path = f"html/{page_name}"
    if os.path.exists(file_path):
        with open(file_path, "r", encoding="utf-8") as file:
            content = file.read()
        return fastapi.responses.HTMLResponse(status_code=200, content=content)
    return fastapi.responses.Response(status_code=404, content="Page not found")

@app.get("/events")
def read_events():
    log("Handling GET /events")
    return get_events(force_refresh=False)


@app.get("/events/refresh")
def refresh_events():
    log("Handling GET /events/refresh")
    return get_events(force_refresh=True)


@app.get("/event/{event_id}")
def read_event(event_id: str):
    log(f"Handling GET /event/{event_id}")
    return get_event(event_id)


@app.get("/event/{event_id}/collect-tickets")
def collect_tickets(event_id: str):
    log(f"Handling GET /event/{event_id}/collect-tickets")
    return collect_tickets_for_event(event_id)


@app.get("/participations/{event_id}")
def read_participations(event_id: str):
    log(f"Handling GET /participations/{event_id}")
    return get_participations(event_id, force_refresh=False)


@app.get("/participations/{event_id}/refresh")
def refresh_participations(event_id: str):
    log(f"Handling GET /participations/{event_id}/refresh")
    return get_participations(event_id, force_refresh=True)


@app.get("/ticket/{event_id}/{obj_id}")
def read_ticket(event_id: str, obj_id: str):
    log(f"Handling GET /ticket/{event_id}/{obj_id}")
    return get_ticket(event_id, obj_id)


@app.get("/ticket/{event_id}/{obj_id}/{new_status}")
def update_ticket(event_id: str, obj_id: str, new_status: str):
    log(f"Handling GET /ticket/{event_id}/{obj_id}/{new_status}")
    return do_update_ticket(event_id, obj_id, new_status)


def main():
    all_events = get_events(force_refresh=False)
    log(f"Total events fetched: {len(all_events)}")


def get_events(force_refresh: bool = False):

    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()

        # Create tables if they don't exist
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS events (
                event_id TEXT PRIMARY KEY,
                data TEXT,
                last_updated TEXT
            )
        """
        )

        # fetch all events from sqlite
        cursor.execute("SELECT event_id FROM events")
        existing_event_ids = {row[0] for row in cursor.fetchall()}
        if not existing_event_ids:
            log("No existing events in DB. Forcing refresh.")
            force_refresh = True

        if force_refresh:
            log("Fetching events from API...")
            has_next = True
            params = {"page_size": PAGE_SIZE, "page": 1}
            url = f"{API_URL}/events"
            events: List[Dict] = []

            while has_next:
                resp = httpx.get(url, params=params, headers=headers, timeout=10)
                resp.raise_for_status()

                events += resp.json().get("data", [])
                has_next = resp.json().get("has_next", False)
                if has_next:
                    params["page"] = resp.json().get("next_num", params["page"] + 1)

            log(f"Fetched {len(events)} events from API.")
            log("Storing events in DB...")

            # Store events in the database
            for event in events:
                event_id = event["id"]
                cursor.execute(
                    """
                    INSERT OR REPLACE INTO events (event_id, data, last_updated)
                    VALUES (?, ?, ?)
                """,
                    (event_id, json.dumps(event), time.strftime("%Y-%m-%d %H:%M:%S")),
                )
            conn.commit()
            log("Events stored in DB.")

            # Remove event IDs that are now in the database from existing_event_ids
            removed_events = 0
            for event_id in existing_event_ids:
                if event_id in [str(event["id"]) for event in events]:
                    continue
                removed_events += 1
                cursor.execute("DELETE FROM events WHERE event_id = ?", (event_id,))
            conn.commit()
            log(f"Removed {removed_events} obsolete events from DB.")
            participations = get_participations(
                [event["id"] for event in events], force_refresh=force_refresh
            )
            log(f"Participations: {json.dumps(participations)}")
        else:
            log("Loading events from DB...")
            events = []

            for row in cursor.execute("SELECT event_id, data FROM events"):
                events.append(json.loads(row[1]))
            log(f"Fetched {len(events)} events from DB.")

            for index, event in enumerate(events):
                start = event["start"]
                # Check if date start is max 1 day in the future, current day, or in the past
                log (start)
                today = time.strftime("%Y-%m-%d")
                start_dt = datetime.strptime(start, "%Y-%m-%dT%H:%M:%S")
                today_dt = datetime.strptime(today, "%Y-%m-%d")
                present_leden = 0
                present_vrijrijders = 0
                if start_dt <= today_dt + timedelta(days=1):
                    log(f"Event {event['id']} has started, is today, or is max 1 day in the future. Refreshing participations.")
                    get_participations(event["id"], force_refresh=False)
                    participations = get_participations(event["id"], force_refresh=False)
                    for participation in participations:
                        if participation.get("presence_count", 0) > 0:
                            if participation.get("member_id") is not None:
                                present_leden += 1
                            else:
                                present_vrijrijders += 1
                    log(f"Event {event['id']} - Present Leden: {present_leden}, Present Vrijrijders: {present_vrijrijders}")
                events[index]["present_leden"] = present_leden
                events[index]["present_vrijrijders"] = present_vrijrijders
    return filter_events(events)


def get_event(event_id: str):
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT data FROM events WHERE event_id = ?", (event_id,))
        row = cursor.fetchone()
    if row:
        return json.loads(row[0])
    return {"error": "Event not found"}


def filter_events(events_list: List[Dict]) -> List[Dict]:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    return_events = []
    for event in events_list:
        if event["published"] is False:
            continue
        leden_num_tickets = 0
        leden_sold_tickets = 0
        niet_leden_num_tickets = 0
        niet_leden_sold_tickets = 0
        log(f"Start: {event['start']}")
        log(f"Ticket types for event {event['id']}: {event['name']}")
        for tickets in event["ticket_types"]:
            if tickets["price"] == 0 and tickets["num_tickets"] is not None:
                leden_num_tickets += tickets.get("num_tickets", 0)
            elif tickets["price"] > 39 and tickets["num_tickets"] is not None:
                niet_leden_num_tickets += tickets.get("num_tickets", 0)
        cursor.execute(
            "SELECT data FROM participations WHERE event_id = ?", (event["id"],)
        )
        participations = [json.loads(row[0]) for row in cursor.fetchall()]
        if participations != "[]":
            for participation in participations:
                if participation["status"] != "approved":
                    continue
                if participation["member_id"] is not None:
                    leden_sold_tickets += 1
                elif participation["member_id"] is None:
                    niet_leden_sold_tickets += 1
        log(
            f"Event {event['id']} - Leden: {leden_sold_tickets}/{leden_num_tickets}, Niet leden: {niet_leden_sold_tickets}/{niet_leden_num_tickets}"
        )
        return_events.append(
            {
                "id": event["id"],
                "name": event["name"],
                "start": event["start"],
                "leden_num_tickets": leden_num_tickets,
                "leden_sold_tickets": leden_sold_tickets,
                "niet_leden_num_tickets": niet_leden_num_tickets,
                "niet_leden_sold_tickets": niet_leden_sold_tickets,
                "present_leden": event.get("present_leden", 0),
                "present_vrijrijders": event.get("present_vrijrijders", 0),
            }
        )
    return return_events


def get_participations(event_id: int, force_refresh: bool = False):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Fetch all participations from sqlite
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS participations (
            participation_id TEXT PRIMARY KEY,
            event_id TEXT,
            data TEXT,
            last_updated TEXT
        )
    """
    )

    cursor.execute(
        "SELECT participation_id, data, last_updated FROM participations WHERE event_id = ?",
        (event_id,),
    )

    existing_participation_ids = {row[0]: (row[1], row[2]) for row in cursor.fetchall()}
    if not existing_participation_ids:
        log(f"No existing participations for event {event_id} in DB. Forcing refresh.")
        force_refresh = True

    if force_refresh:
        log(f"Fetching participations for event {event_id} from API...")

        has_next = True
        params = {"page_size": PAGE_SIZE, "page": 1}
        url = f"{API_URL}/events/{event_id}/participations"
        participations: List[Dict] = []

        while has_next:
            resp = httpx.get(url, params=params, headers=headers, timeout=10)
            resp.raise_for_status()

            participations += resp.json().get("data", [])
            has_next = resp.json().get("has_next", False)
            if has_next:
                params["page"] = resp.json().get("next_num", params["page"] + 1)

        log(
            f"Fetched {len(participations)} participations from API for event {event_id}."
        )
        log("Storing participations in DB...")

        for participation in participations:
            # Strip whitespace from all string values in participation dict
            def strip_values(obj):
                if isinstance(obj, dict):
                    return {k: strip_values(v) for k, v in obj.items()}
                elif isinstance(obj, list):
                    return [strip_values(i) for i in obj]
                elif isinstance(obj, str):
                    return obj.strip()
                else:
                    return obj

            participation = strip_values(participation)
            participation_id = participation["id"]
            cursor.execute(
                """
                INSERT OR REPLACE INTO participations (participation_id, event_id, data, last_updated)
                VALUES (?, ?, ?, ?)
            """,
                (
                    participation_id,
                    event_id,
                    json.dumps(participation),
                    time.strftime("%Y-%m-%d %H:%M:%S"),
                ),
            )
        conn.commit()
        log("Participations stored in DB.")

        # Remove participation IDs that are now in the database from existing_participation_ids
        removed_participations = 0
        for participation_id in existing_participation_ids:
            if participation_id in [
                str(participation["id"]) for participation in participations
            ]:
                continue
            removed_participations += 1
            cursor.execute(
                "DELETE FROM participations WHERE participation_id = ?",
                (participation_id,),
            )
        conn.commit()
        log(f"Removed {removed_participations} obsolete participations from DB.")
    else:
        log(f"Loading participations for event {event_id} from DB...")
        participations = []
        for row in cursor.execute(
            "SELECT participation_id, data, last_updated FROM participations WHERE event_id = ?",
            (event_id,),
        ):
            participations.append(json.loads(row[1]))
        log(f"Fetched {len(participations)} participations from DB for event {event_id}.")

    try:
        cursor.execute("SELECT data FROM tickets WHERE event_id = ?", (event_id,))
    except sqlite3.OperationalError:
        log("Tickets table does not exist yet.")
        tickets = []
    else:
        tickets = [json.loads(row[0]) for row in cursor.fetchall()]
    log(f"Fetched {len(tickets)} tickets from DB for event {event_id}.")
    for participation in participations:
        participation_pressence = 0
        participation_tickets = None
        for ticket in tickets:
            if ticket.get("id") == participation.get("id"):
                participation_tickets = len(ticket.get("tickets", []))
                for t in ticket.get("tickets", []):
                    if t.get("status_presence") == "present":
                        participation_pressence += 1
        participation["presence_count"] = participation_pressence
        participation["tickets"] = participation_tickets
    conn.close()

    # Filter fields to reduce payload size
    filtered_participations = []
    allowed_fields = ["id", "member_id", "status", "addressee", "email", "presence_count", "tickets"]
    for p in participations:
        filtered_participations.append({k: p.get(k) for k in allowed_fields})

    return filtered_participations


def get_ticket(event_id: str, obj_id: str, refresh: bool = False):
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS tickets (
                obj_id TEXT PRIMARY KEY,
                event_id TEXT,
                data TEXT,
                last_updated TEXT
            )
        """
        )

        cursor.execute(
            "SELECT data, last_updated FROM tickets WHERE obj_id = ? AND event_id = ?", (obj_id, event_id)
        )

        # Test the number of rows returned
        rows = cursor.fetchall()
        log(f"Rows returned: {len(rows)}")
        if len(rows) == 0:
            log("Object not found in DB, fetching from API...")
            refresh = True
        else:
            log("Object found in DB.")
            data, last_updated = rows[0]
            data = json.loads(data)
            log(f"Object last updated at {last_updated}")
        if refresh:
            log(f"Fetching object {obj_id} for event {event_id} from API...")
                
            # https://api.congressus.nl/v30/events/{event_id}/participations/{obj_id}'
            url = f"{API_URL}/events/{event_id}/participations/{obj_id}"
            resp = httpx.get(url, headers=headers, timeout=10)
            resp.raise_for_status()

            data = resp.json()
            log("Storing ticket in DB...")
            cursor.execute(
                """
                INSERT OR REPLACE INTO tickets (obj_id, event_id, data, last_updated)
                VALUES (?, ?, ?, ?)
            """,
                (
                    obj_id,
                    event_id,
                    json.dumps(data),
                    time.strftime("%Y-%m-%d %H:%M:%S"),
                ),
            )
            conn.commit()
    return filter_tickets(data)


def filter_tickets(tickets_list: Dict) -> Dict:
    # return(tickets_list)
    tickets = []
    for ticket in tickets_list.get("tickets", []):
        tickets.append(
            {
                "status_presence": ticket.get("status_presence", ""),
                "ticket_type": ticket.get("ticket_type", {}).get("name", ""),
                "price": ticket.get("ticket_type", {}).get("price", 0),
                "id": ticket.get("id", "")
            }
        )
        
    return_list = {
        "id": tickets_list.get("id", ""),
        "addressee": tickets_list.get("addressee", ""),
        "email": tickets_list.get("email", ""),
        "event_name": tickets_list.get("event", "").get("name", ""),
        "event_date": tickets_list.get("event", "").get("start", ""),
        "status": tickets_list.get("status", ""),
        "tickets": tickets
    }
    return return_list


def do_update_ticket(event_id: str, obj_id: str, new_status: str):
    log(f"New status: {new_status}")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT data FROM tickets WHERE obj_id = ? AND event_id = ?
    """,
        (obj_id, event_id)
    )

    row = cursor.fetchone()
    if not row:
        conn.close()
        return {"status": "error", "message": f"Ticket {obj_id} not found."}
    
    json_data = json.loads(row[0])
    for ticket in json_data.get("tickets", []):
        if ticket["status_presence"] == new_status:
            log(f"Ticket {ticket['id']} already has status_presence {new_status}. No update needed.")
            return {"status": "success", "message": f"Ticket {obj_id} already has status_presence {new_status}."}
    
    # https://api.congressus.nl/v30/events/{event_id}/participations/{obj_id}/set-presence
    url = f"{API_URL}/events/{event_id}/participations/{obj_id}/set-presence"
    log(f"Updating ticket {obj_id} to status_presence {new_status}...")
    payload = {"status_presence": new_status}
    resp = httpx.post(url, headers=headers, json=payload, timeout=10)
    resp.raise_for_status()

    conn.close()
    if resp.status_code != 204:
        log(f"Failed to update ticket {obj_id}. Status code: {resp.status_code}")
        return {"status": "error", "message": f"Failed to update ticket {obj_id}."}
    
    log(f"Ticket {obj_id} updated successfully in API. Updating local DB...")
    return get_ticket(event_id, obj_id, refresh=True)


def collect_tickets_for_event(event_id: str):
    participations = get_participations(event_id, force_refresh=True)
    log(f"Collected {len(participations)} participations for event {event_id}.")

    refreshed_count = 0
    for participation in participations:
        obj_id = participation["id"]
        if participation.get("status") != "approved":
            log(f"Skipping participation {obj_id} with status {participation.get('status')}.")
            continue

        ticket_data = get_ticket(event_id, obj_id, refresh=False)
        if ticket_data.get("tickets") is not None and len(ticket_data.get("tickets")) > 0 and ticket_data["tickets"][0].get("status_presence") is not None and ticket_data["tickets"][0]["status_presence"] == "present":
            log(f"Ticket data for participation {obj_id} already exists and is present. Skipping refresh.")
            continue
        ticket_data = get_ticket(event_id, obj_id, refresh=True)
        refreshed_count += 1
        log(f"Collected ticket data for participation {obj_id} for event {event_id}.")
    log(f"Refreshed ticket data for {refreshed_count} participations for event {event_id}.")
    return {"status": "success", "message": f"Collected tickets for event {event_id}."}


def log(message: str = ""):
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {message}")


if __name__ == "__main__":
    main()
