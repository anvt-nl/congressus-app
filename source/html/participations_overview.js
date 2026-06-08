const params = new URLSearchParams(window.location.search);
const eventId = params.get("event_id");

const currentSort = { key: null, asc: true };
const sectionVisibility = {};
let showOnlyApproved = true;
let hidePresent = false;
let participationsRawData = [];
let apkStatusData = {};
let forceSyncTimeout;

function initIcons() {
  if (window.lucide) {
    lucide.createIcons();
  }
}

function showForceSyncMsg(message = "Force sync voltooid!") {
  const msg = document.getElementById("forceSyncMsg");
  if (!msg) return;
  msg.textContent = message;
  msg.classList.remove("hidden");
  setTimeout(() => {
    msg.classList.add("hidden");
    msg.textContent = "Force sync voltooid!";
  }, 3000);
}

async function confirmAndForceSync() {
  return confirm(
    "Weet je zeker dat je wilt force syncen? Dit haalt namelijk alle aanmeldingen opnieuw op van de backend.",
  );
}

function sortData(data) {
  const sortKey = currentSort.key || "addressee";
  const sortAsc = currentSort.key ? currentSort.asc : true;

  return [...data].sort((a, b) => {
    const aVal = String(a[sortKey] || "").toLowerCase();
    const bVal = String(b[sortKey] || "").toLowerCase();
    if (aVal < bVal) return sortAsc ? -1 : 1;
    if (aVal > bVal) return sortAsc ? 1 : -1;
    return 0;
  });
}

function getFilteredData() {
  let filtered = sortData(participationsRawData);

  if (showOnlyApproved) {
    filtered = filtered.filter((participation) => participation.status === "approved");
  }

  if (hidePresent) {
    filtered = filtered.filter(
      (participation) =>
        !participation.presence_count || participation.presence_count === 0,
    );
  }

  return filtered;
}

function getApkBackgroundColor(vervaldatum) {
  if (!vervaldatum) return "bg-yellow-100";

  const year = vervaldatum.substring(0, 4);
  const month = vervaldatum.substring(4, 6);
  const day = vervaldatum.substring(6, 8);
  const apkDate = new Date(`${year}-${month}-${day}`);
  const today = new Date();
  const daysDiff = Math.floor((apkDate - today) / (1000 * 60 * 60 * 24));

  return daysDiff < 0 ? "bg-red-100" : "bg-green-100";
}

