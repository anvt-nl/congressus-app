function buildShareUrl(token) {
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

function selectToken(token, expiresAt) {
  const tokenUrlInput = document.getElementById("tokenUrl");
  const tokenExpiresAt = document.getElementById("tokenExpiresAt");
  if (!tokenUrlInput || !tokenExpiresAt) return;

  tokenUrlInput.value = buildShareUrl(token);
  tokenExpiresAt.textContent = `Geldig tot: ${expiresAt}`;
  setTokenStatus("Toegangslink geladen uit actieve tokens.");
}

async function loadActiveTokens() {
  const tokenList = document.getElementById("tokenList");
  if (!tokenList) return;

  tokenList.innerHTML =
    '<div class="text-slate-400 text-sm flex items-center gap-2"><i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Tokens laden...</div>';
  lucide.createIcons();

  try {
    const response = await fetch("/admin/access-tokens");
    if (!response.ok) throw new Error("Tokens laden mislukt.");

    const tokens = await response.json();
    if (!Array.isArray(tokens) || tokens.length === 0) {
      tokenList.innerHTML =
        '<div class="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Er zijn geen actieve tokens.</div>';
      return;
    }

    tokenList.innerHTML = tokens
      .map(
        (token) => `
          <div onclick="selectToken('${token.token}', '${token.expires_at}')" class="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition">
            <div class="min-w-0">
              <div class="font-mono text-sm text-slate-800" title="${token.token}">${shortenToken(token.token)}</div>
              <div class="text-xs text-slate-500 mt-1">Aangemaakt: ${token.created_at}</div>
              <div class="text-xs text-slate-500">Geldig tot: ${token.expires_at}</div>
            </div>
            <button
              onclick="event.stopPropagation(); revokeToken('${token.token}')"
              class="flex items-center gap-2 bg-red-50 text-red-600 px-3 py-2 rounded-lg font-semibold hover:bg-red-100 transition text-sm"
            >
              <i data-lucide="ban" class="w-4 h-4"></i> Revoke
            </button>
          </div>
        `,
      )
      .join("");
    lucide.createIcons();
  } catch (error) {
    console.error("Error loading active tokens:", error);
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
    console.error("Error revoking token:", error);
    setTokenStatus(error.message, true);
  }
}

async function generateToken() {
  const generateBtn = document.getElementById("generateTokenBtn");
  const tokenUrlInput = document.getElementById("tokenUrl");
  const tokenExpiresAt = document.getElementById("tokenExpiresAt");
  if (!generateBtn || !tokenUrlInput || !tokenExpiresAt) return;

  const originalHtml = generateBtn.innerHTML;
  generateBtn.disabled = true;
  generateBtn.classList.add("opacity-60", "cursor-not-allowed");
  generateBtn.innerHTML =
    '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Genereren...';
  setTokenStatus("");
  lucide.createIcons();

  try {
    const response = await fetch("/admin/access-token", { method: "POST" });
    if (!response.ok) throw new Error("Token genereren mislukt.");

    const result = await response.json();
    const shareUrl = buildShareUrl(result.token);
    tokenUrlInput.value = shareUrl;
    tokenExpiresAt.textContent = `Geldig tot: ${result.expires_at}`;
    setTokenStatus("Toegangslink gegenereerd.");
    await loadActiveTokens();
  } catch (error) {
    console.error("Error generating token:", error);
    setTokenStatus(error.message, true);
  } finally {
    generateBtn.disabled = false;
    generateBtn.classList.remove("opacity-60", "cursor-not-allowed");
    generateBtn.innerHTML = originalHtml;
    lucide.createIcons();
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
    copyBtn.innerHTML =
      '<i data-lucide="check" class="w-4 h-4"></i> Gekopieerd';
    setTokenStatus("URL gekopieerd naar klembord.");
    lucide.createIcons();
    setTimeout(() => {
      copyBtn.innerHTML = originalHtml;
      lucide.createIcons();
    }, 2000);
  } catch (error) {
    console.error("Error copying token URL:", error);
    setTokenStatus("Kopieren naar klembord mislukt.", true);
  }
}

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
  const generateTokenBtn = document.getElementById("generateTokenBtn");
  if (generateTokenBtn) {
    generateTokenBtn.addEventListener("click", generateToken);
  }

  const copyTokenBtn = document.getElementById("copyTokenBtn");
  if (copyTokenBtn) {
    copyTokenBtn.addEventListener("click", copyTokenUrl);
  }

  const refreshTokensBtn = document.getElementById("refreshTokensBtn");
  if (refreshTokensBtn) {
    refreshTokensBtn.addEventListener("click", loadActiveTokens);
  }

  const authRequiredNotice = document.getElementById("authRequiredNotice");
  const params = new URLSearchParams(window.location.search);
  if (authRequiredNotice && params.get("message") === "auth-required") {
    authRequiredNotice.classList.remove("hidden");
  }

  loadActiveTokens();
  loadTables();
});
