function initIcons() {
  if (window.lucide) {
    lucide.createIcons();
  }
}

function buildShareUrl(token) {
  const url = new URL("scan.html", window.location.href);
  url.searchParams.set("access_token", token);
  return url.toString();
}

function buildHomeUrl(token) {
  const url = new URL("index.html", window.location.href);
  url.searchParams.set("access_token", token);
  return url.toString();
}

function setTokenStatus(message, isError = false) {
  const status = document.getElementById("tokenStatus");
  if (!status) return;
  status.textContent = message;
  status.className = `mt-2 text-sm ${isError ? "text-red-600" : "text-green-600"}`;
}

function shortenToken(token) {
  if (!token || token.length <= 16) return token;
  return `${token.slice(0, 8)}...${token.slice(-8)}`;
}

function formatDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDefaultTokenExpiryDate() {
  const defaultDate = new Date();
  defaultDate.setDate(defaultDate.getDate() + 5);
  return defaultDate;
}

function parseExpiryDateValue(expiresAt) {
  if (!expiresAt) return "";
  const normalized = String(expiresAt).replace(" ", "T");
  const parsedDate = new Date(normalized);
  if (Number.isNaN(parsedDate.getTime())) return "";
  return formatDateInputValue(parsedDate);
}

function initializeTokenExpiryDateInput() {
  const tokenExpiryDateInput = document.getElementById("tokenExpiryDate");
  if (!tokenExpiryDateInput) return;

  tokenExpiryDateInput.min = formatDateInputValue(new Date());
  if (!tokenExpiryDateInput.value) {
    tokenExpiryDateInput.value = formatDateInputValue(getDefaultTokenExpiryDate());
  }
}

function selectToken(token, expiresAt) {
  const tokenUrlInput = document.getElementById("tokenUrl");
  const tokenExpiresAt = document.getElementById("tokenExpiresAt");
  const tokenExpiryDateInput = document.getElementById("tokenExpiryDate");
  if (!tokenUrlInput || !tokenExpiresAt) return;

  tokenUrlInput.value = buildShareUrl(token);
  tokenExpiresAt.textContent = `Geldig tot: ${expiresAt}`;
  if (tokenExpiryDateInput) {
    tokenExpiryDateInput.value = parseExpiryDateValue(expiresAt);
  }
  setTokenStatus("Toegangslink geladen uit actieve tokens.");
}

function getCurrentTokenFromUrlField() {
  const tokenUrlInput = document.getElementById("tokenUrl");
  if (!tokenUrlInput || !tokenUrlInput.value) return null;

  try {
    const url = new URL(tokenUrlInput.value);
    return url.searchParams.get("access_token");
  } catch {
    return null;
  }
}

function renderTokenList(tokens) {
  const tokenList = document.getElementById("tokenList");
  tokenList.innerHTML = "";

  if (!Array.isArray(tokens) || tokens.length === 0) {
    tokenList.innerHTML =
      '<div class="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Er zijn geen actieve tokens.</div>';
    return;
  }

  for (const token of tokens) {
    const card = document.createElement("div");
    card.dataset.action = "select-token";
    card.dataset.token = token.token;
    card.dataset.expiresAt = token.expires_at;
    card.className =
      "flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition";
    card.innerHTML = `
      <div class="min-w-0">
        <div class="font-mono text-sm text-slate-800" title="${token.token}">${shortenToken(token.token)}</div>
        <div class="text-xs text-slate-500 mt-1">Aangemaakt: ${token.created_at}</div>
        <div class="text-xs text-slate-500">Geldig tot: ${token.expires_at}</div>
      </div>
      <button
        type="button"
        data-action="revoke-token"
        data-token="${token.token}"
        class="flex items-center gap-2 bg-red-50 text-red-600 px-3 py-2 rounded-lg font-semibold hover:bg-red-100 transition text-sm"
      >
        <i data-lucide="ban" class="w-4 h-4"></i> Revoke
      </button>`;
    tokenList.appendChild(card);
  }
}

async function loadActiveTokens() {
  const tokenList = document.getElementById("tokenList");
  if (!tokenList) return;

  tokenList.innerHTML =
    '<div class="text-slate-400 text-sm flex items-center gap-2"><i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Tokens laden...</div>';
  initIcons();

  try {
    const response = await fetch("/admin/access-tokens");
    if (!response.ok) throw new Error("Tokens laden mislukt.");

    renderTokenList(await response.json());
    initIcons();
  } catch {
    tokenList.innerHTML =
      '<div class="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">Fout bij het laden van tokens.</div>';
  }
}

async function revokeToken(token) {
  if (!confirm("Weet je zeker dat je dit token wilt intrekken?")) {
    return;
  }

  try {
    const response = await fetch(`/admin/access-token/${encodeURIComponent(token)}`, {
      method: "DELETE",
    });
    const result = await response.json();

    if (!response.ok || result.status !== "success") {
      throw new Error(result.message || "Token intrekken mislukt.");
    }

    setTokenStatus("Token ingetrokken.");
    await loadActiveTokens();
  } catch (error) {
    setTokenStatus(error.message, true);
  }
}

