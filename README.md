# congressus-app

A web dashboard and backend for managing ANVT events, tickets, and participations, powered by FastAPI and a modern HTML/JS frontend.

## Features

- Fetches and caches events, tickets, and participations from the Congressus API.
- Modern dashboard UI (TailwindCSS, Lucide icons).
- View, filter, and manage events and participations.
- Force sync and ticket collection features.
- All data is served via a FastAPI backend with a local SQLite cache.

## Project Structure

```
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

## Development

- Frontend code is in `source/html/` (HTML, JS, CSS).
- Backend code is in `source/main.py`.
- Test scripts are in `testing/`.
