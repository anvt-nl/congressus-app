// Fetch event details and update heading and date subtitle
async function fetchEventDetails(eventId) {
    try {
        const response = await fetch(`/events`);
        const events = await response.json();
        const eventNavigation = document.getElementById("eventNavigation");
        if (!Array.isArray(events)) return;

        const sortedEvents = [...events].sort((a, b) => {
            const dateA = a.start ? String(a.start).split("T")[0] : "";
            const dateB = b.start ? String(b.start).split("T")[0] : "";
            if (dateA !== dateB) return dateA.localeCompare(dateB);
            return String(a.id).localeCompare(String(b.id));
        });

        const currentIndex = sortedEvents.findIndex(
            (event) => String(event.id) === String(eventId),
        );
        const event = currentIndex >= 0 ? sortedEvents[currentIndex] : null;

        if (event) {
            const dateOnly = event.start ? event.start.split("T")[0] : "";
            document.getElementById("eventHeading").textContent = event.name;
            document.getElementById("eventDate").textContent = dateOnly;
        }

        if (!eventNavigation) return;

        const previousEvent =
            currentIndex > 0 ? sortedEvents[currentIndex - 1] : null;
        const nextEvent =
            currentIndex >= 0 && currentIndex < sortedEvents.length - 1
                ? sortedEvents[currentIndex + 1]
                : null;

        eventNavigation.innerHTML = `
            <div class="min-w-0">
                ${previousEvent
                    ? `<a href="participations_overview.html?event_id=${previousEvent.id}" class="text-blue-600 underline truncate inline-block max-w-full">&larr; Vorig evenement: ${previousEvent.name}</a>`
                    : ""}
            </div>
            <div class="min-w-0 text-right">
                ${nextEvent
                    ? `<a href="participations_overview.html?event_id=${nextEvent.id}" class="text-blue-600 underline truncate inline-block max-w-full">Volgend evenement: ${nextEvent.name} &rarr;</a>`
                    : ""}
            </div>
        `;
    } catch {}
}
