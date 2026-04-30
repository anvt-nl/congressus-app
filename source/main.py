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

import concurrent.futures
import json
import os
import pathlib
import sqlite3
import time
from datetime import datetime, timedelta
from typing import Dict, List

import fastapi
import httpx
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

# from fastapi import Request
# from fastapi.responses import StreamingResponse

API_URL = "https://api.congressus.nl/v30"
API_KEY_PATH = "api-key-2.txt"
DB_PATH = os.getenv("CONGRESSUS_CACHE_DB", "/db/congressus_cache.db")
PAGE_SIZE = 100
MAX_SCAN_DAYS = int(os.getenv("MAX_SCAN_DAYS", 7))

# Get current working directory of the script
WORKING_DIRECTORY = pathlib.Path(__file__).parent

# Get scriptname
SCRIPT_NAME = pathlib.Path(__file__).stem

api_access_key = open(f"{WORKING_DIRECTORY}/{API_KEY_PATH}").read().strip()
headers = {"Authorization": f"Bearer {api_access_key}"}

app = fastapi.FastAPI()
app.add_middleware(GZipMiddleware, minimum_size=1000)
# CORS: Allow all origins (safe for local dev, restrict in prod if nodig)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
HTTP_CLIENT = httpx.Client(headers=headers, timeout=10)


def normalize_kenteken(kenteken: str) -> str:
    """
    Normalize a Dutch license plate (kenteken) to standard format.
    Example: "AB12CD" -> "AB-12-CD"
    """
    kenteken = kenteken.upper().replace(" ", "")
    if "-" not in kenteken:
        # Split kenteken when changing from letters to digits
        new_kenteken = ""
        for i in range(len(kenteken)):
            if i > 0 and kenteken[i].isalpha() != kenteken[i - 1].isalpha():
                new_kenteken += "-"
            new_kenteken += kenteken[i]
        kenteken = new_kenteken
        if len(kenteken) == 7 and kenteken.count("-") == 1:
            kenteken_split = kenteken.split("-")
            if len(kenteken_split[0]) == 2 and len(kenteken_split[1]) == 4:
                kenteken_split[1] = kenteken_split[1][:2] + "-" + kenteken_split[1][2:]
            elif len(kenteken_split[0]) == 4 and len(kenteken_split[1]) == 2:
                kenteken_split[0] = kenteken_split[0][:2] + "-" + kenteken_split[0][2:]
            kenteken = kenteken_split[0] + "-" + kenteken_split[1]
    return kenteken


