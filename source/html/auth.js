const ACCESS_TOKEN_STORAGE_KEY = "anvtAccessToken";
const ACCESS_TOKEN_QUERY_PARAM = "access_token";

document.documentElement.style.visibility = "hidden";

function restorePageVisibility() {
  document.documentElement.style.visibility = "visible";
}

function clearStoredAccessToken() {
  localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
}

function showAccessDenied(
  message = "Geen geldig toegangstoken gevonden.",
  token = null,
) {
  clearStoredAccessToken();
  const tokenDetails = token
    ? `
        <div class="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-left">
          <div class="text-xs font-semibold text-slate-500 mb-1">Gebruikt token</div>
          <div class="font-mono text-xs break-all text-slate-700">${token}</div>
        </div>
      `
    : "";
  document.body.className = "bg-slate-50 min-h-screen";
  document.body.innerHTML = `
    <div class="min-h-screen flex items-center justify-center px-4">
      <div class="max-w-md w-full bg-white border border-red-200 rounded-2xl shadow-lg p-8 text-center">
        <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600 text-2xl font-bold">
          !
        </div>
        <h1 class="text-2xl font-black text-slate-900 mb-2">Geen toegang</h1>
        <p class="text-slate-600 mb-6">
          ${message}
        </p>
        ${tokenDetails}
        <p class="text-sm text-slate-500">
          Vraag een beheerder om een geldige toegangslink.
        </p>
      </div>
    </div>
  `;
  restorePageVisibility();
}

async function validateAccessToken(token) {
  const response = await fetch(
    `/auth/validate?token=${encodeURIComponent(token)}`,
  );
  if (!response.ok) {
    throw new Error("Token validatie mislukt.");
  }
  return response.json();
}

async function ensurePageAccess() {
  try {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get(ACCESS_TOKEN_QUERY_PARAM);
    const storedToken = JSON.parse(
      localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) || "null",
    );
    const token = urlToken || storedToken?.token;

    if (!token) {
      showAccessDenied("Je hebt geen geldig toegangstoken voor deze pagina.");
      return;
    }

    const validationResult = await validateAccessToken(token);
    if (!validationResult.valid) {
      showAccessDenied(
        "Je toegangstoken ontbreekt, is verlopen of is ingetrokken.",
        token,
      );
      return;
    }

    localStorage.setItem(
      ACCESS_TOKEN_STORAGE_KEY,
      JSON.stringify({
        token,
        expires_at: validationResult.expires_at,
      }),
    );

    if (urlToken) {
      params.delete(ACCESS_TOKEN_QUERY_PARAM);
      const queryString = params.toString();
      const sanitizedUrl = `${window.location.pathname}${
        queryString ? `?${queryString}` : ""
      }${window.location.hash}`;
      window.history.replaceState({}, document.title, sanitizedUrl);
    }

    restorePageVisibility();
  } catch (error) {
    console.error("Access validation failed:", error);
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get(ACCESS_TOKEN_QUERY_PARAM);
    const storedToken = JSON.parse(
      localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) || "null",
    );
    showAccessDenied(
      "Toegang kon niet worden gevalideerd.",
      urlToken || storedToken?.token || null,
    );
  }
}

ensurePageAccess();
