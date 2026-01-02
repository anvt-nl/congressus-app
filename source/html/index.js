// index.js - logic for index.html

// Visual confirmation for force sync
function showForceSyncMsg() {
    const msg = document.getElementById('forceSyncMsg');
    msg.classList.remove('hidden');
    setTimeout(() => msg.classList.add('hidden'), 2000);
}

// Confirm before force sync
async function confirmAndForceSync() {
    const proceed = confirm('Are you sure you want to force sync? This will refresh all events from the backend.');
    if (!proceed) return false;
    return true;
}

// Hidden force sync: Ctrl+Shift+R (desktop)
document.addEventListener('keydown', async (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'r') {
        if (await confirmAndForceSync()) {
            document.getElementById('api-status').innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span> Force syncing...`;
            try {
                await fetch('http://localhost:8000/events/refresh', { method: 'POST' });
                showForceSyncMsg();
            } catch {}
            fetchEvents();
        }
    }
});

// Hidden force sync: long-press on Sync Data button (mobile)
let forceSyncTimeout;
const syncBtn = document.getElementById('syncBtn');
syncBtn.addEventListener('touchstart', () => {
    forceSyncTimeout = setTimeout(async () => {
        if (await confirmAndForceSync()) {
            document.getElementById('api-status').innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span> Force syncing...`;
            try {
                await fetch('http://localhost:8000/events/refresh', { method: 'POST' });
                showForceSyncMsg();
            } catch {}
            fetchEvents();
        }
    }, 2000); // 2 seconds long-press
});
syncBtn.addEventListener('touchend', () => {
    clearTimeout(forceSyncTimeout);
});

const API_URL = 'http://localhost:8000/events';
let allEvents = [];

// 1. Fetch Data from Backend
async function fetchEvents() {
    const statusText = document.getElementById('api-status');
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('Backend unreachable');

        allEvents = await response.json();
        renderEvents(allEvents);

        statusText.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500"></span> Connected to Backend`;
    } catch (err) {
        statusText.innerHTML = `<span class="w-2 h-2 rounded-full bg-red-500"></span> Error: ${err.message}`;
        document.getElementById('eventGrid').innerHTML = `<div class="col-span-full text-center py-20 text-red-500 font-medium border-2 border-dashed rounded-2xl">Make sure your backend is running at localhost:8000</div>`;
    }
}

// 2. Render Cards to Grid
function renderEvents(events) {
    document.getElementById('loadingEvents').style.display = 'none';
    // Clear all sections
    document.getElementById('futureEvents').innerHTML = '';
    document.getElementById('todayEvents').innerHTML = '';
    document.getElementById('pastEvents').innerHTML = '';

    const todayStr = new Date().toISOString().split('T')[0];
    const future = [];
    const today = [];
    const past = [];

    events.forEach(event => {
        const dateOnly = event.start ? event.start.split('T')[0] : '';
        if (dateOnly > todayStr) {
            future.push({...event, _dateOnly: dateOnly});
        } else if (dateOnly === todayStr) {
            today.push(event);
        } else {
            past.push(event);
        }
    });
    // Sort future events by date ascending
    future.sort((a, b) => a._dateOnly.localeCompare(b._dateOnly));

    const renderCard = (event, faded = false) => {
        const dateOnly = event.start ? event.start.split('T')[0] : '';
        let nietLedenBar = '';
        if (!(event.niet_leden_sold_tickets == 0 && event.niet_leden_num_tickets == 0)) {
            nietLedenBar = renderProgress('Vrijrijders', event.niet_leden_sold_tickets, event.niet_leden_num_tickets, 'bg-indigo-400');
        }
        return `
        <div class="bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-xl transition-all group ${faded ? 'opacity-70' : ''}">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-bold text-slate-900 leading-tight">${event.name}</h3>
                <button onclick="goToOverview(${event.id})" class="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
                    <i data-lucide="info" class="w-5 h-5"></i>
                </button>
            </div>
            <div class="text-xs text-slate-500 mb-4">${dateOnly}</div>
            <div class="space-y-4">
                ${renderProgress('Leden', event.leden_sold_tickets, event.leden_num_tickets, 'bg-blue-500')}
                ${nietLedenBar}
            </div>
        </div>`;
    };

    // Show/hide sections based on content
    const futureSection = document.getElementById('futureSection');
    const todaySection = document.getElementById('todaySection');
    const pastSection = document.getElementById('pastSection');

    document.getElementById('futureEvents').innerHTML = future.map(e => renderCard(e)).join('');
    document.getElementById('todayEvents').innerHTML = today.map(e => renderCard(e)).join('');
    document.getElementById('pastEvents').innerHTML = past.map(e => renderCard(e, true)).join('');

    futureSection.style.display = future.length ? '' : 'none';
    todaySection.style.display = today.length ? '' : 'none';
    pastSection.style.display = past.length ? '' : 'none';

    lucide.createIcons();
}

// Go to overview page for event participations
function goToOverview(eventId) {
    window.location.href = `participations_overview.html?event_id=${eventId}`;
}

function toggleSection(section) {
    const sectionDiv = document.getElementById(section + 'Events');
    const btn = document.getElementById('toggle' + section.charAt(0).toUpperCase() + section.slice(1));
    if (sectionDiv.style.display === 'none') {
        sectionDiv.style.display = '';
        btn.textContent = 'Verbergen';
    } else {
        sectionDiv.style.display = 'none';
        btn.textContent = 'Tonen';
    }
}

function renderProgress(label, sold, total, color) {
    let pct, barColor;
    if (label === 'Vrijrijders' && (!total || total === 0) && (!sold || sold === 0)) {
        pct = 100;
        barColor = 'bg-red-500';
    } else if (!total || total === 0) {
        pct = 100;
        barColor = 'bg-green-500';
    } else {
        pct = Math.min(100, (sold / total) * 100);
        barColor = color;
    }
    return `
        <div>
            <div class="flex justify-between text-[11px] font-bold text-slate-400 uppercase mb-1">
                <span>${label}</span>
                <span class="text-slate-700">${sold} / ${total || '\u221e'}</span>
            </div>
            <div class="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div class="${barColor} h-full transition-all duration-1000" style="width: ${pct}%"></div>
            </div>
        </div>`;
}

// Initial Load
fetchEvents();
