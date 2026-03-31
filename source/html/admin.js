async function loadTables() {
  const tableList = document.getElementById("tableList");
  tableList.innerHTML =
    '<div class="animate-spin"><i data-lucide="loader-2" class="w-6 h-6"></i></div>';

  try {
    const response = await fetch("/admin/tables");
    const tables = await response.json();

    tableList.innerHTML = "";
    tables.forEach((table) => {
      const row = document.createElement("div");
      row.className =
        "flex items-center justify-between p-4 bg-white rounded-xl border shadow-sm hover:shadow-md transition";
      row.innerHTML = `
                <div>
                    <h3 class="font-bold text-slate-900 capitalize">${table}</h3>
                    <p class="text-xs text-slate-500">Volledige tabel leegmaken</p>
                </div>
                <button 
                    onclick="clearTable('${table}')"
                    class="bg-red-50 text-red-600 px-4 py-2 rounded-lg font-semibold hover:bg-red-100 transition flex items-center gap-2"
                >
                    <i data-lucide="trash-2" class="w-4 h-4"></i> Leegmaken
                </button>
            `;
      tableList.appendChild(row);
    });
    lucide.createIcons();
  } catch (error) {
    console.error("Error loading tables:", error);
    tableList.innerHTML =
      '<p class="text-red-500">Fout bij het laden van tabellen.</p>';
  }
}

async function clearTable(tableName) {
  if (
    !confirm(
      `Weet je zeker dat je de tabel "${tableName}" wilt leegmaken? Dit kan niet ongedaan worden gemaakt.`,
    )
  ) {
    return;
  }

  try {
    const response = await fetch(`/admin/clear-table/${tableName}`, {
      method: "POST",
    });
    const result = await response.json();

    if (result.status === "success") {
      alert(`Tabel ${tableName} is succesvol geleegd.`);
    } else {
      alert(`Fout: ${result.message}`);
    }
  } catch (error) {
    console.error("Error clearing table:", error);
    alert("Er is een fout opgetreden bij het leegmaken van de tabel.");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadTables();
});