function renderSubTable(title, rows) {
  if (!rows.length) return "";

  const total = rows.length;
  const presentCount = rows.filter((participation) => participation.presence_count > 0).length;
  const sectionId = `section_${title.replace(/\s+/g, "").toLowerCase()}`;
  const hidden = sectionVisibility[sectionId] === false;
  const arrow = (key) => {
    if (currentSort.key !== key) return "";
    return currentSort.asc ? " &#8595;" : " &#8593;";
  };

  const bodyHtml = rows
    .filter((participation) => participation.status !== "unsubscribed")
    .map((participation) => {
      const ticketId =
        participation.id || participation.ticket_id || participation.member_id || "";
      const present =
        participation.presence_count !== undefined && participation.presence_count !== null
          ? participation.presence_count
          : "";
      const bought = participation.tickets !== undefined ? participation.tickets : "";
      const presenceStr =
        bought === null || bought === undefined || bought === ""
          ? "-"
          : `${present} / ${bought}`;

      const apkData = apkStatusData[ticketId];
      let apkBgColor = "";
      let apkTextColor = "";

      if (!participation.kenteken) {
        apkBgColor = "bg-gray-100";
      } else if (apkData) {
        if (apkData.vervaldatum_apk) {
          apkBgColor = getApkBackgroundColor(apkData.vervaldatum_apk);
        } else if (apkData.merk || apkData.handelsbenaming) {
          apkBgColor = "bg-yellow-100";
        } else {
          apkTextColor = "text-red-600 font-bold";
        }
      } else {
        apkTextColor = "text-red-600 font-bold";
      }

      const nameTitle =
        participation.lid_valid === false && participation.lid_invalid_reason
          ? participation.lid_invalid_reason.replace(/"/g, "&quot;")
          : participation.addressee || "";
      const nameStyle =
        participation.lid_valid === false
          ? "background-color: red; color: white; padding: 2px 6px; border-radius: 4px;"
          : "";
      const rowClasses = `border-t transition${
        participation.status === "approved"
          ? " cursor-pointer hover:bg-slate-100"
          : " bg-slate-50"
      }`;

      return `
        <tr
          class="${rowClasses}"
          ${
            participation.status === "approved"
              ? `data-action="open-ticket" data-ticket-id="${ticketId}"`
              : ""
          }
        >
          <td class="px-2 py-2 truncate max-w-[120px]" title="${nameTitle}"${
            nameStyle ? ` style="${nameStyle}"` : ""
          }>${participation.addressee || ""}</td>
          <td class="px-2 py-2 truncate max-w-[120px]" title="${participation.email || ""}">${participation.email || ""}</td>
          <td class="px-2 py-2 truncate max-w-[120px] ${apkBgColor} ${apkTextColor}" title="${participation.kenteken || ""}">${participation.kenteken || ""}</td>
          <td class="px-2 py-2">${presenceStr}</td>
        </tr>`;
    })
    .join("");

  return `
    <div class="mb-4">
      <div class="flex items-center justify-between mt-6 mb-2">
        <h2 class="text-lg font-bold">${title} <span class="text-slate-500 font-normal text-sm">(${presentCount} / ${total})</span></h2>
        <button type="button" data-action="toggle-section" data-section-id="${sectionId}" id="btn_${sectionId}" class="text-xs text-blue-600 underline ml-4">${hidden ? "Toon" : "Verberg"}</button>
      </div>
      <div id="${sectionId}" style="${hidden ? "display:none;" : ""}" class="overflow-x-auto">
        <table class="min-w-full bg-white rounded-xl shadow text-sm">
          <thead>
            <tr>
              <th class="px-2 py-2 text-left cursor-pointer select-none" data-action="sort" data-sort-key="addressee">Naam${arrow("addressee")}</th>
              <th class="px-2 py-2 text-left cursor-pointer select-none" data-action="sort" data-sort-key="email">Email${arrow("email")}</th>
              <th class="px-2 py-2 text-left cursor-pointer select-none" data-action="sort" data-sort-key="kenteken">Kenteken${arrow("kenteken")}</th>
              <th class="px-2 py-2 text-left">Aanw.</th>
            </tr>
          </thead>
          <tbody>${bodyHtml}</tbody>
        </table>
      </div>
    </div>`;
}

function renderTable(participations = null) {
  if (participations) {
    participationsRawData = [...participations];
  }

  const table = document.getElementById("participationsTable");
  const filtered = getFilteredData();
  if (!filtered.length) {
    table.innerHTML =
      '<div class="text-slate-400">No participations found for this event.</div>';
    return;
  }

  const members = filtered.filter((participation) => participation.member_id);
  const vrijrijders = filtered.filter((participation) => !participation.member_id);
  table.innerHTML = `${renderSubTable("Leden", members)}<div class="h-8"></div>${renderSubTable("Vrijrijders", vrijrijders)}`;
}

async function fetchApkStatus(currentEventId) {
  try {
    const response = await fetch(`/apk-status/${currentEventId}`);
    if (!response.ok) {
      throw new Error("APK status ophalen mislukt.");
    }

    const data = await response.json();
    apkStatusData = {};
    for (const item of data) {
      apkStatusData[item.participation_id] = item;
    }
  } catch {
    apkStatusData = {};
  }
}

async function fetchParticipations(currentEventId) {
  document.getElementById("loading").style.display = "";
  try {
    const [participationsResponse] = await Promise.all([
      fetch(`/participations/${currentEventId}`),
      fetchApkStatus(currentEventId),
    ]);

    if (!participationsResponse.ok) {
      throw new Error(`Network response was not ok: ${participationsResponse.statusText}`);
    }

    renderTable(await participationsResponse.json());
  } catch (error) {
    document.getElementById("participationsTable").innerHTML =
      `<div class="text-red-500">Failed to load participations: ${error.message}</div>`;
  } finally {
    document.getElementById("loading").style.display = "none";
  }
}

async function refreshParticipations() {
  if (!eventId) return;
  await fetchParticipations(eventId);
}

async function triggerForceSync() {
  if (!eventId || !(await confirmAndForceSync())) return;

  try {
    const response = await fetch(`/participations/${eventId}/refresh`);
    const data = await response.json();
    if (data.status === "accepted") {
      showForceSyncMsg();
    }
  } catch {}

  await fetchParticipations(eventId);
}

async function collectAllTickets() {
  if (!eventId) return;

  const btn = document.getElementById("collectTicketsBtn");
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML =
    '<span class="animate-spin mr-2"><i data-lucide="loader-2" class="w-4 h-4"></i></span> Collecting...';
  initIcons();

  try {
    const response = await fetch(`/event/${eventId}/collect-tickets`);
    const data = await response.json();
    if (data.status === "accepted") {
      showForceSyncMsg("Collection started in background!");
      await fetchParticipations(eventId);
    } else {
      alert(`Failed to start collection: ${data.message || "Unknown error"}`);
    }
  } catch {
    alert("Error contacting backend.");
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
    initIcons();
  }
}

function handleTableClick(event) {
  const toggleButton = event.target.closest('[data-action="toggle-section"]');
  if (toggleButton) {
    const sectionId = toggleButton.dataset.sectionId;
    const section = document.getElementById(sectionId);
    const isHidden = section.style.display === "none";
    section.style.display = isHidden ? "" : "none";
    toggleButton.textContent = isHidden ? "Verberg" : "Toon";
    sectionVisibility[sectionId] = isHidden;
    return;
  }

  const sortHeader = event.target.closest('[data-action="sort"]');
  if (sortHeader) {
    const key = sortHeader.dataset.sortKey;
    if (currentSort.key === key) {
      currentSort.asc = !currentSort.asc;
    } else {
      currentSort.key = key;
      currentSort.asc = true;
    }
    renderTable();
    return;
  }

  const row = event.target.closest('[data-action="open-ticket"]');
  if (row) {
    window.location.href = `ticket.html?event_id=${eventId}&ticket_id=${row.dataset.ticketId}`;
  }
}

document.addEventListener("keydown", async (event) => {
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "r") {
    await triggerForceSync();
  }
});

