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
import secrets
import sqlite3
import time
from datetime import datetime, timedelta
from typing import Dict, List

import fastapi
import httpx
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles

# from fastapi import Request
# from fastapi.responses import StreamingResponse

API_URL = "https://api.congressus.nl/v30"
API_KEY_PATH = "api-key-2.txt"
DB_PATH = os.getenv("CONGRESSUS_CACHE_DB", "/db/congressus_cache.db")
PAGE_SIZE = 100
MAX_SCAN_DAYS = int(os.getenv("MAX_SCAN_DAYS", 7))
STALE_EVENT_REFRESH_DAYS = int(os.getenv("STALE_EVENT_REFRESH_DAYS", 2))
APK_CHECK_MAX_WORKERS = max(1, int(os.getenv("APK_CHECK_MAX_WORKERS", 4)))

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
MEMBERS_CACHE: Dict[str, object | None] = {"data": None, "last_updated": None}
HTML_STATIC_FILES = StaticFiles(directory=str(WORKING_DIRECTORY / "html"))


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
            "CREATE INDEX IF NOT EXISTS idx_tickets_access_key ON tickets(access_key)"
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
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS access_tokens (
                token TEXT PRIMARY KEY,
                created_at TEXT,
                expires_at TEXT
            )
        """
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_access_tokens_expires_at ON access_tokens(expires_at)"
        )
        conn.commit()


# Initialize DB on startup
init_db()


def current_timestamp() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


def current_datetime() -> datetime:
    return datetime.now()


def clear_members_cache():
    MEMBERS_CACHE["data"] = None
    MEMBERS_CACHE["last_updated"] = None


def normalize_members_map(members: Dict) -> Dict:
    normalized_members = {}
    for member_id, member_data in members.items():
        if member_id == "last_updated":
            normalized_members["last_updated"] = member_data
        else:
            normalized_members[str(member_id)] = member_data
    return normalized_members


def cleanup_expired_access_tokens():
    with sqlite3.connect(DB_PATH, timeout=30) as conn:
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM access_tokens WHERE expires_at <= ?",
            (current_timestamp(),),
        )
        conn.commit()


def create_access_token(
    valid_days: int = 5, expires_at: datetime | None = None
) -> Dict[str, str]:
    cleanup_expired_access_tokens()
    created_at = current_datetime()
    token_expires_at = expires_at or (created_at + timedelta(days=valid_days))

    if token_expires_at <= created_at:
        raise ValueError("Expiry date must be in the future.")

    token = secrets.token_urlsafe(32)

    with sqlite3.connect(DB_PATH, timeout=30) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO access_tokens (token, created_at, expires_at)
            VALUES (?, ?, ?)
        """,
            (
                token,
                created_at.strftime("%Y-%m-%d %H:%M:%S"),
                token_expires_at.strftime("%Y-%m-%d %H:%M:%S"),
            ),
        )
        conn.commit()

    return {
        "token": token,
        "created_at": created_at.strftime("%Y-%m-%d %H:%M:%S"),
        "expires_at": token_expires_at.strftime("%Y-%m-%d %H:%M:%S"),
    }


def parse_access_token_expiry_date(expires_at: str | None) -> datetime | None:
    if not expires_at:
        return None

    try:
        parsed_date = datetime.strptime(expires_at, "%Y-%m-%d")
    except ValueError as exc:
        raise fastapi.HTTPException(
            status_code=400,
            detail="Invalid expiry date. Use YYYY-MM-DD.",
        ) from exc

    end_of_day = parsed_date.replace(hour=23, minute=59, second=59)
    if end_of_day <= current_datetime():
        raise fastapi.HTTPException(
            status_code=400,
            detail="Expiry date must be today or later.",
        )

    return end_of_day


def get_access_token(token: str) -> Dict[str, str] | None:
    cleanup_expired_access_tokens()
    with sqlite3.connect(DB_PATH, timeout=30) as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT token, created_at, expires_at FROM access_tokens WHERE token = ?",
            (token,),
        )
        row = cursor.fetchone()

    if not row:
        return None

    return {"token": row[0], "created_at": row[1], "expires_at": row[2]}


