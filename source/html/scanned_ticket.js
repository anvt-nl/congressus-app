// Force reload previous page when going back
document.getElementById("backToOverviewBtn").onclick = (e) => {
  e.preventDefault();
  if (window.history.length > 1) {
    window.location = document.referrer || "scan.html";
  } else {
    window.location = "scan.html";
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
    const response = await fetch(`/ticket/${eventId}/${ticketId}`);
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
				<b>Ticket Types &amp; Aanwezigheid</b>
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

                // Always use default row class, no highlight
                const rowClass = "cursor-pointer hover:bg-blue-100";

                return `
              <tr class='${rowClass}'>
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

    // Set background to red if any ticket is present
    if (Array.isArray(data.tickets) && data.tickets.some(tt => String(tt.status_presence).toLowerCase().includes('present'))) {
      document.body.style.backgroundColor = 'red';
    }

    // Build vehicle/APK info section if available
    let vehicleInfo = "";
    if (data.kenteken || data.apk_status) {
      const apkData = data.apk_status || {};
      let apkStatusText = "-";
      let boxClass = "bg-slate-50"; // Default background

      if (apkData.vervaldatum_apk) {
        // Parse date (format: YYYYMMDD)
        const year = apkData.vervaldatum_apk.substring(0, 4);
        const month = apkData.vervaldatum_apk.substring(4, 6);
        const day = apkData.vervaldatum_apk.substring(6, 8);
        const apkDate = new Date(`${year}-${month}-${day}`);
        const today = new Date();
        const daysDiff = Math.floor((apkDate - today) / (1000 * 60 * 60 * 24));

        // Format as DD-MM-YYYY
        apkStatusText = `${day}-${month}-${year}`;

        // Color code background based on days until expiration
        if (daysDiff < 0) {
          boxClass = "bg-red-100"; // Expired - light red background
        } else {
          boxClass = "bg-green-100"; // Valid (or expiring soon) - light green background
        }
      }

      vehicleInfo = `<div class="mt-4 pt-4 border-t">
				<b>Voertuig Informatie</b>
				<div class="mt-2 ${boxClass} rounded p-3">
					<div><b>Kenteken:</b> ${data.kenteken || "-"}</div>
					${apkData.merk ? `<div><b>Merk:</b> ${apkData.merk}</div>` : ""}
					${apkData.handelsbenaming ? `<div><b>Model:</b> ${apkData.handelsbenaming}</div>` : ""}
					<div><b>APK Geldig tot:</b> ${apkStatusText}</div>
					${apkData.checked_at ? `<div class="text-xs text-slate-500 mt-1">Laatst gecontroleerd: ${apkData.checked_at}</div>` : ""}
				</div>
			</div>`;
    }

    document.getElementById("ticketDetails").innerHTML = `
			<div><b>Evenement:</b> ${data.event_name || ""}</div>
			<div><b>Datum:</b> ${eventDateStr}</div>
			<div><b>Naam:</b> ${data.addressee || ""}</div>
			<div><b>Email:</b> ${data.email || ""}</div>
			<div><b>Status:</b> ${data.status || ""}</div>
			${ticketTypesTable}
			${vehicleInfo}
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
