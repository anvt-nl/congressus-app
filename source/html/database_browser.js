lucide.createIcons();

const tableList = document.getElementById("tableList");
const currentTableTitle = document.getElementById("currentTableTitle");
const tableMeta = document.getElementById("tableMeta");
const rowCount = document.getElementById("rowCount");
const refreshBtn = document.getElementById("refreshBtn");
const loadingOverlay = document.getElementById("loadingOverlay");
const emptyState = document.getElementById("emptyState");
const tableContainer = document.getElementById("tableContainer"); // Changed id to tableContainer (was container around table)
// Actually in HTML I used id="tableContainer" for the div wrapping the table.
// And tableHeadRow / tableBody.

const tableHeadRow = document.getElementById("tableHeadRow");
const tableBody = document.getElementById("tableBody");

let currentTable = null;

// Fetch tables on load
fetchTables();

async function fetchTables() {
  try {
    const response = await fetch("/api/database/tables");
    const data = await response.json();
    renderTableList(data.tables);
  } catch (error) {
    console.error("Error fetching tables:", error);
    tableList.innerHTML =
      '<li class="text-red-500 text-sm p-4">Error loading tables</li>';
  }
}

function renderTableList(tables) {
  tableList.innerHTML = "";
  tables.forEach((table) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    // Styling matches sidebar style
    btn.className =
      "w-full text-left px-3 py-2 text-sm font-medium text-slate-600 hover:bg-blue-50 hover:text-blue-700 rounded-lg transition-colors flex items-center justify-between group";

    // Check if active
    if (table === currentTable) {
      btn.classList.add("bg-blue-50", "text-blue-700");
    }

    btn.innerHTML = `
      <span class="flex items-center gap-2">
        <i data-lucide="layout" class="w-4 h-4 text-slate-400 group-hover:text-blue-500 ${table === currentTable ? "text-blue-500" : ""}"></i>
        ${table}
      </span>
      <i data-lucide="chevron-right" class="w-4 h-4 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"></i>
    `;
    btn.onclick = () => loadTable(table);
    li.appendChild(btn);
    tableList.appendChild(li);
  });
  lucide.createIcons();
}

async function loadTable(tableName) {
  currentTable = tableName;
  currentTableTitle.textContent = tableName;

  // Re-render list to update active state
  // Or just update classes manually to avoid flicker
  const buttons = tableList.querySelectorAll("button");
  buttons.forEach((btn) => {
    // Basic text check - careful if table names share substrings
    // Better to store tableName in dataset
    if (btn.innerText.trim() === tableName) {
      btn.classList.add("bg-blue-50", "text-blue-700");
      const icon = btn.querySelector("[data-lucide='layout']");
      if (icon) icon.classList.add("text-blue-500");
    } else {
      btn.classList.remove("bg-blue-50", "text-blue-700");
      const icon = btn.querySelector("[data-lucide='layout']");
      if (icon) icon.classList.remove("text-blue-500");
    }
  });

  // Show loading
  loadingOverlay.classList.remove("hidden");
  emptyState.classList.add("hidden");
  tableContainer.classList.add("hidden");
  tableMeta.classList.add("hidden");

  try {
    const response = await fetch(`/api/database/${tableName}`);
    if (!response.ok) throw new Error("Failed to fetch data");
    const data = await response.json();
    renderTableData(data);
  } catch (error) {
    console.error(`Error loading table ${tableName}:`, error);
    alert("Error loading table data");
  } finally {
    loadingOverlay.classList.add("hidden");
  }
}

function renderTableData(data) {
  // Update meta
  rowCount.textContent = data.total;
  tableMeta.classList.remove("hidden");
  tableContainer.classList.remove("hidden");

  // Render headers
  tableHeadRow.innerHTML = "";
  data.columns.forEach((col) => {
    const th = document.createElement("th");
    th.className =
      "px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 sticky top-0 border-b border-slate-200";
    th.textContent = col;
    tableHeadRow.appendChild(th);
  });

  // Render rows
  tableBody.innerHTML = "";
  data.data.forEach((row) => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-blue-50/50 transition-colors";
    data.columns.forEach((col) => {
      const td = document.createElement("td");
      td.className =
        "px-6 py-4 whitespace-nowrap text-sm text-slate-600 border-b border-slate-100 max-w-xs overflow-hidden text-ellipsis";

      let cellData = row[col];

      // Handle null
      if (cellData === null) {
        td.innerHTML = '<span class="text-slate-300 italic">null</span>';
      } else if (typeof cellData === "string") {
        // Check if it's JSON
        if (
          (cellData.startsWith("{") || cellData.startsWith("[")) &&
          cellData.length > 2
        ) {
          td.classList.add("font-mono", "text-xs", "text-blue-600");
          td.title = cellData; // Tooltip shows full data
          td.textContent = cellData.substring(0, 40) + "..."; // Truncate
        } else {
          td.title = cellData;
          td.textContent =
            cellData.length > 50 ? cellData.substring(0, 50) + "..." : cellData;
        }
      } else {
        td.textContent = cellData;
      }

      tr.appendChild(td);
    });
    tableBody.appendChild(tr);
  });
}

if (refreshBtn) {
  refreshBtn.onclick = () => {
    if (currentTable) loadTable(currentTable);
  };
}
