const EVENTS_CACHE_KEY = "anvtEventsCacheV1";
const EVENTS_CACHE_TTL_MS = 5 * 60 * 1000;

function readEventsCache() {
  const rawValue = sessionStorage.getItem(EVENTS_CACHE_KEY);
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed?.events) || typeof parsed?.timestamp !== "number") {
      sessionStorage.removeItem(EVENTS_CACHE_KEY);
      return null;
    }
    return parsed;
  } catch {
    sessionStorage.removeItem(EVENTS_CACHE_KEY);
    return null;
  }
}

function writeEventsCache(events) {
  sessionStorage.setItem(
    EVENTS_CACHE_KEY,
    JSON.stringify({
      timestamp: Date.now(),
      events,
    }),
  );
}

async function fetchEventsCached({ forceRefresh = false, ttlMs = EVENTS_CACHE_TTL_MS } = {}) {
  const cached = readEventsCache();
  if (!forceRefresh && cached && Date.now() - cached.timestamp <= ttlMs) {
    return cached.events;
  }

  const response = await fetch(forceRefresh ? "/events/refresh" : "/events");
  if (!response.ok) {
    throw new Error("Evenementen konden niet worden geladen.");
  }

  const events = await response.json();
  if (Array.isArray(events)) {
    writeEventsCache(events);
  }
  return events;
}

function invalidateEventsCache() {
  sessionStorage.removeItem(EVENTS_CACHE_KEY);
}

function sortEventsByDate(events) {
  return [...events].sort((a, b) => {
    const dateA = a.start ? String(a.start).split("T")[0] : "";
    const dateB = b.start ? String(b.start).split("T")[0] : "";
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return String(a.id).localeCompare(String(b.id));
  });
}

function getCachedEventById(eventId) {
  const cached = readEventsCache();
  if (!cached) return null;
  return cached.events.find((event) => String(event.id) === String(eventId)) || null;
}

window.AnvtEventsCache = {
  fetchEventsCached,
  invalidateEventsCache,
  sortEventsByDate,
  getCachedEventById,
};
