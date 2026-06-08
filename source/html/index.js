const progressClassMap = {
  Leden: {
    dark: "bg-blue-800",
    medium: "bg-blue-500",
    light: "bg-blue-200",
  },
  Vrijrijders: {
    dark: "bg-indigo-800",
    medium: "bg-indigo-500",
    light: "bg-indigo-200",
  },
};

let allEvents = [];
let forceSyncTimeout;

function initIcons() {
  if (window.lucide) {
    lucide.createIcons();
  }
}

function showForceSyncMsg() {
  const msg = document.getElementById("forceSyncMsg");
  msg.classList.remove("hidden");
  setTimeout(() => msg.classList.add("hidden"), 2000);
}

function setSyncButtonState(syncing) {
  const button = document.getElementById("syncBtn");
  if (!button) return;

  button.disabled = syncing;
  button.classList.toggle("opacity-60", syncing);
  button.classList.toggle("cursor-not-allowed", syncing);
}

async function confirmAndForceSync() {
  return confirm(
    "Are you sure you want to force sync? This will refresh all events from the backend.",
  );
}

function setStatusHtml(html) {
  const statusText = document.getElementById("api-status");
  if (statusText) {
    statusText.innerHTML = html;
  }
}

async function syncEvents() {
  setSyncButtonState(true);
  setStatusHtml(
    '<span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span> Syncing with Congressus backend...',
  );

  try {
    allEvents = await window.AnvtEventsCache.fetchEventsCached({ forceRefresh: true });
    renderEvents(allEvents);
    setStatusHtml(
      '<span class="w-2 h-2 rounded-full bg-emerald-500"></span> Synced with backend',
    );
    showForceSyncMsg();
  } catch (error) {
    setStatusHtml(
      `<span class="w-2 h-2 rounded-full bg-red-500"></span> Error: ${error.message}`,
    );
  } finally {
    setSyncButtonState(false);
  }
}

async function fetchEvents() {
  try {
    allEvents = await window.AnvtEventsCache.fetchEventsCached();
    renderEvents(allEvents);
    setStatusHtml(
      '<span class="w-2 h-2 rounded-full bg-emerald-500"></span> Connected to Backend',
    );
  } catch (error) {
    setStatusHtml(
      `<span class="w-2 h-2 rounded-full bg-red-500"></span> Error: ${error.message}`,
    );
    document.getElementById("eventGrid").innerHTML =
      '<div class="col-span-full text-center py-20 text-red-500 font-medium border-2 border-dashed rounded-2xl">Make sure your backend is running</div>';
  }
}

function renderProgress(label, sold, total, present) {
  const classes = progressClassMap[label] || progressClassMap.Vrijrijders;

  sold = typeof sold === "number" ? sold : 0;
  total = typeof total === "number" ? total : 0;
  present = typeof present === "number" ? present : 0;

  let presentPct = total > 0 ? (present / total) * 100 : 0;
  let soldPct = total > 0 ? ((sold - present) / total) * 100 : 0;
  let availPct = total > 0 ? ((total - sold) / total) * 100 : 0;

  if (!total) {
    presentPct = sold > 0 ? (present / sold) * 100 : 0;
    soldPct = sold > 0 ? ((sold - present) / sold) * 100 : 0;
    availPct = 0;
  }

  return `
    <div>
      <div class="flex items-center gap-2 text-[11px] font-bold text-slate-400 uppercase mb-1">
        <span>${label}</span>
        <span class="text-slate-700 normal-case font-normal">${present} / ${sold} / ${total || "\u221e"}</span>
      </div>
      <div class="w-full bg-slate-100 h-6 rounded-full overflow-hidden flex relative">
        <div class="${classes.dark} h-full transition-all duration-1000" style="width: ${presentPct}%; min-width:1px;"></div>
        <div class="${classes.medium} h-full transition-all duration-1000" style="width: ${soldPct}%; min-width:1px;"></div>
        <div class="${classes.light} h-full transition-all duration-1000" style="width: ${availPct}%; min-width:1px;"></div>
      </div>
    </div>`;
}

