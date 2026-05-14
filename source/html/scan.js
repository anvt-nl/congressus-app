lucide.createIcons();

let html5QrCode;
let isScanning = false;
let isProcessing = false;
let audioContext;

// UI Elements
const startScanBtn = document.getElementById("startScanBtn");
const stopScanBtn = document.getElementById("stopScanBtn");
const scanAgainBtn = document.getElementById("scanAgainBtn");
const copyBtn = document.getElementById("copyBtn");
const closestEventBtn = document.getElementById("closestEventBtn");
const scanButtonContainer = document.getElementById("scanButtonContainer");
const stopButtonContainer = document.getElementById("stopButtonContainer");
const scannerContainer = document.getElementById("scannerContainer");
const loadingContainer = document.getElementById("loadingContainer");
const resultsContainer = document.getElementById("resultsContainer");
const errorContainer = document.getElementById("errorContainer");
const scanResult = document.getElementById("scanResult");
const errorMessage = document.getElementById("errorMessage");

function getAudioContext() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;

  if (!audioContext) {
    audioContext = new AudioContext();
  }

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  return audioContext;
}

function playBeepSound() {
  try {
    const context = getAudioContext();
    if (!context) return;

    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    const startTime = context.currentTime;

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(660, startTime);
    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.exponentialRampToValueAtTime(1, startTime + 0.005);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.14);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + 0.16);
  } catch (error) {
    console.error("Audio playback failed", error);
  }
}

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

if (closestEventBtn) {
  closestEventBtn.addEventListener("click", goToClosestEvent);
}

async function goToClosestEvent() {
  if (!closestEventBtn) return;

  const originalHtml = closestEventBtn.innerHTML;
  closestEventBtn.disabled = true;
  closestEventBtn.classList.add("opacity-60", "cursor-not-allowed");
  closestEventBtn.innerHTML =
    '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Laden...';
  lucide.createIcons();

  try {
    const response = await fetch("/events");
    if (!response.ok) throw new Error("Evenementen konden niet worden geladen.");

    const events = await response.json();
    if (!Array.isArray(events) || events.length === 0) {
      throw new Error("Geen evenementen gevonden.");
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let todayEvent = null;
    let nearestPastEvent = null;
    let nearestFutureEvent = null;

    for (const event of events) {
      if (!event.start) continue;

      const eventDate = new Date(String(event.start).split("T")[0]);
      if (Number.isNaN(eventDate.getTime())) continue;
      eventDate.setHours(0, 0, 0, 0);

      const eventTime = eventDate.getTime();
      const todayTime = today.getTime();

      if (eventTime === todayTime) {
        todayEvent = event;
        continue;
      }

      if (eventTime < todayTime) {
        if (
          !nearestPastEvent ||
          eventTime >
            new Date(String(nearestPastEvent.start).split("T")[0]).getTime()
        ) {
          nearestPastEvent = event;
        }
        continue;
      }

      if (
        !nearestFutureEvent ||
        eventTime < new Date(String(nearestFutureEvent.start).split("T")[0]).getTime()
      ) {
        nearestFutureEvent = event;
      }
    }

    let closestEvent = todayEvent;

    if (!closestEvent && nearestPastEvent && nearestFutureEvent) {
      const pastDistance =
        today.getTime() -
        new Date(String(nearestPastEvent.start).split("T")[0]).getTime();
      const futureDistance =
        new Date(String(nearestFutureEvent.start).split("T")[0]).getTime() -
        today.getTime();

      closestEvent =
        futureDistance <= pastDistance ? nearestFutureEvent : nearestPastEvent;
    } else if (!closestEvent) {
      closestEvent = nearestFutureEvent || nearestPastEvent;
    }

    if (!closestEvent) {
      throw new Error("Geen geldig evenement met datum gevonden.");
    }

    window.location.href = `participations_overview.html?event_id=${closestEvent.id}`;
  } catch (err) {
    showError(err.message);
  } finally {
    closestEventBtn.disabled = false;
    closestEventBtn.classList.remove("opacity-60", "cursor-not-allowed");
    closestEventBtn.innerHTML = originalHtml;
    lucide.createIcons();
  }
}

function startScanning() {
  // Hide results and errors
  resultsContainer.classList.add("hidden");
  errorContainer.classList.add("hidden");
  loadingContainer.classList.add("hidden");

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
  playBeepSound();

  // Stop scanning
  stopScanning();

  // Show loading indicator
  isProcessing = true;
  loadingContainer.classList.remove("hidden");
  lucide.createIcons();

  try {
    const data = JSON.parse(decodedText);
    const accessKey = data.id || data.access_key;

    if (!accessKey) {
      showError("Ongeldige QR Code: Missing 'id' or 'access_key' in JSON.");
      return;
    }

    // Call backend to look up ticket
    fetch(`/ticket/by-access-key/${accessKey}`)
      .then((response) => {
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error("Ticket niet gevonden in database.");
          }
          throw new Error(`Server error: ${response.status}`);
        }
        return response.json();
      })
      .then((ticket) => {
        // Redirect to ticket page
        window.location.href = `scanned_ticket.html?event_id=${ticket.event_id}&ticket_id=${ticket.obj_id}`;
      })
      .catch((err) => {
        if (err.message === "Ticket not found in database.") {
          isProcessing = false;
          resetUI();
          loadingContainer.classList.add("hidden");
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
    loadingContainer.classList.add("hidden");
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
  isProcessing = false;
  resetUI();
  loadingContainer.classList.add("hidden");
  errorMessage.textContent = message;
  errorContainer.classList.remove("hidden");
  lucide.createIcons();
}

function resetUI() {
  scannerContainer.classList.add("hidden");
  stopButtonContainer.classList.add("hidden");
  scanButtonContainer.classList.remove("hidden");

  if (isProcessing) {
    startScanBtn.disabled = true;
    startScanBtn.classList.add("opacity-50", "cursor-not-allowed");
    startScanBtn.classList.remove("hover:shadow-xl", "hover:from-yellow-500", "hover:to-yellow-600", "hover:scale-105");
    startScanBtn.innerHTML = '<i data-lucide="loader-2" class="w-6 h-6 animate-spin"></i> Bezig...';
  } else {
    startScanBtn.disabled = false;
    startScanBtn.classList.remove("opacity-50", "cursor-not-allowed");
    startScanBtn.classList.add("hover:shadow-xl", "hover:from-yellow-500", "hover:to-yellow-600", "hover:scale-105");
    startScanBtn.innerHTML = '<i data-lucide="scan" class="w-6 h-6"></i> Start Scannen';
  }
  lucide.createIcons();
}
