
// Always go to index.html and reload
document.addEventListener('DOMContentLoaded', () => {
	const btn = document.getElementById('backToEventsBtn');
	if (btn) {
		btn.onclick = (e) => {
			e.preventDefault();
			window.location = 'index.html';
		};
	}
	const collectBtn = document.getElementById('collectTicketsBtn');
	if (collectBtn) {
		collectBtn.onclick = collectAllTickets;
	}
	// Register toggle button event
	const toggleBtn = document.getElementById('toggleApprovedBtn');
	if (toggleBtn) {
		toggleBtn.onclick = () => {
			showOnlyApproved = !showOnlyApproved;
			toggleBtn.textContent = showOnlyApproved ? 'Toon alles' : 'Toon alleen goedgekeurd';
			renderTable();
		};
	}
});

// Visual confirmation for force sync
function showForceSyncMsg() {
	const msg = document.getElementById('forceSyncMsg');
	msg.classList.remove('hidden');
	setTimeout(() => msg.classList.add('hidden'), 2000);
}

// Confirm before force sync
async function confirmAndForceSync() {
	const proceed = confirm('Weet je zeker dat je wilt force syncen? Dit haalt namelijk alle aanmeldingen opnieuw op van de backend.');
	if (!proceed) return false;
	return true;
}

// Hidden force sync: Ctrl+Shift+R (desktop)
document.addEventListener('keydown', async (e) => {
	if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'r') {
		if (eventId && await confirmAndForceSync()) {
			document.getElementById('loading').style.display = '';
			try {
				await fetch(`http://localhost:8000/participations/${eventId}/refresh`, { method: 'GET' });
				showForceSyncMsg();
			} catch {}
			fetchParticipations(eventId);
		}
	}
});

// Hidden force sync: long-press on Sync Data button (mobile)
let forceSyncTimeout;
const syncBtn = document.getElementById('syncBtn');
if (syncBtn) {
	syncBtn.addEventListener('touchstart', () => {
		forceSyncTimeout = setTimeout(async () => {
			if (eventId && await confirmAndForceSync()) {
				document.getElementById('loading').style.display = '';
				try {
					await fetch(`http://localhost:8000/participations/${eventId}/refresh`, { method: 'GET' });
					showForceSyncMsg();
				} catch {}
				fetchParticipations(eventId);
			}
		}, 2000); // 2 seconds long-press
	});
	syncBtn.addEventListener('touchend', () => {
		clearTimeout(forceSyncTimeout);
	});
}

// Render lucide icons after DOM update
document.addEventListener('DOMContentLoaded', () => { if (window.lucide) lucide.createIcons(); });
function rerenderIcons() { if (window.lucide) lucide.createIcons(); }

function refreshParticipations() {
	if (eventId) fetchParticipations(eventId);
	rerenderIcons();
}

async function fetchParticipations(eventId) {
	document.getElementById('loading').style.display = '';
	try {
		const response = await fetch(`http://localhost:8000/participations/${eventId}`);
		const data = await response.json();
		renderTable(data);
	} catch (err) {
		document.getElementById('participationsTable').innerHTML = '<div class="text-red-500">Failed to load participations.</div>';
	}
	document.getElementById('loading').style.display = 'none';
}

const currentSort = { key: null, asc: true };
// Track toggle for approved-only view
let showOnlyApproved = true;
// Track hidden state of each section
const sectionVisibility = {};
let participationsData = [];
let participationsRawData = [];

function renderTable(participations) {
	// Only update raw data if new data is passed (from fetch)
	if (participations) {
		participationsRawData = participations.slice();
	}
	// Always filter from raw data
	participationsData = participationsRawData.slice();
	if (!participationsData.length) {
		document.getElementById('participationsTable').innerHTML = '<div class="text-slate-400">No participations found for this event.</div>';
		return;
	}
	// Sort by current sort state, or by addressee ascending by default
	const sortKey = currentSort.key || 'addressee';
	const sortAsc = currentSort.key ? currentSort.asc : true;
	participationsData.sort((a, b) => {
		const aVal = (a[sortKey] || '').toLowerCase();
		const bVal = (b[sortKey] || '').toLowerCase();
		if (aVal < bVal) return sortAsc ? -1 : 1;
		if (aVal > bVal) return sortAsc ? 1 : -1;
		return 0;
	});
	const filteredData = showOnlyApproved ? participationsData.filter(p => p.status === 'approved') : participationsData;
	const members = filteredData.filter(p => p.member_id);
	const vrijrijders = filteredData.filter(p => !p.member_id);

	let html = '';
	html += renderSubTable('Leden', members, showOnlyApproved);
	html += '<div class="h-8"></div>';
	html += renderSubTable('Vrijrijders', vrijrijders, showOnlyApproved);
	document.getElementById('participationsTable').innerHTML = html;
	rerenderIcons();
}

