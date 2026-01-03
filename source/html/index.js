// index.js - logic for index.html

// Visual confirmation for force sync
function showForceSyncMsg() {
	const msg = document.getElementById("forceSyncMsg");
	msg.classList.remove("hidden");
	setTimeout(() => msg.classList.add("hidden"), 2000);
}

// Confirm before force sync
async function confirmAndForceSync() {
	const proceed = confirm(
		"Are you sure you want to force sync? This will refresh all events from the backend.",
	);
	if (!proceed) return false;
	return true;
}

// Hidden force sync: Ctrl+Shift+R (desktop)
document.addEventListener("keydown", async (e) => {
	if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "r") {
		if (await confirmAndForceSync()) {
			document.getElementById("api-status").innerHTML =
				`<span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span> Force syncing...`;
			try {
				await fetch("/events/refresh", { method: "POST" });
				showForceSyncMsg();
			} catch {}
			fetchEvents();
		}
	}
});

// Hidden force sync: long-press on Sync Data button (mobile)
let forceSyncTimeout;
const syncBtn = document.getElementById("syncBtn");
syncBtn.addEventListener("touchstart", () => {
	forceSyncTimeout = setTimeout(async () => {
		if (await confirmAndForceSync()) {
			document.getElementById("api-status").innerHTML =
				`<span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span> Force syncing...`;
			try {
				await fetch("/events/refresh", { method: "POST" });
				showForceSyncMsg();
			} catch {}
			fetchEvents();
		}
	}, 2000); // 2 seconds long-press
});
syncBtn.addEventListener("touchend", () => {
	clearTimeout(forceSyncTimeout);
});

const API_URL = "/events";
let allEvents = [];

// 1. Fetch Data from Backend
async function fetchEvents() {
	const statusText = document.getElementById("api-status");
	try {
		const response = await fetch(API_URL);
		if (!response.ok) throw new Error("Backend unreachable");

		allEvents = await response.json();
		renderEvents(allEvents);

		statusText.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500"></span> Connected to Backend`;
	} catch (err) {
		statusText.innerHTML = `<span class="w-2 h-2 rounded-full bg-red-500"></span> Error: ${err.message}`;
		document.getElementById("eventGrid").innerHTML =
			`<div class="col-span-full text-center py-20 text-red-500 font-medium border-2 border-dashed rounded-2xl">Make sure your backend is running</div>`;
	}
}

// 2. Render Cards to Grid
function renderEvents(events) {
	document.getElementById("loadingEvents").style.display = "none";
	// Clear all sections
	document.getElementById("futureEvents").innerHTML = "";
	document.getElementById("todayEvents").innerHTML = "";
	document.getElementById("pastEvents").innerHTML = "";

	const todayStr = new Date().toISOString().split("T")[0];
	const future = [];
	const today = [];
	const past = [];

	events.forEach((event) => {
		const dateOnly = event.start ? event.start.split("T")[0] : "";
		if (dateOnly > todayStr) {
			future.push({ ...event, _dateOnly: dateOnly });
		} else if (dateOnly === todayStr) {
			today.push(event);
		} else {
			past.push(event);
		}
	});
	// Sort future events by date ascending
	future.sort((a, b) => a._dateOnly.localeCompare(b._dateOnly));

	const renderCard = (event, faded = false) => {
		const dateOnly = event.start ? event.start.split("T")[0] : "";
		let ledenBar = renderProgress(
			"Leden",
			event.leden_sold_tickets,
			event.leden_num_tickets,
			"bg-blue-500",
			event.present_leden
		);
		let nietLedenBar = "";
		if (!(event.niet_leden_sold_tickets == 0 && event.niet_leden_num_tickets == 0)) {
			nietLedenBar = renderProgress(
				"Vrijrijders",
				event.niet_leden_sold_tickets,
				event.niet_leden_num_tickets,
				"bg-indigo-400",
				event.present_vrijrijders
			);
		}
		return `
			<div class="bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-xl transition-all group ${faded ? "opacity-70" : ""}">
				<div class="flex justify-between items-center mb-4">
					<h3 class="text-lg font-bold text-slate-900 leading-tight">${event.name}</h3>
					<button onclick="goToOverview(${event.id})" class="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
						<i data-lucide="info" class="w-5 h-5"></i>
					</button>
				</div>
				<div class="text-xs text-slate-500 mb-4">${dateOnly}</div>
				<div class="space-y-4">
					${ledenBar}
					${nietLedenBar}
				</div>
			</div>`;
	};

	// Show/hide sections based on content
	const futureSection = document.getElementById("futureSection");
	const todaySection = document.getElementById("todaySection");
	const pastSection = document.getElementById("pastSection");

	document.getElementById("futureEvents").innerHTML = future
		.map((e) => renderCard(e))
		.join("");
	document.getElementById("todayEvents").innerHTML = today
		.map((e) => renderCard(e))
		.join("");
	document.getElementById("pastEvents").innerHTML = past
		.map((e) => renderCard(e, true))
		.join("");

	futureSection.style.display = future.length ? "" : "none";
	todaySection.style.display = today.length ? "" : "none";
	pastSection.style.display = past.length ? "" : "none";

	lucide.createIcons();
}