def list_access_tokens() -> List[Dict[str, str]]:
    cleanup_expired_access_tokens()
    with sqlite3.connect(DB_PATH, timeout=30) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT token, created_at, expires_at
            FROM access_tokens
            ORDER BY expires_at ASC, created_at ASC
        """
        )
        rows = cursor.fetchall()

    return [
        {"token": row[0], "created_at": row[1], "expires_at": row[2]} for row in rows
    ]


def revoke_access_token(token: str) -> bool:
    with sqlite3.connect(DB_PATH, timeout=30) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM access_tokens WHERE token = ?", (token,))
        deleted = cursor.rowcount > 0
        conn.commit()
    return deleted


def parse_db_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None


def parse_event_datetime(value: str | None) -> datetime | None:
    if not value:
        return None

    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"

    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        try:
            parsed = datetime.strptime(value, "%Y-%m-%dT%H:%M:%S")
        except ValueError:
            return None

    if parsed.tzinfo is not None:
        parsed = parsed.astimezone().replace(tzinfo=None)

    return parsed


def store_event(cursor: sqlite3.Cursor, event: Dict):
    cursor.execute(
        """
        INSERT OR REPLACE INTO events (event_id, data, last_updated)
        VALUES (?, ?, ?)
    """,
        (str(event["id"]), json.dumps(event), current_timestamp()),
    )


def delete_event_records(cursor: sqlite3.Cursor, event_id: str):
    cursor.execute(
        "SELECT participation_id FROM participations WHERE event_id = ?", (event_id,)
    )
    participation_ids = [row[0] for row in cursor.fetchall()]

    if participation_ids:
        placeholders = ",".join("?" for _ in participation_ids)
        cursor.execute(
            f"DELETE FROM kentekens WHERE id IN ({placeholders})", participation_ids
        )

    cursor.execute("DELETE FROM tickets WHERE event_id = ?", (event_id,))
    cursor.execute("DELETE FROM participations WHERE event_id = ?", (event_id,))
    cursor.execute("DELETE FROM events WHERE event_id = ?", (event_id,))


def delete_event_from_db(event_id: str):
    with sqlite3.connect(DB_PATH, timeout=30) as conn:
        cursor = conn.cursor()
        delete_event_records(cursor, event_id)
        conn.commit()


def fetch_event_from_api(event_id: str) -> Dict | None:
    url = f"{API_URL}/events/{event_id}"
    resp = HTTP_CLIENT.get(url)
    resp.raise_for_status()
    event_data = resp.json()

    if isinstance(event_data, dict) and isinstance(event_data.get("data"), dict):
        return event_data["data"]
    if isinstance(event_data, dict):
        return event_data
    return None


def sync_event_with_backend(event_id: str) -> bool:
    log(f"Refreshing event {event_id} from Congressus backend...")

    try:
        event = fetch_event_from_api(event_id)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            log(f"Event {event_id} no longer exists remotely. Removing local cache.")
            delete_event_from_db(event_id)
            return False
        log(f"Failed to refresh event {event_id}: {exc}")
        return False
    except httpx.HTTPError as exc:
        log(f"Failed to refresh event {event_id}: {exc}")
        return False

    if not event or not event.get("id"):
        log(f"Event {event_id} returned invalid data. Removing local cache.")
        delete_event_from_db(event_id)
        return False

    if event.get("published") is False:
        log(f"Event {event_id} is no longer published. Removing local cache.")
        delete_event_from_db(event_id)
        return False

    with sqlite3.connect(DB_PATH, timeout=30) as conn:
        cursor = conn.cursor()
        store_event(cursor, event)
        conn.commit()

    get_participations(str(event["id"]), force_refresh=True)
    return True


def build_ticket_summary_map(ticket_rows) -> Dict[str, Dict[str, int]]:
    ticket_summaries: Dict[str, Dict[str, int]] = {}

    for row in ticket_rows:
        obj_id, ticket_data = row[0], row[1]
        parsed_ticket = json.loads(ticket_data)
        ticket_items = parsed_ticket.get("tickets", [])
        ticket_summaries[str(obj_id)] = {
            "ticket_count": len(ticket_items),
            "presence_count": sum(
                1 for ticket in ticket_items if ticket.get("status_presence") == "present"
            ),
        }

    return ticket_summaries


def get_event_participation_stats_python(
    events_list: List[Dict],
) -> Dict[str, Dict[str, int]]:
    event_ids = [str(event["id"]) for event in events_list]
    stats_by_event = {
        event_id: {
            "leden_sold_tickets": 0,
            "niet_leden_sold_tickets": 0,
            "present_leden": 0,
            "present_vrijrijders": 0,
        }
        for event_id in event_ids
    }

    if not event_ids:
        return stats_by_event

    placeholders = ",".join("?" for _ in event_ids)
    with sqlite3.connect(DB_PATH, timeout=30) as conn:
        cursor = conn.cursor()
        cursor.execute(
            f"""
            SELECT participation_id, event_id, data
            FROM participations
            WHERE event_id IN ({placeholders})
        """,
            event_ids,
        )
        participation_rows = cursor.fetchall()
        cursor.execute(
            f"""
            SELECT obj_id, data
            FROM tickets
            WHERE event_id IN ({placeholders})
        """,
            event_ids,
        )
        ticket_summaries = build_ticket_summary_map(cursor.fetchall())

    for participation_id, event_id, participation_data in participation_rows:
        event_stats = stats_by_event.setdefault(
            str(event_id),
            {
                "leden_sold_tickets": 0,
                "niet_leden_sold_tickets": 0,
                "present_leden": 0,
                "present_vrijrijders": 0,
            },
        )
        participation = json.loads(participation_data)
        is_member = participation.get("member_id") is not None

        if participation.get("status") == "approved":
            if is_member:
                event_stats["leden_sold_tickets"] += 1
            else:
                event_stats["niet_leden_sold_tickets"] += 1

        ticket_summary = ticket_summaries.get(str(participation_id))
        if ticket_summary and ticket_summary["presence_count"] > 0:
            if is_member:
                event_stats["present_leden"] += 1
            else:
                event_stats["present_vrijrijders"] += 1

    return stats_by_event


def get_event_participation_stats(events_list: List[Dict]) -> Dict[str, Dict[str, int]]:
    event_ids = [str(event["id"]) for event in events_list]
    stats_by_event = {
        event_id: {
            "leden_sold_tickets": 0,
            "niet_leden_sold_tickets": 0,
            "present_leden": 0,
            "present_vrijrijders": 0,
        }
        for event_id in event_ids
    }

    if not event_ids:
        return stats_by_event

    try:
        placeholders = ",".join("?" for _ in event_ids)
        with sqlite3.connect(DB_PATH, timeout=30) as conn:
            cursor = conn.cursor()
            cursor.execute(
                f"""
                WITH ticket_presence AS (
                    SELECT
                        t.event_id,
                        t.obj_id,
                        COALESCE(
                            SUM(
                                CASE
                                    WHEN json_extract(ticket.value, '$.status_presence') = 'present'
                                    THEN 1
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS presence_count
                    FROM tickets t
                    LEFT JOIN json_each(t.data, '$.tickets') AS ticket
                    WHERE t.event_id IN ({placeholders})
                    GROUP BY t.event_id, t.obj_id
                )
                SELECT
                    p.event_id,
                    SUM(
                        CASE
                            WHEN json_extract(p.data, '$.status') = 'approved'
                            AND json_extract(p.data, '$.member_id') IS NOT NULL
                            THEN 1
                            ELSE 0
                        END
                    ) AS leden_sold_tickets,
                    SUM(
                        CASE
                            WHEN json_extract(p.data, '$.status') = 'approved'
                            AND json_extract(p.data, '$.member_id') IS NULL
                            THEN 1
                            ELSE 0
                        END
                    ) AS niet_leden_sold_tickets,
                    SUM(
                        CASE
                            WHEN json_extract(p.data, '$.member_id') IS NOT NULL
                            AND COALESCE(tp.presence_count, 0) > 0
                            THEN 1
                            ELSE 0
                        END
                    ) AS present_leden,
                    SUM(
                        CASE
                            WHEN json_extract(p.data, '$.member_id') IS NULL
                            AND COALESCE(tp.presence_count, 0) > 0
                            THEN 1
                            ELSE 0
                        END
                    ) AS present_vrijrijders
                FROM participations p
                LEFT JOIN ticket_presence tp
                    ON tp.event_id = p.event_id
                    AND tp.obj_id = p.participation_id
                WHERE p.event_id IN ({placeholders})
                GROUP BY p.event_id
            """,
                event_ids + event_ids,
            )
            for row in cursor.fetchall():
                stats_by_event[str(row[0])] = {
                    "leden_sold_tickets": row[1] or 0,
                    "niet_leden_sold_tickets": row[2] or 0,
                    "present_leden": row[3] or 0,
                    "present_vrijrijders": row[4] or 0,
                }
        return stats_by_event
    except sqlite3.OperationalError as exc:
        log(f"Falling back to Python event aggregation: {exc}")
        return get_event_participation_stats_python(events_list)


def load_participations_with_stats(
    cursor: sqlite3.Cursor, event_id: int | str
) -> List[Dict]:
    try:
        cursor.execute(
            f"""
            WITH ticket_summary AS (
                SELECT
                    t.event_id,
                    t.obj_id,
                    COUNT(ticket.value) AS ticket_count,
                    COALESCE(
                        SUM(
                            CASE
                                WHEN json_extract(ticket.value, '$.status_presence') = 'present'
                                THEN 1
                                ELSE 0
                            END
                        ),
                        0
                    ) AS presence_count
                FROM tickets t
                LEFT JOIN json_each(t.data, '$.tickets') AS ticket
                WHERE t.event_id = ?
                GROUP BY t.event_id, t.obj_id
            )
            SELECT
                p.data,
                ts.ticket_count,
                COALESCE(ts.presence_count, 0),
                k.kenteken
            FROM participations p
            LEFT JOIN ticket_summary ts
                ON ts.event_id = p.event_id
                AND ts.obj_id = p.participation_id
            LEFT JOIN kentekens k
                ON k.id = p.participation_id
            WHERE p.event_id = ?
        """,
            (event_id, event_id),
        )
        rows = cursor.fetchall()
        participations = []
        for participation_data, ticket_count, presence_count, kenteken in rows:
            participation = json.loads(participation_data)
            participation["presence_count"] = presence_count or 0
            participation["tickets"] = ticket_count if ticket_count is not None else None
            participation["kenteken"] = kenteken or ""
            participations.append(participation)
        return participations
    except sqlite3.OperationalError as exc:
        log(f"Falling back to Python participation enrichment for event {event_id}: {exc}")
        cursor.execute(
            "SELECT participation_id, data FROM participations WHERE event_id = ?",
            (event_id,),
        )
        participation_rows = cursor.fetchall()
        cursor.execute("SELECT obj_id, data FROM tickets WHERE event_id = ?", (event_id,))
        ticket_summaries = build_ticket_summary_map(cursor.fetchall())
        participation_ids = [str(participation_id) for participation_id, _ in participation_rows]
        if participation_ids:
            placeholders = ",".join("?" for _ in participation_ids)
            cursor.execute(
                f"SELECT id, kenteken FROM kentekens WHERE id IN ({placeholders})",
                participation_ids,
            )
            kentekens_db = {row[0]: row[1] for row in cursor.fetchall()}
        else:
            kentekens_db = {}

        participations = []
        for participation_id, participation_data in participation_rows:
            participation = json.loads(participation_data)
            ticket_summary = ticket_summaries.get(str(participation_id))
            participation["presence_count"] = (
                ticket_summary["presence_count"] if ticket_summary else 0
            )
            participation["tickets"] = (
                ticket_summary["ticket_count"] if ticket_summary else None
            )
            participation["kenteken"] = kentekens_db.get(str(participation_id), "")
            participations.append(participation)
        return participations


def get_cached_member_validation_result(
    member_info: Dict | None,
    date_str: str | None,
    validation_cache: Dict[tuple[str | None, str | None, str | None], Dict[str, str | bool | None]],
) -> Dict[str, str | bool | None]:
    member_name = member_info.get("name") if member_info else None
    member_to = member_info.get("member_to") if member_info else None
    cache_key = (member_name, member_to, date_str)
    cached_result = validation_cache.get(cache_key)
    if cached_result is None:
        cached_result = get_member_validation_result(member_name, member_to, date_str)
        validation_cache[cache_key] = cached_result
    return cached_result


def fetch_apk_status_for_kenteken(kenteken: str) -> Dict[str, str | None] | None:
    kenteken_no_dash = kenteken.replace("-", "")
    url = f"https://opendata.rdw.nl/resource/m9d7-ebf2.json?kenteken={kenteken_no_dash}"
    rdw_headers = {"User-Agent": "CongressusApp/1.0"}
    resp = httpx.get(url, headers=rdw_headers, timeout=10)
    resp.raise_for_status()

    data = resp.json()
    if not data:
        return None

    vehicle = data[0]
    return {
        "vervaldatum_apk": vehicle.get("vervaldatum_apk"),
        "merk": vehicle.get("merk"),
        "handelsbenaming": vehicle.get("handelsbenaming"),
    }


def refresh_stale_future_events():
    now = datetime.now()
    stale_event_ids = []

    with sqlite3.connect(DB_PATH, timeout=30) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT event_id, data, last_updated FROM events")
        rows = cursor.fetchall()

    for event_id, event_data, last_updated in rows:
        event = json.loads(event_data)
        start_dt = parse_event_datetime(event.get("start"))
        if start_dt is None or start_dt <= now:
            continue

        last_updated_dt = parse_db_timestamp(last_updated)
        if last_updated_dt is None or last_updated_dt <= now - timedelta(
            days=STALE_EVENT_REFRESH_DAYS
        ):
            stale_event_ids.append(str(event_id))

    if not stale_event_ids:
        return

    log(
        f"Refreshing {len(stale_event_ids)} stale future event(s) older than "
        f"{STALE_EVENT_REFRESH_DAYS} day(s)."
    )
    for event_id in stale_event_ids:
        sync_event_with_backend(event_id)


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


@app.get("/html")
async def html_root_no_slash() -> fastapi.responses.RedirectResponse:
    return fastapi.responses.RedirectResponse(url="/html/index.html")


@app.get("/html/{page_name:path}")
async def html_page(
    request: fastapi.Request, page_name: str
) -> fastapi.responses.Response:
    """
    Function to serve HTML pages from the html/ directory.

    :param page_name: Description
    :type page_name: str
    """

    return await HTML_STATIC_FILES.get_response(page_name or "index.html", request.scope)


@app.get("/admin/tables")
def get_tables():
    """
    Get list of manageable tables in the database.
    """
    return [
        "events",
        "participations",
        "tickets",
        "kentekens",
        "apk_status",
        "members",
        "access_tokens",
    ]


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
        "access_tokens",
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
        if table_name == "members":
            clear_members_cache()
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


@app.post("/admin/access-token")
def generate_access_token_endpoint(payload: dict | None = fastapi.Body(default=None)):
    log("Admin: Generating access token")
    expires_at = None
    if isinstance(payload, dict):
        expires_at = parse_access_token_expiry_date(payload.get("expires_at"))

    return create_access_token(valid_days=5, expires_at=expires_at)


@app.get("/admin/access-tokens")
def get_access_tokens():
    log("Admin: Listing active access tokens")
    return list_access_tokens()


@app.delete("/admin/access-token/{token}")
def delete_access_token(token: str):
    log("Admin: Revoking access token")
    if not revoke_access_token(token):
        return fastapi.responses.JSONResponse(
            status_code=404,
            content={"status": "error", "message": "Token not found"},
        )

    return {"status": "success"}


@app.get("/auth/validate")
def validate_access_token(token: str):
    token_data = get_access_token(token)
    if not token_data:
        return {"valid": False}

    return {
        "valid": True,
        "created_at": token_data["created_at"],
        "expires_at": token_data["expires_at"],
    }


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

    # If ticket is not found, try to update the database with all tickets from active events
    log(f"Ticket {access_key} not found in DB. Checking active events to update...")

    events = get_events(force_refresh=False)
    now = datetime.now()
    updated_events = False

    for event in events:
        start = event.get("start")
        if start:
            event_date = datetime.strptime(start, "%Y-%m-%dT%H:%M:%S")
            # Same condition as scan_ticket: only active events within -MAX_SCAN_DAYS and +3 days
            if (event_date - now).days <= 3 and (
                now - event_date
            ).days <= MAX_SCAN_DAYS:
                log(f"Updating database with tickets from active event {event['id']}")
                collect_tickets_for_event(str(event["id"]))
                updated_events = True

    if updated_events:
        # Check again if the ticket is now in the database
        with sqlite3.connect(DB_PATH, timeout=30) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT event_id, obj_id FROM tickets WHERE access_key = ?",
                (access_key,),
            )
            row = cursor.fetchone()
            if row:
                log(f"Ticket {access_key} found after refreshing active events.")
                return {"event_id": row[0], "obj_id": row[1]}

    return fastapi.responses.JSONResponse(
        status_code=404,
        content={"message": f"Ticket not found for {access_key}"},
    )


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
            updated_ticket_data = do_update_ticket(
                event_id, obj_id, "present", ticket_data=ticket_data
            )
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
        cursor.execute("SELECT event_id FROM events")
        existing_event_ids = {row[0] for row in cursor.fetchall()}
    if not existing_event_ids:
        log("No existing events in DB. Forcing refresh.")
        force_refresh = True

    if force_refresh:
        with sqlite3.connect(DB_PATH, timeout=30) as conn:
            cursor = conn.cursor()
            log("Fetching events from API...")
            has_next = True
            params = {"page_size": PAGE_SIZE, "page": 1}
            url = f"{API_URL}/events"
            events: List[Dict] = []

            while has_next:
                resp = HTTP_CLIENT.get(url, params=params)
                resp.raise_for_status()
                resp_data = resp.json()

                events += resp_data.get("data", [])
                has_next = resp_data.get("has_next", False)
                if has_next:
                    params["page"] = resp_data.get("next_num", params["page"] + 1)

            log(f"Fetched {len(events)} events from API.")
            log("Storing events in DB...")

            for event in events:
                store_event(cursor, event)
            conn.commit()
            log("Events stored in DB.")

            fetched_event_ids = {str(event["id"]) for event in events}
            removed_events = 0
            for event_id in existing_event_ids:
                if event_id in fetched_event_ids:
                    continue
                removed_events += 1
                delete_event_records(cursor, event_id)
            conn.commit()
            log(f"Removed {removed_events} obsolete events from DB.")

        participation_count = 0
        for event in events:
            participation_count += len(get_participations(event["id"], force_refresh=True))
        log(f"Total participations fetched: {participation_count}")
    else:
        refresh_stale_future_events()

        with sqlite3.connect(DB_PATH, timeout=30) as conn:
            cursor = conn.cursor()
            log("Loading events from DB...")
            events = []

            for row in cursor.execute("SELECT event_id, data FROM events"):
                events.append(json.loads(row[1]))
            log(f"Fetched {len(events)} events from DB.")

    event_stats = get_event_participation_stats(events)
    return filter_events(events, event_stats)


def get_event(event_id: str):
    with sqlite3.connect(DB_PATH, timeout=30) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT data FROM events WHERE event_id = ?", (event_id,))
        row = cursor.fetchone()
    if row:
        return json.loads(row[0])
    return {"error": "Event not found"}


def filter_events(
    events_list: List[Dict], event_stats: Dict[str, Dict[str, int]] | None = None
) -> List[Dict]:
    event_stats = event_stats or get_event_participation_stats(events_list)
    return_events = []
    for event in events_list:
        if event["published"] is False:
            continue
        leden_num_tickets = 0
        niet_leden_num_tickets = 0
        log(f"Start: {event['start']}")
        log(f"Ticket types for event {event['id']}: {event['name']}")
        for tickets in event["ticket_types"]:
            if tickets["price"] == 0 and tickets["num_tickets"] is not None:
                leden_num_tickets += tickets.get("num_tickets", 0)
            elif tickets["price"] > 39 and tickets["num_tickets"] is not None:
                niet_leden_num_tickets += tickets.get("num_tickets", 0)

        stats = event_stats.get(str(event["id"]), {})
        leden_sold_tickets = stats.get("leden_sold_tickets", 0)
        niet_leden_sold_tickets = stats.get("niet_leden_sold_tickets", 0)
        present_leden = stats.get("present_leden", 0)
        present_vrijrijders = stats.get("present_vrijrijders", 0)
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
                "present_leden": present_leden,
                "present_vrijrijders": present_vrijrijders,
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

        participations = load_participations_with_stats(cursor, event_id)
        log(
            f"Fetched {len(participations)} participations from DB for event {event_id}."
        )

    # Filter fields to reduce payload size
    members = get_members()
    validation_cache = {}
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
            validation_result = get_cached_member_validation_result(
                member_info,
                event_date_str,
                validation_cache,
            )
            filtered_participations[-1]["lid_valid"] = validation_result["valid"]
            filtered_participations[-1]["lid_invalid_reason"] = validation_result[
                "reason"
            ]
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

    member_id = (
        str(tickets_list.get("member_id"))
        if tickets_list.get("member_id") is not None
        else None
    )
    if member_id is not None:
        members = get_members()
        member_info = members.get(member_id)
        validation_result = get_cached_member_validation_result(
            member_info,
            return_list["event_date"],
            {},
        )
        return_list["lid_valid"] = validation_result["valid"]
        return_list["lid_invalid_reason"] = validation_result["reason"]

    return return_list


def do_update_ticket(
    event_id: str, obj_id: str, new_status: str, ticket_data: Dict | None = None
):
    log(f"New status: {new_status}")
    if ticket_data is None:
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
    rows_to_store = []

    if kentekens_to_check:
        max_workers = min(APK_CHECK_MAX_WORKERS, len(kentekens_to_check))
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_kenteken = {
                executor.submit(fetch_apk_status_for_kenteken, kenteken): kenteken
                for kenteken in kentekens_to_check
            }
            for future in concurrent.futures.as_completed(future_to_kenteken):
                kenteken = future_to_kenteken[future]
                try:
                    vehicle = future.result()
                    if vehicle is None:
                        log(f"No data found for kenteken {kenteken}")
                        errors += 1
                        continue

                    rows_to_store.append(
                        (
                            kenteken,
                            vehicle.get("vervaldatum_apk"),
                            time.strftime("%Y-%m-%d %H:%M:%S"),
                            vehicle.get("merk"),
                            vehicle.get("handelsbenaming"),
                        )
                    )
                    checked += 1

                    if checked % 5 == 0:
                        log(f"Progress: {checked}/{len(kentekens_to_check)} checked")
                except Exception as e:
                    log(f"Error checking kenteken {kenteken}: {str(e)}")
                    errors += 1

    if rows_to_store:
        with sqlite3.connect(DB_PATH, timeout=30) as conn:
            cursor = conn.cursor()
            cursor.executemany(
                """
                INSERT OR REPLACE INTO apk_status
                (kenteken, vervaldatum_apk, checked_at, merk, handelsbenaming)
                VALUES (?, ?, ?, ?, ?)
            """,
                rows_to_store,
            )
            conn.commit()

    log(
        f"APK check complete for event {event_id}: {checked} checked, {skipped} skipped (valid APK), {errors} errors"
    )

    return {"checked": checked, "skipped": skipped, "errors": errors}


def get_members():
    today = time.strftime("%Y-%m-%d")
    cached_members = MEMBERS_CACHE.get("data")
    cached_last_updated = MEMBERS_CACHE.get("last_updated")
    if cached_members is not None and cached_last_updated == today:
        log("Members found in process cache.")
        cached_members = normalize_members_map(cached_members)
        MEMBERS_CACHE["data"] = cached_members
        return cached_members

    with sqlite3.connect(DB_PATH, timeout=30) as conn:
        cursor = conn.cursor()
        # Table creation moved to init_db

        cursor.execute("SELECT data, last_updated FROM members WHERE member_id = 'all'")
        row = cursor.fetchone()
        if row and row[1] == today:
            log("Members found in DB.")
            members = normalize_members_map(json.loads(row[0]))
            MEMBERS_CACHE["data"] = members
            MEMBERS_CACHE["last_updated"] = today
            return members

        if row:
            log("Data is outdated. Fetching new data from API...")
        else:
            log("No members found in DB. Fetching from API...")
        members = normalize_members_map(get_members_remote())
        cursor.execute("DELETE FROM members WHERE member_id = 'all'")
        cursor.execute(
            """
            INSERT OR REPLACE INTO members (member_id, data, last_updated)
            VALUES (?, ?, ?)
        """,
            (
                "all",
                json.dumps(members),
                today,
            ),
        )
        conn.commit()
        MEMBERS_CACHE["data"] = members
        MEMBERS_CACHE["last_updated"] = today
        log("Members stored in DB.")
        return members


def get_member_validation_result(
    member_name: str | None, member_to_str: str | None, date_str: str | None
) -> Dict[str, str | bool | None]:
    valid_statuses = {"Lid (Geen verloopdatum)", "Ere-lid"}

    if not date_str or date_str == "N/A":
        return {"valid": False, "reason": "Evenementdatum onbekend."}

    if "T" in date_str:
        date_str = date_str.split("T")[0]

    try:
        event_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        return {"valid": False, "reason": "Evenementdatum onbekend."}

    if member_name in valid_statuses:
        return {"valid": True, "reason": None}

    if member_to_str and member_to_str != "N/A":
        try:
            member_to_date = datetime.strptime(member_to_str, "%Y-%m-%d").date()
        except ValueError:
            return {
                "valid": False,
                "reason": f"Ongeldige lidmaatschapsdatum: {member_to_str}.",
            }

        if member_to_date >= event_date:
            return {"valid": True, "reason": None}

        return {
            "valid": False,
            "reason": (
                f"Lidmaatschap verlopen op {member_to_str}; niet geldig op "
                f"{event_date.isoformat()}."
            ),
        }

    if member_name:
        return {
            "valid": False,
            "reason": (
                f"Lidtype '{member_name}' heeft geen geldige verloopdatum voor "
                f"{event_date.isoformat()}."
            ),
        }

    return {"valid": False, "reason": "Lid niet gevonden in de ledenadministratie."}


def validate_member_data(member_name: str, member_to_str: str, date_str: str) -> bool:
    """
    This function validates is a member has a valid membership.

    :param member_name: Type of membership (e.g. "Lid", "Lid (Geen verloopdatum)", "Ere-lid", etc.)
    :param member_to_str: The date until the membership is valid, in string format (e.g. "2024-12-31"). Can be empty or None if no date is provided.
    :param date_str: The date the membership should be valid for.

    :return: A boolean indicating whether the membership is valid.
    :rtype: bool
    """

    return bool(get_member_validation_result(member_name, member_to_str, date_str)["valid"])


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
        members[str(id)] = {"name": name, "member_to": member_to}
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