function renderSubTable(title, rows) {
	if (!rows.length) return '';
	const sectionId = 'section_' + title.replace(/\s+/g, '').toLowerCase();
	let html = `<div class="mb-4"><div class="flex items-center justify-between mt-6 mb-2">`;
	html += `<h2 class="text-lg font-bold">${title}</h2>`;
	html += `<button type="button" onclick="toggleTable('${sectionId}')" id="btn_${sectionId}" class="text-xs text-blue-600 underline ml-4">Verberg</button>`;
	html += `</div>`;
	// Set display style based on sectionVisibility
	const displayStyle = sectionVisibility[sectionId] === false ? 'display:none;' : '';
	html += `<div id="${sectionId}" style="${displayStyle}" class="overflow-x-auto"><table class="min-w-full bg-white rounded-xl shadow"><thead><tr>`;
	// Add sort indicators
	const arrow = (key) => {
		if (currentSort.key === key) {
			return currentSort.asc ? ' &#8595;' : ' &#8593;';
		}
		return '';
	};
	html += `<th class="px-4 py-2 text-left cursor-pointer select-none" onclick="sortTable('addressee')">Naam${arrow('addressee')}</th>`;
	html += `<th class="px-4 py-2 text-left cursor-pointer select-none" onclick="sortTable('email')">Email${arrow('email')}</th>`;
	if (!arguments[2]) html += `<th class="px-4 py-2 text-left">Status</th>`;
	html += `<th class="px-4 py-2 text-left">Aanwezig</th>`;
	html += '</tr></thead><tbody>';
	for (const p of rows) {
		const ticketId = p.id || p.ticket_id || p.member_id || '';
		const present = (typeof p.presence_count !== 'undefined' && p.presence_count !== null) ? p.presence_count : '';
		const bought = (typeof p.tickets !== 'undefined') ? p.tickets : '';
		let presenceStr = '-';
		if (bought === null || bought === undefined || bought === '') {
			presenceStr = '-';
		} else {
			presenceStr = `${present} / ${bought}`;
		}
		const isApproved = p.status === 'approved';
		const trClass = 'border-t transition' + (isApproved ? ' cursor-pointer hover:bg-slate-100' : ' bg-slate-50');
		const trOnClick = isApproved ? `onclick=\"window.location.href='ticket.html?event_id=${eventId}&ticket_id=${ticketId}'\"` : '';
		html += `<tr class=\"${trClass}\" ${trOnClick}>\n            <td class=\"px-4 py-2\">${p.addressee || ''}</td>\n            <td class=\"px-4 py-2\">${p.email || ''}</td>`;
		if (!arguments[2]) html += `\n            <td class=\"px-4 py-2\">${p.status || ''}</td>`;
		html += `\n            <td class=\"px-4 py-2\">${presenceStr}</td>\n        </tr>`;
	}
	html += '</tbody></table></div></div>';
	return html;
}

window.toggleTable = (sectionId) => {
	const section = document.getElementById(sectionId);
	const btn = document.getElementById('btn_' + sectionId);
	if (section.style.display === 'none') {
		section.style.display = '';
		btn.textContent = 'Verberg';
		sectionVisibility[sectionId] = true;
	} else {
		section.style.display = 'none';
		btn.textContent = 'Toon';
		sectionVisibility[sectionId] = false;
	}
}

window.sortTable = (key) => {
	if (currentSort.key === key) {
		currentSort.asc = !currentSort.asc;
	} else {
		currentSort.key = key;
		currentSort.asc = true;
	}
	// Sort participationsData in place
	participationsData.sort((a, b) => {
		const aVal = (a[key] || '').toLowerCase();
		const bVal = (b[key] || '').toLowerCase();
		if (aVal < bVal) return currentSort.asc ? -1 : 1;
		if (aVal > bVal) return currentSort.asc ? 1 : -1;
		return 0;
	});
	// Save current visibility state
	const ledenSection = document.getElementById('section_leden');
	const vrijrijdersSection = document.getElementById('section_vrijrijders');
	if (ledenSection) sectionVisibility['section_leden'] = ledenSection.style.display !== 'none';
	if (vrijrijdersSection) sectionVisibility['section_vrijrijders'] = vrijrijdersSection.style.display !== 'none';
	// Re-render the table with the new order
	// This will update both Members and Vrijrijders tables and the sort indicators
	const members = participationsData.filter(p => p.member_id);
	const vrijrijders = participationsData.filter(p => !p.member_id);
	let html = '';
	html += renderSubTable('Leden', members);
	html += '<div class="h-8"></div>';
	html += renderSubTable('Vrijrijders', vrijrijders);
	document.getElementById('participationsTable').innerHTML = html;
	rerenderIcons && rerenderIcons();
}

// Get event_id from query string
const params = new URLSearchParams(window.location.search);
const eventId = params.get('event_id');
if (eventId) {
	fetchParticipations(eventId);
	if (typeof fetchEventDetails === 'function') fetchEventDetails(eventId);
} else {
	document.getElementById('loading').textContent = 'No event ID provided.';
}

// Collect all tickets for this event
async function collectAllTickets() {
	if (!eventId) return;
	const btn = document.getElementById('collectTicketsBtn');
	btn.disabled = true;
	btn.innerHTML = '<span class="animate-spin mr-2"><i data-lucide="loader" class="w-4 h-4"></i></span> Collecting...';
	try {
		const response = await fetch(`http://localhost:8000/event/${eventId}/collect-tickets`, { method: 'GET' });
		if (response.ok) {
			alert('Tickets collected successfully!');
		} else {
			alert('Failed to collect tickets.');
		}
	} catch (err) {
		alert('Error contacting backend.');
	}
	btn.disabled = false;
	btn.innerHTML = '<i data-lucide="ticket" class="w-4 h-4"></i> Collect All Tickets';
	rerenderIcons();
}