// Go to overview page for event participations
function goToOverview(eventId) {
	window.location.href = `participations_overview.html?event_id=${eventId}`;
}

function toggleSection(section) {
	const sectionDiv = document.getElementById(section + "Events");
	const btn = document.getElementById(
		"toggle" + section.charAt(0).toUpperCase() + section.slice(1),
	);
	if (sectionDiv.style.display === "none") {
		sectionDiv.style.display = "";
		btn.textContent = "Verbergen";
	} else {
		sectionDiv.style.display = "none";
		btn.textContent = "Tonen";
	}
}

function renderProgress(label, sold, total, color, present) {
	// Colors: dark for present, medium for sold-present, light for available
	// Use blue for leden, indigo for vrijrijders
	let base = label === "Leden" ? "blue" : "indigo";
	let dark = `bg-${base}-800`;
	let medium = `bg-${base}-500`;
	let light = `bg-${base}-200`;

	sold = typeof sold === 'number' ? sold : 0;
	total = typeof total === 'number' ? total : 0;
	present = typeof present === 'number' ? present : 0;

	let soldBar = sold > 0 ? Math.min(100, (sold / (total || sold)) * 100) : 0;
	let presentBar = sold > 0 ? Math.min(100, (present / (total || sold)) * 100) : 0;
	let availableBar = 100;
	if (total > 0) availableBar = 100;

	// Calculate widths
	let presentPct = total > 0 ? (present / total) * 100 : 0;
	let soldPct = total > 0 ? ((sold - present) / total) * 100 : 0;
	let availPct = total > 0 ? ((total - sold) / total) * 100 : 0;
	// Fallback for unlimited tickets
	if (!total || total === 0) {
		presentPct = sold > 0 ? (present / sold) * 100 : 0;
		soldPct = sold > 0 ? ((sold - present) / sold) * 100 : 0;
		availPct = 0;
	}

	let numbersStr = `${present} / ${sold} / ${total || '\u221e'}`;
	return `
		<div>
			<div class=\"flex items-center gap-2 text-[11px] font-bold text-slate-400 uppercase mb-1\">
				<span>${label}</span>
				<span class=\"text-slate-700 normal-case font-normal\">${numbersStr}</span>
			</div>
			<div class=\"w-full bg-slate-100 h-6 rounded-full overflow-hidden flex relative\">
				<div class=\"${dark} h-full transition-all duration-1000\" style=\"width: ${presentPct}%; min-width:1px;\"></div>
				<div class=\"${medium} h-full transition-all duration-1000\" style=\"width: ${soldPct}%; min-width:1px;\"></div>
				<div class=\"${light} h-full transition-all duration-1000\" style=\"width: ${availPct}%; min-width:1px;\"></div>
			</div>
		</div>`;
}

// Initial Load
fetchEvents();
