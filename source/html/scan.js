lucide.createIcons();

let html5QrCode;
let isScanning = false;

// UI Elements
const startScanBtn = document.getElementById("startScanBtn");
const stopScanBtn = document.getElementById("stopScanBtn");
const scanAgainBtn = document.getElementById("scanAgainBtn");
const copyBtn = document.getElementById("copyBtn");
const scanButtonContainer = document.getElementById("scanButtonContainer");
const stopButtonContainer = document.getElementById("stopButtonContainer");
const scannerContainer = document.getElementById("scannerContainer");
const resultsContainer = document.getElementById("resultsContainer");
const errorContainer = document.getElementById("errorContainer");
const scanResult = document.getElementById("scanResult");
const errorMessage = document.getElementById("errorMessage");

// Start scanning
startScanBtn.addEventListener("click", startScanning);
scanAgainBtn.addEventListener("click", startScanning);

// Stop scanning
stopScanBtn.addEventListener("click", stopScanning);

// Copy result
copyBtn.addEventListener("click", () => {
  const text = scanResult.textContent;
  navigator.clipboard
    .writeText(text)
    .then(() => {
      const originalText = copyBtn.innerHTML;
      copyBtn.innerHTML = '<i data-lucide="check" class="w-5 h-5"></i> Copied!';
      lucide.createIcons();
      setTimeout(() => {
        copyBtn.innerHTML = originalText;
        lucide.createIcons();
      }, 2000);
    })
    .catch((err) => {
      showError("Failed to copy: " + err.message);
    });
});

function startScanning() {
  // Hide results and errors
  resultsContainer.classList.add("hidden");
  errorContainer.classList.add("hidden");

  // Cleanup previous error title if exists
  const oldTitle = document.getElementById("scanNotFoundTitle");
  if (oldTitle) oldTitle.remove();

  // Show scanner, hide scan button
  scanButtonContainer.classList.add("hidden");
  scannerContainer.classList.remove("hidden");
  stopButtonContainer.classList.remove("hidden");

  // Initialize scanner if not already done
  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode("reader");
  }

  // Configure scanner
  const config = {
    fps: 10,
    qrbox: { width: 250, height: 250 },
    aspectRatio: 1.0,
  };

  // Start scanning
  html5QrCode
    .start(
      { facingMode: "environment" }, // Use back camera
      config,
      onScanSuccess,
      onScanError,
    )
    .then(() => {
      isScanning = true;
      console.log("Scanner started successfully");
    })
    .catch((err) => {
      showError(`Unable to start scanner: ${err}`);
      resetUI();
    });
}

function stopScanning() {
  if (html5QrCode && isScanning) {
    html5QrCode
      .stop()
      .then(() => {
        isScanning = false;
        console.log("Scanner stopped");
        resetUI();
      })
      .catch((err) => {
        console.error("Error stopping scanner:", err);
        resetUI();
      });
  } else {
    resetUI();
  }
}

function onScanSuccess(decodedText, decodedResult) {
  console.log(`Scan successful: ${decodedText}`, decodedResult);

  // Stop scanning
  stopScanning();

  try {
    const data = JSON.parse(decodedText);
    const accessKey = data.id || data.access_key;

    if (!accessKey) {
      showError("Invalid QR Code: Missing 'id' or 'access_key' in JSON.");
      return;
    }

    // Call backend to look up ticket
    fetch(`/ticket/by-access-key/${accessKey}`)
      .then((response) => {
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error("Ticket not found in database.");
          }
          throw new Error(`Server error: ${response.status}`);
        }
        return response.json();
      })
      .then((ticket) => {
        // Redirect to ticket page
        window.location.href = `ticket.html?event_id=${ticket.event_id}&obj_id=${ticket.obj_id}&highlight_key=${accessKey}`;
      })
      .catch((err) => {
        if (err.message === "Ticket not found in database.") {
          // Show the JSON data instead of error
          const prettyJson = JSON.stringify(data, null, 2);

          // Remove any existing title first
          const oldTitle = document.getElementById("scanNotFoundTitle");
          if (oldTitle) oldTitle.remove();

          // Add a title or message
          const title = document.createElement("div");
          title.id = "scanNotFoundTitle";
          title.className = "text-amber-600 font-bold mb-2";
          title.textContent = "Ticket niet gevonden in database. Scanned data:";

          scanResult.innerHTML = `<pre class="text-xs text-left overflow-auto max-h-60">${prettyJson}</pre>`;
          scanResult.parentNode.insertBefore(title, scanResult);

          resultsContainer.classList.remove("hidden");
        } else {
          showError(err.message);
        }
      });
  } catch (e) {
    showError("Invalid QR Code: Scanned data is not valid JSON.");
    // Show raw text for debugging if needed, or keeping it hidden to avoid confusion
    scanResult.textContent = decodedText;
    resultsContainer.classList.remove("hidden");
  }
}

function onScanError(errorMessage) {
  // This is called frequently during scanning, so we don't show it as an error
  // console.log(`Scan error: ${errorMessage}`);
}

function showError(message) {
  errorMessage.textContent = message;
  errorContainer.classList.remove("hidden");
  lucide.createIcons();
}

function resetUI() {
  scannerContainer.classList.add("hidden");
  stopButtonContainer.classList.add("hidden");
  scanButtonContainer.classList.remove("hidden");
  lucide.createIcons();
}
