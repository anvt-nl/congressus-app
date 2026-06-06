async function fetchEventDetails(eventId) {
  try {
    const events = await window.AnvtEventsCache.fetchEventsCached();
    const eventNavigation = document.getElementById("eventNavigation");
    if (!Array.isArray(events)) return;

    const sortedEvents = window.AnvtEventsCache.sortEventsByDate(events);
    const currentIndex = sortedEvents.findIndex(
      (event) => String(event.id) === String(eventId),
    );
    const currentEvent = currentIndex >= 0 ? sortedEvents[currentIndex] : null;

    if (currentEvent) {
      const dateOnly = currentEvent.start ? currentEvent.start.split("T")[0] : "";
      document.getElementById("eventHeading").textContent = currentEvent.name;
      document.getElementById("eventDate").textContent = dateOnly;
    }

    if (!eventNavigation) return;

    const previousEvent = currentIndex > 0 ? sortedEvents[currentIndex - 1] : null;
    const nextEvent =
      currentIndex >= 0 && currentIndex < sortedEvents.length - 1
        ? sortedEvents[currentIndex + 1]
        : null;

    eventNavigation.innerHTML = `
      <div class="min-w-0">
        ${
          previousEvent
            ? `<a href="participations_overview.html?event_id=${previousEvent.id}" class="text-blue-600 underline truncate inline-block max-w-full">&larr; Vorig evenement: ${previousEvent.name}</a>`
            : ""
        }
      </div>
      <div class="min-w-0 text-right">
        ${
          nextEvent
            ? `<a href="participations_overview.html?event_id=${nextEvent.id}" class="text-blue-600 underline truncate inline-block max-w-full">Volgend evenement: ${nextEvent.name} &rarr;</a>`
            : ""
        }
      </div>
    `;
  } catch {}
}
