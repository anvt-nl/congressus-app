# congressus-app

A web dashboard and backend for managing ANVT events, tickets, and participations, powered by FastAPI and a modern HTML/JS frontend.

## Features

- Fetches and caches events, tickets, and participations from the Congressus API.
- Modern dashboard UI (TailwindCSS, Lucide icons).
- View, filter, and manage events and participations.
- Force sync and ticket collection features.
- All data is served via a FastAPI backend with a local SQLite cache.

## Project Structure

```txt
source/
  main.py              # FastAPI backend and API logic
  requirements.txt     # Python dependencies
  api-key-2.txt        # Congressus API key (not in version control)
  html/
    index.html         # Main dashboard
    participations_overview.html
    ticket.html
    style.css          # Custom styles (uses TailwindCSS)
    index.js           # JS for index.html
    participations_overview.js
    ticket.js
    event_heading.js   # (if used)
testing/
  ...                  # Test scripts and utilities
```

## Setup

1. **Install Python dependencies:**

   ```sh
   pip install -r source/requirements.txt
   ```

2. **Add your Congressus API key:**
   - Place your API key in `source/api-key-2.txt`.

3. **Run the backend:**

   ```sh
   export CONGRESSUS_CACHE_DB=congressus_cache.db
   cd source
   uvicorn main:app --reload
   ```

   The app will be available at [http://localhost:8000/html/index.html](http://localhost:8000/html/index.html).

4. **Open the dashboard:**
   - Visit the above URL in your browser.

## Command-line Testing / Custom DB Location

You can specify a custom location for the SQLite cache database using the `CONGRESSUS_CACHE_DB` environment variable. For example, to use a local file for testing:

```sh
export CONGRESSUS_CACHE_DB=congressus_cache.db
cd source
uvicorn main:app --reload
```

## API Endpoints

- `GET /events` — List all events (cached)
- `GET /events/refresh` — Force refresh events from Congressus
- `GET /event/{event_id}` — Event details
- `GET /event/{event_id}/collect-tickets` — Collect tickets for event
- `GET /participations/{event_id}` — Participation details (cached)
- `GET /participations/{event_id}/refresh` — Force refresh participations
- `GET /ticket/{event_id}/{obj_id}` — Ticket details
- `GET /ticket/{event_id}/{obj_id}/{new_status}` — Update ticket status

## SQLite Database Structure

The application uses SQLite for caching data from the Congressus API. The database is configured with WAL (Write-Ahead Logging) mode for better concurrency and performance.

### Tables

#### `events`

Caches event data from the Congressus API.

| Column         | Type               | Description                                       |
| -------------- | ------------------ | ------------------------------------------------- |
| `event_id`     | TEXT (Primary Key) | Unique identifier for the event                   |
| `data`         | TEXT               | JSON string containing complete event details     |
| `last_updated` | TEXT               | ISO timestamp of when the record was last updated |

**Content:** Full event information including name, start/end dates, location, ticket counts, visibility settings, and participant statistics (present_leden, present_vrijrijders).

#### `participations`

Caches participation records for events.

| Column             | Type               | Description                                       |
| ------------------ | ------------------ | ------------------------------------------------- |
| `participation_id` | TEXT (Primary Key) | Unique identifier for the participation record    |
| `event_id`         | TEXT (Indexed)     | Foreign key reference to the event                |
| `data`             | TEXT               | JSON string containing participation details      |
| `last_updated`     | TEXT               | ISO timestamp of when the record was last updated |

**Content:** Participant information including member details (addressee, email), participation status (approved/pending), presence count, associated tickets, and license plate (kenteken) if applicable.

**Index:** `idx_participations_event_id` on `event_id` for faster event-based queries.

#### `tickets`

Caches detailed ticket information for participants.

| Column         | Type               | Description                                                      |
| -------------- | ------------------ | ---------------------------------------------------------------- |
| `obj_id`       | TEXT (Primary Key) | Unique identifier for the ticket object (participation ID)       |
| `event_id`     | TEXT (Indexed)     | Foreign key reference to the event                               |
| `data`         | TEXT               | JSON string containing complete ticket and participation details |
| `last_updated` | TEXT               | ISO timestamp of when the record was last updated                |

**Content:** Complete participation details including member information, event details, and ticket-specific data such as:

- Ticket access keys
- QR codes (base64-encoded PNG images)
- Ticket type and pricing
- Presence status (unknown/present/absent)
- Associated ticket type metadata

**Index:** `idx_tickets_event_id` on `event_id` for faster event-based queries.

### Cache Behavior

- Events are cached for **1 hour** before automatic refresh
- Participations are cached for **5 minutes** before automatic refresh
- Tickets are cached for **5 minutes** before automatic refresh
- All caches can be manually refreshed via the `/refresh` endpoints
- The database automatically initializes tables on first startup

### Extracting QR Codes from Database

To extract QR codes from ticket data stored in the database:

```bash
# Using jq to extract from JSON file
jq -r '.tickets[0].ticket_qrcode' get_participation_*.json | \
  sed 's/data:image\/png;base64,//' | \
  base64 -d > ticket_qrcode.png
```

## Development

- Frontend code is in `source/html/` (HTML, JS, CSS).
- Backend code is in `source/main.py`.
- Test scripts are in `testing/`.