def init_db():
    with sqlite3.connect(DB_PATH, timeout=30) as conn:
        cursor = conn.cursor()
        # Enable WAL mode for better concurrency and performance
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS events (
                event_id TEXT PRIMARY KEY,
                data TEXT,
                last_updated TEXT
            )
        """
        )
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
            "CREATE INDEX IF NOT EXISTS idx_participations_event_id ON participations(event_id)"
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS tickets (
                obj_id TEXT PRIMARY KEY,
                event_id TEXT,
                data TEXT,
                last_updated TEXT,
                access_key TEXT
            )
        """
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_tickets_event_id ON tickets(event_id)"
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS kentekens (
                id TEXT PRIMARY KEY,
                kenteken TEXT
            )
        """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS apk_status (
                kenteken TEXT PRIMARY KEY,
                vervaldatum_apk TEXT,
                checked_at TEXT,
                merk TEXT,
                handelsbenaming TEXT
            )
        """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS members (
                member_id TEXT PRIMARY KEY,
                data TEXT,
                last_updated TEXT
            )
        """
        )
        conn.commit()


# Initialize DB on startup
init_db()


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


@app.get("/admin/tables")
def get_tables():
    """
    Get list of manageable tables in the database.
    """
    return ["events", "participations", "tickets", "kentekens", "apk_status", "members"]


@app.post("/admin/clear-table/{table_name}")
def clear_table(table_name: str):
    """
    Clear all records from a specific table.
    """
    allowed_tables = [
        "events",
        "participations",
        "tickets",
        "kentekens",
        "apk_status",
        "members",
    ]
    if table_name not in allowed_tables:
        return fastapi.responses.JSONResponse(
            status_code=400,
            content={"status": "error", "message": f"Invalid table name: {table_name}"},
        )

    log(f"Admin: Clearing table {table_name}")
    try:
        with sqlite3.connect(DB_PATH, timeout=30) as conn:
            cursor = conn.cursor()
            cursor.execute(f"DELETE FROM {table_name}")
            conn.commit()
        return {
            "status": "success",
            "message": f"Table {table_name} cleared successfully.",
        }
    except Exception as e:
        log(f"Error clearing table {table_name}: {str(e)}")
        return fastapi.responses.JSONResponse(
            status_code=500,
            content={"status": "error", "message": f"Error clearing table: {str(e)}"},
        )


@app.get("/ticket/by-access-key/{access_key}")
def get_ticket_by_access_key(access_key: str):
    """
    Look up a ticket by its access_key (from QR code).
    Returns event_id and obj_id (participation ID) to navigate to the ticket page.
    """
    with sqlite3.connect(DB_PATH, timeout=30) as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT event_id, obj_id FROM tickets WHERE access_key = ?", (access_key,)
        )
        row = cursor.fetchone()
        if row:
            return {"event_id": row[0], "obj_id": row[1]}
        else:
            return fastapi.responses.JSONResponse(
                status_code=404,
                content={"message": f"Ticket not found for {access_key}"},
            )


@app.get("/events")
def read_events():
    log("Handling GET /events")
    return get_events(force_refresh=False)


@app.get("/events/refresh")
def refresh_events(background_tasks: fastapi.BackgroundTasks):
    log("Handling GET /events/refresh (Background)")
    background_tasks.add_task(get_events, force_refresh=True)
    return {"status": "accepted", "message": "Event refresh started in background"}


@app.get("/event/{event_id}")
def read_event(event_id: str):
    log(f"Handling GET /event/{event_id}")
    return get_event(event_id)


@app.get("/event/{event_id}/collect-tickets")
def collect_tickets(event_id: str, background_tasks: fastapi.BackgroundTasks):
    log(f"Handling GET /event/{event_id}/collect-tickets (Background)")
    background_tasks.add_task(collect_tickets_for_event, event_id)
    return {"status": "accepted", "message": "Ticket collection started in background"}


@app.get("/participations/{event_id}")
def read_participations(event_id: str):
    log(f"Handling GET /participations/{event_id}")
    return get_participations(event_id, force_refresh=False)


@app.get("/participations/{event_id}/refresh")
def refresh_participations(event_id: str, background_tasks: fastapi.BackgroundTasks):
    log(f"Handling GET /participations/{event_id}/refresh (Background)")
    background_tasks.add_task(get_participations, event_id, force_refresh=True)
    return {
        "status": "accepted",
        "message": "Participation refresh started in background",
    }


@app.get("/scan-ticket/{event_id}/{obj_id}")
def scan_ticket(event_id: str, obj_id: str):
    log(f"Handling GET /scan-ticket/{event_id}/{obj_id}")
    ticket_data = read_ticket(event_id, obj_id, refresh=True)
    log(json.dumps(ticket_data, indent=4))
    event_date_str = ticket_data.get("event_date")
    # only allow scanning is event date differs max 7 days from current date
    if event_date_str:
        event_date = datetime.strptime(event_date_str, "%Y-%m-%dT%H:%M:%S")
        if (event_date - datetime.now()).days > 3 or (
            datetime.now() - event_date
        ).days > MAX_SCAN_DAYS:
            ticket_data["scan"] = (
                f"Scannen niet toegestaan: evenement is meer dan {MAX_SCAN_DAYS} dagen geleden of 3 dagen in de toekomst"
            )
            return ticket_data
    if ticket_data.get("member_id") is not None:
        members = get_members()
        member_info = members.get(str(ticket_data["member_id"]))
        if validate_member_data(
            member_info["name"], member_info["member_to"], event_date_str
        ):
            log(f"Member validation succeeded for participation {obj_id}")
        else:
            ticket_data["scan"] = f"Lidmaatschap niet geldig op {event_date_str[:10]}"
            return ticket_data
    if ticket_data.get("tickets"):
        for ticket in ticket_data["tickets"]:
            if ticket.get("status_presence") == "present":
                ticket_data["scan"] = "Ticket is al gescand"
                break
        else:
            log(f"Handling GET /ticket/{event_id}/{obj_id}/present")
            updated_ticket_data = do_update_ticket(event_id, obj_id, "present")
            if updated_ticket_data.get("status") == "error":
                ticket_data["scan"] = "Fout bij scannen: " + updated_ticket_data.get(
                    "message", "onbekende fout"
                )
            else:
                ticket_data = updated_ticket_data
                ticket_data["scan"] = "OK"
    else:
        ticket_data["scan"] = "Ticket is niet beschikbaar"
    return ticket_data


@app.get("/ticket/{event_id}/{obj_id}")
def read_ticket(event_id: str, obj_id: str, refresh: bool = False):
    log(f"Handling GET /ticket/{event_id}/{obj_id}")
    ticket_data = get_ticket(event_id, obj_id, refresh=refresh)

    # Add APK data if kenteken exists
    with sqlite3.connect(DB_PATH, timeout=30) as conn:
        cursor = conn.cursor()
        # Get kenteken for this participation
        cursor.execute("SELECT kenteken FROM kentekens WHERE id = ?", (obj_id,))
        kenteken_row = cursor.fetchone()

        if kenteken_row:
            kenteken = kenteken_row[0]
            ticket_data["kenteken"] = kenteken

            # Get APK status
            cursor.execute(
                "SELECT vervaldatum_apk, checked_at, merk, handelsbenaming FROM apk_status WHERE kenteken = ?",
                (kenteken,),
            )
            apk_row = cursor.fetchone()

            if apk_row:
                ticket_data["apk_status"] = {
                    "vervaldatum_apk": apk_row[0],
                    "checked_at": apk_row[1],
                    "merk": apk_row[2],
                    "handelsbenaming": apk_row[3],
                }
    return ticket_data


@app.get("/ticket/{event_id}/{obj_id}/{new_status}")
def update_ticket(event_id: str, obj_id: str, new_status: str):
    log(f"Handling GET /ticket/{event_id}/{obj_id}/{new_status}")
    return do_update_ticket(event_id, obj_id, new_status)


@app.get("/members")
def get_members_online():
    members = get_members()
    return members


@app.get("/kentekens")
def get_kentekens():
    """
    Get all kentekens from the database
    """
    log("Handling GET /kentekens")
    with sqlite3.connect(DB_PATH, timeout=30) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, kenteken FROM kentekens")
        results = [{"id": row[0], "kenteken": row[1]} for row in cursor.fetchall()]
    return results


@app.post("/check-apk/{event_id}")
def check_apk_status(event_id: str, background_tasks: fastapi.BackgroundTasks):
    """
    Check APK status for all valid Dutch license plates for an event.
    Runs as background task.
    """
    log(f"Handling POST /check-apk/{event_id}")
    background_tasks.add_task(do_check_apk_status, event_id)
    return {"status": "accepted", "message": "APK status check started in background"}


@app.get("/apk-status/{event_id}")
def get_apk_status(event_id: str):
    """
    Get APK status for all kentekens associated with an event
    """
    log(f"Handling GET /apk-status/{event_id}")

    with sqlite3.connect(DB_PATH, timeout=30) as conn:
        cursor = conn.cursor()

        # Get all kentekens for participations in this event
        cursor.execute(
            """
            SELECT k.id, k.kenteken, a.vervaldatum_apk, a.checked_at, a.merk, a.handelsbenaming
            FROM kentekens k
            LEFT JOIN apk_status a ON k.kenteken = a.kenteken
            WHERE k.id IN (
                SELECT participation_id FROM participations WHERE event_id = ?
            )
        """,
            (event_id,),
        )

        results = []
        for row in cursor.fetchall():
            results.append(
                {
                    "participation_id": row[0],
                    "kenteken": row[1],
                    "vervaldatum_apk": row[2],
                    "checked_at": row[3],
                    "merk": row[4],
                    "handelsbenaming": row[5],
                }
            )

    return results


def get_events(force_refresh: bool = False):

    with sqlite3.connect(DB_PATH, timeout=30) as conn:
        cursor = conn.cursor()
        # Table creation moved to init_db

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
                # Use global client
                resp = HTTP_CLIENT.get(url, params=params)
                resp.raise_for_status()
                resp_data = resp.json()

                events += resp_data.get("data", [])
                has_next = resp_data.get("has_next", False)
                if has_next:
                    params["page"] = resp_data.get("next_num", params["page"] + 1)

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
            fetched_event_ids = {str(event["id"]) for event in events}
            removed_events = 0
            for event_id in existing_event_ids:
                if event_id in fetched_event_ids:
                    continue
                removed_events += 1
                cursor.execute("DELETE FROM events WHERE event_id = ?", (event_id,))
            conn.commit()
            log(f"Removed {removed_events} obsolete events from DB.")
            participations = []
            for event in events:
                p = get_participations(event["id"], force_refresh=force_refresh)
                participations.extend(p)
            log(f"Total participations fetched: {len(participations)}")
        else:
            log("Loading events from DB...")
            events = []

            for row in cursor.execute("SELECT event_id, data FROM events"):
                events.append(json.loads(row[1]))
            log(f"Fetched {len(events)} events from DB.")

            for index, event in enumerate(events):
                start = event["start"]
                # Check if date start is max 1 day in the future, current day, or in the past
                log(start)
                today = time.strftime("%Y-%m-%d")
                start_dt = datetime.strptime(start, "%Y-%m-%dT%H:%M:%S")
                today_dt = datetime.strptime(today, "%Y-%m-%d")
                present_leden = 0
                present_vrijrijders = 0

                # Fetch participations from DB to calculate presence counts for all events
                participations = get_participations(event["id"], force_refresh=False)
                for participation in participations:
                    if participation.get("presence_count", 0) > 0:
                        if participation.get("member_id") is not None:
                            present_leden += 1
                        else:
                            present_vrijrijders += 1

                if start_dt <= today_dt + timedelta(days=1):
                    log(
                        f"Event {event['id']} is today or near. (Counts: L={present_leden}, V={present_vrijrijders})"
                    )

                events[index]["present_leden"] = present_leden
                events[index]["present_vrijrijders"] = present_vrijrijders
    return filter_events(events)


def get_event(event_id: str):
    with sqlite3.connect(DB_PATH, timeout=30) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT data FROM events WHERE event_id = ?", (event_id,))
        row = cursor.fetchone()
    if row:
        return json.loads(row[0])
    return {"error": "Event not found"}


def filter_events(events_list: List[Dict]) -> List[Dict]:
    with sqlite3.connect(DB_PATH, timeout=30) as conn:
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
            for participation in participations:
                if participation["status"] != "approved":
                    continue
                if participation["member_id"] is not None:
                    leden_sold_tickets += 1
                else:
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
    with sqlite3.connect(DB_PATH, timeout=30) as conn:
        cursor = conn.cursor()

        cursor.execute(
            "SELECT participation_id, data, last_updated FROM participations WHERE event_id = ?",
            (event_id,),
        )

        existing_participation_ids = {
            row[0]: (row[1], row[2]) for row in cursor.fetchall()
        }
        if not existing_participation_ids:
            log(
                f"No existing participations for event {event_id} in DB. Forcing refresh."
            )
            force_refresh = True

        if force_refresh:
            log(f"Fetching participations for event {event_id} from API...")

            has_next = True
            params = {"page_size": PAGE_SIZE, "page": 1}
            url = f"{API_URL}/events/{event_id}/participations"
            participations: List[Dict] = []

            while has_next:
                resp = HTTP_CLIENT.get(url, params=params)
                resp.raise_for_status()
                resp_data = resp.json()

                participations += resp_data.get("data", [])
                has_next = resp_data.get("has_next", False)
                if has_next:
                    params["page"] = resp_data.get("next_num", params["page"] + 1)

            log(
                f"Fetched {len(participations)} participations from API for event {event_id}."
            )
            log("Storing participations in DB...")

            for participation in participations:
                # Strip whitespace from all string values in participation dict

                print(participation)
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
            fetched_participation_ids = {str(p["id"]) for p in participations}
            removed_participations = 0
            for participation_id in existing_participation_ids:
                if participation_id in fetched_participation_ids:
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
            log(
                f"Fetched {len(participations)} participations from DB for event {event_id}."
            )

        try:
            cursor.execute("SELECT data FROM tickets WHERE event_id = ?", (event_id,))
        except sqlite3.OperationalError:
            log("Tickets table does not exist yet.")
            tickets = []
        else:
            tickets = [json.loads(row[0]) for row in cursor.fetchall()]
        log(f"Fetched {len(tickets)} tickets from DB for event {event_id}.")

        # Fetch kentekens from database
        cursor.execute("SELECT id, kenteken FROM kentekens")
        kentekens_db = {row[0]: row[1] for row in cursor.fetchall()}

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
            participation["kenteken"] = kentekens_db.get(
                str(participation.get("id")), ""
            )

    # Filter fields to reduce payload size
    members = get_members()
    filtered_participations = []
    allowed_fields = [
        "id",
        "member_id",
        "status",
        "addressee",
        "email",
        "presence_count",
        "tickets",
        "kenteken",
    ]
    event_date_str = get_event(event_id).get("start")
    for p in participations:
        filtered_participations.append({k: p.get(k) for k in allowed_fields})
        member_id = str(p.get("member_id")) if p.get("member_id") is not None else None
        if member_id is not None:
            member_info = members.get(member_id)
            member_to_date = member_info.get("member_to") if member_info else None
            member_type = member_info.get("name", None) if member_info else None
            filtered_participations[-1]["lid_valid"] = validate_member_data(
                member_type, member_to_date, event_date_str
            )
    return filtered_participations


def get_ticket(event_id: str, obj_id: str, refresh: bool = False):
    with sqlite3.connect(DB_PATH, timeout=30) as conn:
        cursor = conn.cursor()

        cursor.execute(
            "SELECT data, last_updated FROM tickets WHERE obj_id = ? AND event_id = ?",
            (obj_id, event_id),
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
            resp = HTTP_CLIENT.get(url)
            resp.raise_for_status()

            data = resp.json()
            log("Storing ticket in DB...")
            # Use access_key from the first ticket if available
            if data.get("tickets") and len(data.get("tickets")) > 0:
                access_key = data["tickets"][0].get("access_key")
            else:
                access_key = data.get("access_key")
            # Extract kenteken from ticket form entry data
            extracted_kenteken = None
            if data.get("tickets"):
                for ticket in data["tickets"]:
                    form_data = ticket.get("form_entry_data", {})
                    # Check for member and non-member kenteken fields
                    for field in ["custom_form_field_38585", "custom_form_field_36056"]:
                        if form_data.get(field) and isinstance(form_data[field], str):
                            extracted_kenteken = form_data[field]
                            break
                    if extracted_kenteken:
                        break

            if extracted_kenteken:
                try:
                    normalized = normalize_kenteken(str(extracted_kenteken))
                    log(f"Extracted kenteken {normalized} for participation {obj_id}")
                    cursor.execute(
                        "INSERT OR REPLACE INTO kentekens (id, kenteken) VALUES (?, ?)",
                        (obj_id, normalized),
                    )
                except Exception as e:
                    log(f"Error extracting kenteken: {str(e)}")

            cursor.execute(
                """
                INSERT OR REPLACE INTO tickets (obj_id, event_id, data, last_updated, access_key)
                VALUES (?, ?, ?, ?, ?)
            """,
                (
                    obj_id,
                    event_id,
                    json.dumps(data),
                    time.strftime("%Y-%m-%d %H:%M:%S"),
                    access_key,
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
                "id": ticket.get("id", ""),
                "ticket_qrcode": ticket.get("ticket_qrcode", ""),
                "access_key": ticket.get("access_key", ""),
            }
        )

    return_list = {
        "id": tickets_list.get("id", ""),
        "member_id": tickets_list.get("member_id", None),
        "addressee": tickets_list.get("addressee", ""),
        "email": tickets_list.get("email", ""),
        "event_name": tickets_list.get("event", "").get("name", ""),
        "event_date": tickets_list.get("event", "").get("start", ""),
        "status": tickets_list.get("status", ""),
        "tickets": tickets,
    }
    return return_list


def do_update_ticket(event_id: str, obj_id: str, new_status: str):
    log(f"New status: {new_status}")
    ticket_data = get_ticket(event_id, obj_id, refresh=True)
    if not ticket_data.get("tickets"):
        return {"status": "error", "message": f"Ticket {obj_id} not found."}

    for ticket in ticket_data["tickets"]:
        if ticket.get("status_presence") == new_status:
            log(
                f"Ticket {ticket['id']} already has status_presence {new_status}. No update needed."
            )
            return {
                "status": "success",
                "message": f"Ticket {obj_id} already has status_presence {new_status}.",
            }

    # https://api.congressus.nl/v30/events/{event_id}/participations/{obj_id}/set-presence
    url = f"{API_URL}/events/{event_id}/participations/{obj_id}/set-presence"
    log(f"Updating ticket {obj_id} to status_presence {new_status}...")
    payload = {"status_presence": new_status}
    resp = HTTP_CLIENT.post(url, json=payload)
    resp.raise_for_status()

    if resp.status_code != 204:
        log(f"Failed to update ticket {obj_id}. Status code: {resp.status_code}")
        return {"status": "error", "message": f"Failed to update ticket {obj_id}."}

    log(f"Ticket {obj_id} updated successfully in API. Updating local DB...")
    return get_ticket(event_id, obj_id, refresh=True)


def collect_tickets_for_event(event_id: str):
    participations = get_participations(event_id, force_refresh=True)
    log(f"Collected {len(participations)} participations for event {event_id}.")

    # Filter participations that need updating
    to_update = []
    for participation in participations:
        if participation.get("status") != "approved":
            continue
        obj_id = participation["id"]
        ticket_data = get_ticket(event_id, obj_id, refresh=False)
        # Skip if already present
        if (
            ticket_data.get("tickets") is not None
            and len(ticket_data.get("tickets")) > 0
            and ticket_data["tickets"][0].get("status_presence") is not None
            and ticket_data["tickets"][0]["status_presence"] == "present"
        ):
            log(
                f"Ticket data for participation {obj_id} already exists and is present. Skipping refresh."
            )
            continue
        to_update.append(obj_id)

    log(f"Found {len(to_update)} participations needing ticket update.")

    refreshed_count = 0
    # Use ThreadPoolExecutor to fetch tickets concurrently
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        future_to_obj_id = {
            executor.submit(get_ticket, event_id, obj_id, refresh=True): obj_id
            for obj_id in to_update
        }
        for future in concurrent.futures.as_completed(future_to_obj_id):
            obj_id = future_to_obj_id[future]
            try:
                future.result()
                refreshed_count += 1
                if refreshed_count % 5 == 0:
                    log(f"Progress: {refreshed_count}/{len(to_update)} updated.")
            except Exception as exc:
                log(f"Generated an exception for {obj_id}: {exc}")

    log(
        f"Refreshed ticket data for {refreshed_count} participations for event {event_id}."
    )

    # Trigger APK status check for the event to catch any newly extracted kentekens
    try:
        do_check_apk_status(event_id)
    except Exception as e:
        log(f"Error triggering APK check after ticket collection: {str(e)}")

    return {"status": "success", "message": f"Collected tickets for event {event_id}."}


def do_check_apk_status(event_id: str):
    """
    Background task to check APK status for all kentekens in an event.
    Only checks kentekens with expired or unknown APK status.
    """
    log(f"Starting APK check for event {event_id}")

    with sqlite3.connect(DB_PATH, timeout=30) as conn:
        cursor = conn.cursor()

        # Get all kentekens for this event with their current APK status
        cursor.execute(
            """
            SELECT DISTINCT k.kenteken, a.vervaldatum_apk
            FROM kentekens k
            LEFT JOIN apk_status a ON k.kenteken = a.kenteken
            WHERE k.id IN (
                SELECT participation_id FROM participations WHERE event_id = ?
            )
        """,
            (event_id,),
        )

        kenteken_data = cursor.fetchall()
        log(f"Found {len(kenteken_data)} kentekens for event {event_id}")

        # Filter for kentekens that need checking:
        # 1. Valid Dutch plates (8 chars with 2 dashes)
        # 2. Either no APK data OR expired APK
        kentekens_to_check = []
        today = time.strftime("%Y%m%d")

        for kenteken, vervaldatum_apk in kenteken_data:
            # Skip if not valid Dutch format
            if len(kenteken) != 8 or kenteken.count("-") != 2:
                continue

            # Check if we need to query this kenteken
            if not vervaldatum_apk:
                # No APK data - need to check
                kentekens_to_check.append(kenteken)
            elif vervaldatum_apk < today:
                # APK expired - need to recheck
                kentekens_to_check.append(kenteken)
            # else: APK is still valid, skip

        log(
            f"Filtered to {len(kentekens_to_check)} kentekens needing APK check (expired or unknown)"
        )

        checked = 0
        errors = 0
        skipped = len(kenteken_data) - len(kentekens_to_check)

        for kenteken in kentekens_to_check:
            try:
                # Remove dashes for API call
                kenteken_no_dash = kenteken.replace("-", "")

                # Query RDW API
                url = f"https://opendata.rdw.nl/resource/m9d7-ebf2.json?kenteken={kenteken_no_dash}"
                rdw_headers = {"User-Agent": "CongressusApp/1.0"}
                resp = httpx.get(url, headers=rdw_headers, timeout=10)
                resp.raise_for_status()

                data = resp.json()

                if data and len(data) > 0:
                    vehicle = data[0]
                    vervaldatum_apk = vehicle.get("vervaldatum_apk", None)
                    merk = vehicle.get("merk", None)
                    handelsbenaming = vehicle.get("handelsbenaming", None)

                    # Store in database
                    cursor.execute(
                        """
                        INSERT OR REPLACE INTO apk_status 
                        (kenteken, vervaldatum_apk, checked_at, merk, handelsbenaming)
                        VALUES (?, ?, ?, ?, ?)
                    """,
                        (
                            kenteken,
                            vervaldatum_apk,
                            time.strftime("%Y-%m-%d %H:%M:%S"),
                            merk,
                            handelsbenaming,
                        ),
                    )
                    checked += 1

                    if checked % 5 == 0:
                        log(f"Progress: {checked}/{len(kentekens_to_check)} checked")
                else:
                    log(f"No data found for kenteken {kenteken}")
                    errors += 1

            except Exception as e:
                log(f"Error checking kenteken {kenteken}: {str(e)}")
                errors += 1

        conn.commit()
        log(
            f"APK check complete for event {event_id}: {checked} checked, {skipped} skipped (valid APK), {errors} errors"
        )

    return {"checked": checked, "skipped": skipped, "errors": errors}


def get_members():
    with sqlite3.connect(DB_PATH, timeout=30) as conn:
        cursor = conn.cursor()
        # Table creation moved to init_db

        cursor.execute("SELECT data FROM members WHERE member_id = 'all'")
        row = cursor.fetchone()
        if row:
            # When data is too old (older than 1 day), refresh it
            last_updated_str = json.loads(row[0])["last_updated"]
            now = time.strftime("%Y-%m-%d")
            if last_updated_str == now:
                log("Members found in DB.")
                return json.loads(row[0])

            log("Data is outdated. Fetching new data from API...")
        else:
            log("No members found in DB. Fetching from API...")
        members = get_members_remote()
        cursor.execute("DELETE FROM members WHERE member_id = 'all'")
        cursor.execute(
            """
            INSERT OR REPLACE INTO members (member_id, data, last_updated)
            VALUES (?, ?, ?)
        """,
            (
                "all",
                json.dumps(members),
                time.strftime("%Y-%m-%d"),
            ),
        )
        conn.commit()
        log("Members stored in DB.")
        return members


def validate_member_data(member_name: str, member_to_str: str, date_str: str) -> bool:
    """
    This function validates is a member has a valid membership.

    :param member_name: Type of membership (e.g. "Lid", "Lid (Geen verloopdatum)", "Ere-lid", etc.)
    :param member_to_str: The date until the membership is valid, in string format (e.g. "2024-12-31"). Can be empty or None if no date is provided.
    :param date_str: The date the membership should be valid for.

    :return: A boolean indicating whether the membership is valid.
    :rtype: bool
    """

    valid_status = False
    valid_statuses = {"Lid (Geen verloopdatum)", "Ere-lid"}
    member_to_date = (
        datetime.strptime(member_to_str, "%Y-%m-%d").date()
        if member_to_str and member_to_str != "N/A"
        else None
    )
    log(f"date_str: {date_str}, type: {type(date_str)}")
    if "T" in date_str:
        date_str = date_str.split("T")[0]
    date_date = (
        datetime.strptime(date_str, "%Y-%m-%d").date()
        if date_str and date_str != "N/A"
        else None
    )
    if member_to_date and member_to_date >= date_date:
        valid_status = True
    elif member_name in valid_statuses:
        valid_status = True

    return valid_status


def get_members_remote():
    has_next = True
    params = {"page_size": 100, "page": 1}
    url = f"{API_URL}/members"
    data = []
    while has_next:
        resp = HTTP_CLIENT.get(url, params=params)
        resp.raise_for_status()
        resp_data = resp.json()

        data += resp_data.get("data", [])
        has_next = resp_data.get("has_next", False)
        if has_next:
            params["page"] = resp_data.get("next_num", params["page"] + 1)
    members = {}

    for member in data:
        status = member.get("status", {})
        if not status:
            continue
        id = member.get("id", None)
        member_to = status.get("member_to", "N/A")
        if not member_to:
            member_to = "N/A"
        name = status.get("name", None)
        if not id:
            print(f"Missing id for member: {name}")
            continue
        members[id] = {"name": name, "member_to": member_to}
    now = time.strftime("%Y-%m-%d")
    members["last_updated"] = now
    return members


def strip_values(obj):
    if isinstance(obj, dict):
        return {k: strip_values(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [strip_values(i) for i in obj]
    elif isinstance(obj, str):
        return obj.strip()
    else:
        return obj


def log(message: str = ""):
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {message}")