document.addEventListener("DOMContentLoaded", () => {
  initIcons();

  document.getElementById("backToEventsBtn")?.addEventListener("click", (event) => {
    event.preventDefault();
    window.location = "index.html";
  });
  document.getElementById("toggleApprovedBtn")?.addEventListener("click", () => {
    showOnlyApproved = !showOnlyApproved;
    document.getElementById("toggleApprovedBtn").textContent = showOnlyApproved
      ? "Toon alles"
      : "Toon alleen goedgekeurd";
    renderTable();
  });
  document.getElementById("hidePresentSwitch")?.addEventListener("change", (event) => {
    hidePresent = event.target.checked;
    renderTable();
  });
  document.getElementById("syncBtn")?.addEventListener("click", refreshParticipations);
  document.getElementById("syncBtn")?.addEventListener("touchstart", () => {
    forceSyncTimeout = setTimeout(triggerForceSync, 2000);
  });
  document.getElementById("syncBtn")?.addEventListener("touchend", () => {
    clearTimeout(forceSyncTimeout);
  });
  document.getElementById("collectTicketsBtn")?.addEventListener("click", collectAllTickets);
  document.getElementById("participationsTable")?.addEventListener("click", handleTableClick);

  if (eventId) {
    fetchParticipations(eventId);
    if (typeof fetchEventDetails === "function") {
      fetchEventDetails(eventId);
    }
  } else {
    document.getElementById("loading").textContent = "No event ID provided.";
  }
});
