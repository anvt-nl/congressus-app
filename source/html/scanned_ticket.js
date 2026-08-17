// Get event_id and ticket_id from query string
const params = new URLSearchParams(window.location.search);
const eventId = params.get("event_id");
const ticketId = params.get("ticket_id");
let audioContext;

function hideWarningOverlay() {
  document.getElementById("scanWarningOverlay")?.remove();
}

function getAudioContext() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;

  if (!audioContext) {
    audioContext = new AudioContext();
  }

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  return audioContext;
}

function makeGainNode(context, volume = 1) {
  const gainNode = context.createGain();
  gainNode.gain.value = volume;
  gainNode.connect(context.destination);
  return gainNode;
}

function playVictorySound() {
  const context = getAudioContext();
  if (!context) return;

  const start = context.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5];

  notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gainNode = makeGainNode(context, 0);
    const noteStart = start + index * 0.11;
    const noteEnd = noteStart + 0.2;

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(frequency, noteStart);
    gainNode.gain.setValueAtTime(0.0001, noteStart);
    gainNode.gain.exponentialRampToValueAtTime(1, noteStart + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

    oscillator.connect(gainNode);
    oscillator.start(noteStart);
    oscillator.stop(noteEnd + 0.02);
  });
}

function playBuzzDeepDropSound() {
  const context = getAudioContext();
  if (!context) return;

  const oscillator = context.createOscillator();
  const lfo = context.createOscillator();
  const modulationGain = context.createGain();
  const gainNode = makeGainNode(context, 0);
  const startTime = context.currentTime;
  const stopTime = startTime + 0.5;

  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(220, startTime);
  oscillator.frequency.exponentialRampToValueAtTime(60, stopTime);
  lfo.type = "square";
  lfo.frequency.setValueAtTime(20, startTime);
  modulationGain.gain.setValueAtTime(26, startTime);

  gainNode.gain.setValueAtTime(0.0001, startTime);
  gainNode.gain.exponentialRampToValueAtTime(1, startTime + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, stopTime);

  lfo.connect(modulationGain);
  modulationGain.connect(oscillator.frequency);
  oscillator.connect(gainNode);

  oscillator.start(startTime);
  lfo.start(startTime);
  oscillator.stop(stopTime + 0.02);
  lfo.stop(stopTime + 0.02);
}

function playSound(type) {
  try {
    if (type === "victory") {
      playVictorySound();
    } else if (type === "buzz-deep-drop") {
      playBuzzDeepDropSound();
    }
  } catch {}
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
              .map((tt) => {
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
      playSound("victory");
    }
    else {
      // Set the default background of ticketDetails to light red
      document.body.style.backgroundColor = 'red';
      const ticketDetailsDiv = document.getElementById('ticketDetails');
      if (ticketDetailsDiv) {
        ticketDetailsDiv.style.backgroundColor = '#ffe5e5'; // light red
      }
      playSound("buzz-deep-drop");
   
      // Show warning overlay if data.scan contains a string
      if (typeof data.scan === 'string' && data.scan) {
        const overlay = document.createElement('div');
        overlay.id = "scanWarningOverlay";
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
            <button type="button" data-action="close-warning" style="margin-top:2em;padding:0.5em 2em;font-size:1em;border:none;border-radius:0.5em;background:#b00;color:white;cursor:pointer;">Sluiten</button>
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
		`;
  } catch (_err) {
    document.getElementById("ticketDetails").innerHTML =
      '<div class="text-red-500">Failed to load ticket details.</div>';
  }
}
document.addEventListener("click", (event) => {
  if (event.target.closest('[data-action="close-warning"]')) {
    hideWarningOverlay();
  }
});

fetchTicketDetails();
