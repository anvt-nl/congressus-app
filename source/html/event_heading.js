// Fetch event details and update heading and date subtitle
async function fetchEventDetails(eventId) {
    try {
        const response = await fetch(`http://localhost:8000/events`);
        const events = await response.json();
        const event = events.find(e => String(e.id) === String(eventId));
        if (event) {
            const dateOnly = event.start ? event.start.split('T')[0] : '';
            document.getElementById('eventHeading').textContent = event.name;
            document.getElementById('eventDate').textContent = dateOnly;
        }
    } catch {}
}
