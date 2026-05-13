const ACCESS_TOKEN_STORAGE_KEY = "anvtAccessToken";

function getStoredTokenData() {
  const storedValue = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
  if (!storedValue) return null;

  try {
    const parsed = JSON.parse(storedValue);
    if (typeof parsed === "string") {
      return { token: parsed, expires_at: null };
    }
    if (parsed && typeof parsed === "object") {
      return {
        token: parsed.token || "",
        expires_at: parsed.expires_at || null,
      };
    }
  } catch {
    return { token: storedValue, expires_at: null };
  }

  return null;
}

function setMessage(message, isError = false) {
  const messageElement = document.getElementById("tokenMessage");
  if (!messageElement) return;
  messageElement.textContent = message;
  messageElement.className = `mt-4 text-sm ${isError ? "text-red-600" : "text-green-600"}`;
}

function renderToken() {
  const tokenState = document.getElementById("tokenState");
  const tokenValue = document.getElementById("tokenValue");
  const tokenExpiresAt = document.getElementById("tokenExpiresAt");
  const removeTokenBtn = document.getElementById("removeTokenBtn");

  const tokenData = getStoredTokenData();
  if (!tokenState || !tokenValue || !tokenExpiresAt || !removeTokenBtn) {
    return;
  }

  if (!tokenData || !tokenData.token) {
    tokenState.textContent = "Er is geen lokaal opgeslagen token gevonden.";
    tokenValue.value = "";
    tokenExpiresAt.textContent = "";
    removeTokenBtn.disabled = true;
    removeTokenBtn.classList.add("opacity-50", "cursor-not-allowed");
    return;
  }

  tokenState.textContent = "Dit token staat lokaal opgeslagen op dit apparaat.";
  tokenValue.value = tokenData.token;
  tokenExpiresAt.textContent = tokenData.expires_at
    ? `Geldig tot: ${tokenData.expires_at}`
    : "";
  removeTokenBtn.disabled = false;
  removeTokenBtn.classList.remove("opacity-50", "cursor-not-allowed");
}

function removeToken() {
  const tokenData = getStoredTokenData();
  if (!tokenData || !tokenData.token) {
    setMessage("Er is geen token om te verwijderen.", true);
    return;
  }

  if (!confirm("Weet je zeker dat je het lokaal opgeslagen token wilt verwijderen?")) {
    return;
  }

  localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  renderToken();
  setMessage("Token verwijderd van dit apparaat.");
}

document.addEventListener("DOMContentLoaded", () => {
  const removeTokenBtn = document.getElementById("removeTokenBtn");
  if (removeTokenBtn) {
    removeTokenBtn.addEventListener("click", removeToken);
  }

  renderToken();
  lucide.createIcons();
});
