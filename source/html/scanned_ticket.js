// ...removed backToOverviewBtn handler, as button no longer exists...

// Get event_id and ticket_id from query string
const params = new URLSearchParams(window.location.search);
const eventId = params.get("event_id");
const ticketId = params.get("ticket_id");

function playSound(type) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    if (type === 'beep') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      osc.start();
      gainNode.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.3);
      osc.stop(ctx.currentTime + 0.3);
    } else if (type === 'buzzer') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
      osc.start();
      osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.5);
      gainNode.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.5);
      osc.stop(ctx.currentTime + 0.5);
    }
  } catch (e) {
    console.error("Audio playback failed", e);
  }
}

async function fetchTicketDetails() {
  if (!eventId || !ticketId) {
    document.getElementById("ticketDetails").innerHTML =
      '<div class="text-red-500">No event or ticket ID provided.</div>';
    return;
  }
  try {
    const response = await fetch(`/scan-ticket/${eventId}/${ticketId}`);
    if (!response.ok) throw new Error("Not found");
    const data = await response.json();
    // Only show date part (YYYY-MM-DD) for event_date
    const eventDateStr = data.event_date
      ? String(data.event_date).split("T")[0]
      : "";
    // Show the scan status from data.scan if it's a string, otherwise show "N/A"
    const scanStatus = typeof data.scan === "string" && data.scan ? data.scan : "N/A";

    // Build ticket types table if available
    let ticketTypesTable = "";
    if (Array.isArray(data.tickets) && data.tickets.length > 0) {
      ticketTypesTable = `<div class="mt-4">
        <b>Scan status:</b> <span style="font-weight:bold;">${data.scan}</span>
        <br/>
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

    // Set background to green if scan is a string and successful
    if (typeof data.scan === 'string' && data.scan === "OK") {
      document.body.style.backgroundColor = 'green';
      const ticketDetailsDiv = document.getElementById('ticketDetails');
      if (ticketDetailsDiv) {
        ticketDetailsDiv.style.backgroundColor = '#d2ffd2'; // light green
      }
      playSound('beep');
    }
    else {
      // Set the default background of ticketDetails to light red
      document.body.style.backgroundColor = 'red';
      const ticketDetailsDiv = document.getElementById('ticketDetails');
      if (ticketDetailsDiv) {
        ticketDetailsDiv.style.backgroundColor = '#ffe5e5'; // light red
      }
      playSound('buzzer');
   
      // Show warning overlay if data.scan contains a string
      if (typeof data.scan === 'string' && data.scan) {
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.background = 'rgba(255,0,0,0.85)';
        overlay.style.zIndex = '2000';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.innerHTML = `
          <div style="background:white;padding:2em 3em;border-radius:1em;box-shadow:0 0 20px #900;text-align:center;max-width:90vw;">
            <h2 style="color:#b00;margin-bottom:1em;">Waarschuwing</h2>
            <div style="font-size:1.3em;color:#b00;font-weight:bold;">${data.scan}</div>
            <button style="margin-top:2em;padding:0.5em 2em;font-size:1em;border:none;border-radius:0.5em;background:#b00;color:white;cursor:pointer;" onclick="this.parentElement.parentElement.remove()">Sluiten</button>
          </div>
        `;
        document.body.appendChild(overlay);
      }
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