function renderEvents(events) {
  document.getElementById("loadingEvents").style.display = "none";

  const todayStr = new Date().toISOString().split("T")[0];
  const future = [];
  const today = [];
  const past = [];

  for (const event of events) {
    const dateOnly = event.start ? event.start.split("T")[0] : "";
    if (dateOnly > todayStr) {
      future.push({ ...event, _dateOnly: dateOnly });
    } else if (dateOnly === todayStr) {
      today.push(event);
    } else {
      past.push(event);
    }
  }

  future.sort((a, b) => a._dateOnly.localeCompare(b._dateOnly));

  const renderCard = (event, faded = false) => {
    const dateOnly = event.start ? event.start.split("T")[0] : "";
    const nietLedenBar =
      event.niet_leden_sold_tickets === 0 && event.niet_leden_num_tickets === 0
        ? ""
        : renderProgress(
            "Vrijrijders",
            event.niet_leden_sold_tickets,
            event.niet_leden_num_tickets,
            event.present_vrijrijders,
          );

    return `
      <div
        data-action="open-event"
        data-event-id="${event.id}"
        class="bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-xl transition-all cursor-pointer group ${faded ? "opacity-70" : ""}"
      >
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-bold text-slate-900 leading-tight">${event.name}</h3>
        </div>
        <div class="text-xs text-slate-500 mb-4">${dateOnly}</div>
        <div class="space-y-4">
          ${renderProgress(
            "Leden",
            event.leden_sold_tickets,
            event.leden_num_tickets,
            event.present_leden,
          )}
          ${nietLedenBar}
        </div>
      </div>`;
  };

  document.getElementById("futureEvents").innerHTML = future.map((event) => renderCard(event)).join("");
  document.getElementById("todayEvents").innerHTML = today.map((event) => renderCard(event)).join("");
  document.getElementById("pastEvents").innerHTML = past
    .map((event) => renderCard(event, true))
    .join("");

  document.getElementById("futureSection").style.display = future.length ? "" : "none";
  document.getElementById("todaySection").style.display = today.length ? "" : "none";
  document.getElementById("pastSection").style.display = past.length ? "" : "none";
}

function toggleSection(section) {
  const sectionDiv = document.getElementById(`${section}Events`);
  const button = document.getElementById(
    `toggle${section.charAt(0).toUpperCase()}${section.slice(1)}`,
  );
  if (!sectionDiv || !button) return;

  const isHidden = sectionDiv.style.display === "none";
  sectionDiv.style.display = isHidden ? "" : "none";
  button.textContent = isHidden ? "Verbergen" : "Tonen";
}

function handleEventGridClick(event) {
  const toggleButton = event.target.closest('[data-action="toggle-section"]');
  if (toggleButton) {
    toggleSection(toggleButton.dataset.section);
    return;
  }

  const eventCard = event.target.closest('[data-action="open-event"]');
  if (eventCard) {
    window.location.href = `participations_overview.html?event_id=${eventCard.dataset.eventId}`;
  }
}

function bindForceSyncHandlers() {
  const syncBtn = document.getElementById("syncBtn");
  if (!syncBtn) return;

  syncBtn.addEventListener("click", syncEvents);
  syncBtn.addEventListener("touchstart", () => {
    forceSyncTimeout = setTimeout(async () => {
      if (await confirmAndForceSync()) {
        await syncEvents();
      }
    }, 2000);
  });
  syncBtn.addEventListener("touchend", () => {
    clearTimeout(forceSyncTimeout);
  });
}

document.addEventListener("keydown", async (event) => {
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "r") {
    if (await confirmAndForceSync()) {
      await syncEvents();
    }
  }
});

document.addEventListener("DOMContentLoaded", () => {
  initIcons();
  document.getElementById("eventGrid")?.addEventListener("click", handleEventGridClick);
  bindForceSyncHandlers();
  fetchEvents();
});
