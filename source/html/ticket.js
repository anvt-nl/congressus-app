const params = new URLSearchParams(window.location.search);
const eventId = params.get("event_id");
const ticketId = params.get("ticket_id");
let currentTicketData = null;

function getTicketDetailsElement() {
  return document.getElementById("ticketDetails");
}

function hidePresenceOverlay() {
  const overlay = document.getElementById("presenceOverlay");
  if (overlay) {
    overlay.style.display = "none";
  }
}

function showPresenceOverlay(index) {
  const overlay = document.getElementById("presenceOverlay");
  const body = document.getElementById("presenceOverlayBody");
  const ticket = currentTicketData?.tickets?.[index];
  if (!overlay || !body || !ticket) return;

  body.innerHTML = `
    <div class="mb-4 font-bold">Wijzig aanwezigheid voor: ${ticket.ticket_type || "-"}</div>
    <form id="presenceForm" data-ticket-index="${index}">
      <label class="block mb-2">
        <input type="radio" name="status_presence" value="present" ${
          ticket.status_presence === "present" ? "checked" : ""
        }> Aanwezig
      </label>
      <label class="block mb-2">
        <input type="radio" name="status_presence" value="unknown" ${
          !ticket.status_presence || ticket.status_presence === "unknown" ? "checked" : ""
        }> Afwezig
      </label>
      <button type="submit" class="mt-4 px-4 py-2 bg-blue-600 text-white rounded">Opslaan</button>
    </form>`;
  overlay.style.display = "flex";
}

function renderTicketDetails(data) {
  const eventDateStr = data.event_date ? String(data.event_date).split("T")[0] : "";

  const ticketTypesTable =
    Array.isArray(data.tickets) && data.tickets.length > 0
      ? `<div class="mt-4">
          <b>Ticket Types &amp; Aanwezigheid</b>
          <table class="min-w-full mt-2 mb-2 bg-slate-50 rounded border">
            <thead><tr>
              <th class="px-3 py-2 text-left">Type</th>
              <th class="px-3 py-2 text-left">QR Code</th>
              <th class="px-3 py-2 text-left">Aanwezig</th>
            </tr></thead>
            <tbody>
              ${data.tickets
                .map((ticket, index) => {
                  const qrImage = ticket.ticket_qrcode
                    ? `<img src="${ticket.ticket_qrcode}" alt="QR Code" class="w-16 h-16 object-contain border rounded bg-white hover:scale-[3] transform transition origin-left relative z-10" title="Hover to enlarge" />`
                    : "-";
                  return `
                    <tr class="cursor-pointer hover:bg-blue-100" data-action="open-presence" data-ticket-index="${index}">
                      <td class="px-3 py-2">${ticket.ticket_type || "-"}</td>
                      <td class="px-3 py-2" data-action="ignore-row-click">${qrImage}</td>
                      <td class="px-3 py-2">${ticket.status_presence === "present" ? "ja" : "nee"}</td>
                    </tr>`;
                })
                .join("")}
            </tbody>
          </table>
        </div>`
      : "";

  const membershipWarning =
    data.lid_valid === false && data.lid_invalid_reason
      ? `<div class="mt-4 rounded-lg border border-red-300 bg-red-100 p-4 text-red-800">
          <div class="font-bold">Lidmaatschap niet geldig</div>
          <div class="mt-1">${data.lid_invalid_reason}</div>
        </div>`
      : "";

  let vehicleInfo = "";
  if (data.kenteken || data.apk_status) {
    const apkData = data.apk_status || {};
    let apkStatusText = "-";
    let boxClass = "bg-slate-50";

    if (apkData.vervaldatum_apk) {
      const year = apkData.vervaldatum_apk.substring(0, 4);
      const month = apkData.vervaldatum_apk.substring(4, 6);
      const day = apkData.vervaldatum_apk.substring(6, 8);
      const apkDate = new Date(`${year}-${month}-${day}`);
      const today = new Date();
      const daysDiff = Math.floor((apkDate - today) / (1000 * 60 * 60 * 24));
      apkStatusText = `${day}-${month}-${year}`;
      boxClass = daysDiff < 0 ? "bg-red-100" : "bg-green-100";
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

  getTicketDetailsElement().innerHTML = `
    <div><b>Evenement:</b> ${data.event_name || ""}</div>
    <div><b>Datum:</b> ${eventDateStr}</div>
    <div><b>Naam:</b> <span class="${data.lid_valid === false ? "text-red-700 font-bold" : ""}">${data.addressee || ""}</span></div>
    <div><b>Email:</b> ${data.email || ""}</div>
    <div><b>Status:</b> ${data.status || ""}</div>
    ${membershipWarning}
    ${ticketTypesTable}
    ${vehicleInfo}
    <div id="presenceOverlay" style="display:none; position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.3); z-index:1000; align-items:center; justify-content:center;">
      <div id="presenceOverlayContent" class="bg-white rounded-xl shadow-lg p-6 max-w-sm mx-auto mt-40 relative">
        <button type="button" data-action="close-overlay" style="position:absolute; top:10px; right:10px; font-size:18px;">&times;</button>
        <div id="presenceOverlayBody"></div>
      </div>
    </div>`;
}

async function fetchTicketDetails() {
  if (!eventId || !ticketId) {
    getTicketDetailsElement().innerHTML =
      '<div class="text-red-500">No event or ticket ID provided.</div>';
    return;
  }

  try {
    const response = await fetch(`/ticket/${eventId}/${ticketId}`);
    if (!response.ok) throw new Error("Not found");
    currentTicketData = await response.json();
    renderTicketDetails(currentTicketData);
  } catch {
    getTicketDetailsElement().innerHTML =
      '<div class="text-red-500">Failed to load ticket details.</div>';
  }
}

async function handlePresenceSubmit(event) {
  if (event.target.id !== "presenceForm") return;

  event.preventDefault();
  const form = event.target;
  const index = Number(form.dataset.ticketIndex);
  const newStatus = form.status_presence.value;
  if (currentTicketData.tickets[index].status_presence !== newStatus) {
    const confirmed = confirm(
      "Weet je zeker dat je de aanwezigheid wilt aanpassen?",
    );
    if (!confirmed) return;
  }

  currentTicketData.tickets[index].status_presence = newStatus;
  hidePresenceOverlay();

  try {
    await fetch(`/ticket/${eventId}/${ticketId}/${newStatus}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
  } catch {}

  await fetchTicketDetails();
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("backToOverviewBtn")?.addEventListener("click", (event) => {
    event.preventDefault();
    if (window.history.length > 1) {
      window.location = document.referrer || "participations_overview.html";
    } else {
      window.location = "participations_overview.html";
    }
  });

  getTicketDetailsElement()?.addEventListener("click", (event) => {
    if (event.target.closest('[data-action="ignore-row-click"]')) {
      return;
    }

    const closeButton = event.target.closest('[data-action="close-overlay"]');
    if (closeButton) {
      hidePresenceOverlay();
      return;
    }

    const row = event.target.closest('[data-action="open-presence"]');
    if (row) {
      showPresenceOverlay(Number(row.dataset.ticketIndex));
    }
  });

  getTicketDetailsElement()?.addEventListener("submit", handlePresenceSubmit);

  fetchTicketDetails();
});