async function generateToken() {
  const generateBtn = document.getElementById("generateTokenBtn");
  const tokenUrlInput = document.getElementById("tokenUrl");
  const tokenExpiresAt = document.getElementById("tokenExpiresAt");
  const tokenExpiryDateInput = document.getElementById("tokenExpiryDate");
  if (!generateBtn || !tokenUrlInput || !tokenExpiresAt || !tokenExpiryDateInput) return;

  if (!tokenExpiryDateInput.value) {
    setTokenStatus("Kies eerst een geldigheidsdatum.", true);
    return;
  }

  const originalHtml = generateBtn.innerHTML;
  generateBtn.disabled = true;
  generateBtn.classList.add("opacity-60", "cursor-not-allowed");
  generateBtn.innerHTML =
    '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Genereren...';
  setTokenStatus("");
  initIcons();

  try {
    const response = await fetch("/admin/access-token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expires_at: tokenExpiryDateInput.value }),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.detail || "Token genereren mislukt.");
    }

    tokenUrlInput.value = buildShareUrl(result.token);
    tokenExpiresAt.textContent = `Geldig tot: ${result.expires_at}`;
    setTokenStatus("Toegangslink gegenereerd.");
    await loadActiveTokens();
  } catch (error) {
    setTokenStatus(error.message, true);
  } finally {
    generateBtn.disabled = false;
    generateBtn.classList.remove("opacity-60", "cursor-not-allowed");
    generateBtn.innerHTML = originalHtml;
    initIcons();
  }
}

async function copyTokenUrl() {
  const tokenUrlInput = document.getElementById("tokenUrl");
  const copyBtn = document.getElementById("copyTokenBtn");
  if (!tokenUrlInput || !copyBtn) return;

  if (!tokenUrlInput.value) {
    setTokenStatus("Genereer eerst een token.", true);
    return;
  }

  try {
    await navigator.clipboard.writeText(tokenUrlInput.value);
    const originalHtml = copyBtn.innerHTML;
    copyBtn.innerHTML = '<i data-lucide="check" class="w-4 h-4"></i> Gekopieerd';
    setTokenStatus("URL gekopieerd naar klembord.");
    initIcons();
    setTimeout(() => {
      copyBtn.innerHTML = originalHtml;
      initIcons();
    }, 2000);
  } catch {
    setTokenStatus("Kopieren naar klembord mislukt.", true);
  }
}

function openHomepageWithToken() {
  const token = getCurrentTokenFromUrlField();
  if (!token) {
    setTokenStatus("Genereer of selecteer eerst een token.", true);
    return;
  }

  window.location.href = buildHomeUrl(token);
}

function renderTables(tables) {
  const tableList = document.getElementById("tableList");
  tableList.innerHTML = "";

  for (const table of tables) {
    const row = document.createElement("div");
    row.className =
      "flex items-center justify-between p-4 bg-white rounded-xl border shadow-sm hover:shadow-md transition";
    row.innerHTML = `
      <div>
        <h3 class="font-bold text-slate-900 capitalize">${table}</h3>
        <p class="text-xs text-slate-500">Volledige tabel leegmaken</p>
      </div>
      <button
        type="button"
        data-action="clear-table"
        data-table="${table}"
        class="bg-red-50 text-red-600 px-4 py-2 rounded-lg font-semibold hover:bg-red-100 transition flex items-center gap-2"
      >
        <i data-lucide="trash-2" class="w-4 h-4"></i> Leegmaken
      </button>`;
    tableList.appendChild(row);
  }
}

async function loadTables() {
  const tableList = document.getElementById("tableList");
  tableList.innerHTML =
    '<div class="animate-spin"><i data-lucide="loader-2" class="w-6 h-6"></i></div>';
  initIcons();

  try {
    const response = await fetch("/admin/tables");
    renderTables(await response.json());
    initIcons();
  } catch {
    tableList.innerHTML = '<p class="text-red-500">Fout bij het laden van tabellen.</p>';
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
    alert(
      result.status === "success"
        ? `Tabel ${tableName} is succesvol geleegd.`
        : `Fout: ${result.message}`,
    );
  } catch {
    alert("Er is een fout opgetreden bij het leegmaken van de tabel.");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initIcons();
  initializeTokenExpiryDateInput();

  document.getElementById("generateTokenBtn")?.addEventListener("click", generateToken);
  document.getElementById("copyTokenBtn")?.addEventListener("click", copyTokenUrl);
  document.getElementById("openHomeBtn")?.addEventListener("click", openHomepageWithToken);
  document.getElementById("refreshTokensBtn")?.addEventListener("click", loadActiveTokens);

  document.getElementById("tokenList")?.addEventListener("click", (event) => {
    const revokeButton = event.target.closest('[data-action="revoke-token"]');
    if (revokeButton) {
      event.stopPropagation();
      revokeToken(revokeButton.dataset.token);
      return;
    }

    const tokenCard = event.target.closest('[data-action="select-token"]');
    if (tokenCard) {
      selectToken(tokenCard.dataset.token, tokenCard.dataset.expiresAt);
    }
  });

  document.getElementById("tableList")?.addEventListener("click", (event) => {
    const button = event.target.closest('[data-action="clear-table"]');
    if (button) {
      clearTable(button.dataset.table);
    }
  });

  loadActiveTokens();
  loadTables();
});
