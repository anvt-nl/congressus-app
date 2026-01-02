// Force reload previous page when going back
document.getElementById("backToOverviewBtn").onclick = (e) => {
	e.preventDefault();
	if (window.history.length > 1) {
		window.location = document.referrer || "participations_overview.html";
	} else {
		window.location = "participations_overview.html";
	}
};

// Get event_id and ticket_id from query string
const params = new URLSearchParams(window.location.search);
const eventId = params.get("event_id");
const ticketId = params.get("ticket_id");

async function fetchTicketDetails() {
	if (!eventId || !ticketId) {
		document.getElementById("ticketDetails").innerHTML =
			'<div class="text-red-500">No event or ticket ID provided.</div>';
		return;
	}
	try {
		const response = await fetch(
			`http://localhost:8000/ticket/${eventId}/${ticketId}`,
		);
		if (!response.ok) throw new Error("Not found");
		const data = await response.json();
		// Only show date part (YYYY-MM-DD) for event_date
		const eventDateStr = data.event_date
			? String(data.event_date).split("T")[0]
			: "";
		// Build ticket types table if available
		let ticketTypesTable = "";
		if (Array.isArray(data.tickets) && data.tickets.length > 0) {
			ticketTypesTable = `<div class="mt-4">
				<b>Ticket Types & Aanwezigheid</b>
				<table class="min-w-full mt-2 mb-2 bg-slate-50 rounded border">
					<thead><tr>
						<th class="px-3 py-2 text-left">Type</th>
						<th class="px-3 py-2 text-left">Aanwezig</th>
					</tr></thead>
					<tbody>
						${data.tickets
							.map((tt, idx) => {
								const presenceText =
									tt.status_presence === "present" ? "ja" : "nee";
								return `
							<tr class='cursor-pointer hover:bg-blue-100' onclick='showPresenceOverlay(${idx})'>
								<td class="px-3 py-2">${tt.ticket_type || "-"}</td>
								<td class="px-3 py-2">${presenceText}</td>
							</tr>
							`;
							})
							.join("")}
					</tbody>
				</table>
			</div>`;
		}
		document.getElementById("ticketDetails").innerHTML = `
			<div><b>Evenement:</b> ${data.event_name || ""}</div>
			<div><b>Datum:</b> ${eventDateStr}</div>
			<div><b>Naam:</b> ${data.addressee || ""}</div>
			<div><b>Email:</b> ${data.email || ""}</div>
			<div><b>Status:</b> ${data.status || ""}</div>
			${ticketTypesTable}
			<div id="presenceOverlay" style="display:none; position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.3); z-index:1000; align-items:center; justify-content:center;">
				<div id="presenceOverlayContent" class="bg-white rounded-xl shadow-lg p-6 max-w-sm mx-auto mt-40 relative">
					<button onclick="hidePresenceOverlay()" style="position:absolute; top:10px; right:10px; font-size:18px;">&times;</button>
					<div id="presenceOverlayBody"></div>
				</div>
			</div>
		`;
		// Expose ticket data for overlay
		window._ticketData = data;
	} catch (err) {
		document.getElementById("ticketDetails").innerHTML =
			'<div class="text-red-500">Failed to load ticket details.</div>';
	}
}
fetchTicketDetails();

// Overlay logic
window.showPresenceOverlay = (idx) => {
	const ticket = window._ticketData.tickets[idx];
	const overlay = document.getElementById("presenceOverlay");
	const body = document.getElementById("presenceOverlayBody");
	if (!ticket) return;
	body.innerHTML = `
		<div class="mb-4 font-bold">Wijzig aanwezigheid voor: ${ticket.ticket_type || "-"}</div>
		<form id="presenceForm">
			<label class="block mb-2">
				<input type="radio" name="status_presence" value="present" ${ticket.status_presence === "present" ? "checked" : ""}> Aanwezig
			</label>
			<label class="block mb-2">
				<input type="radio" name="status_presence" value="unknown" ${!ticket.status_presence || ticket.status_presence === "unknown" ? "checked" : ""}> Afwezig
			</label>
			<button type="submit" class="mt-4 px-4 py-2 bg-blue-600 text-white rounded">Opslaan</button>
		</form>
	`;
	overlay.style.display = "flex";
	document.getElementById("presenceForm").onsubmit = async (e) => {
		e.preventDefault();
		const form = e.target;
		const newStatus = form.status_presence.value;
		if (window._ticketData.tickets[idx].status_presence !== newStatus) {
			const confirmed = confirm(
				"Weet je zeker dat je de aanwezigheid wilt aanpassen?",
			);
			if (!confirmed) return;
		}
		// Update local data and re-render
		window._ticketData.tickets[idx].status_presence = newStatus;
		hidePresenceOverlay();
		// Send update to backend
		try {
			await fetch(
				`http://localhost:8000/ticket/${eventId}/${ticketId}/${newStatus}`,
				{
					method: "GET",
					headers: { "Content-Type": "application/json" },
				},
			);
		} catch (e) {}
		// Always refresh data from backend after update
		fetchTicketDetails();
	};
};
window.hidePresenceOverlay = () => {
	document.getElementById("presenceOverlay").style.display = "none";
};
