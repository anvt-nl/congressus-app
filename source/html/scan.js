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

  // Show results
  scanResult.textContent = decodedText;
  resultsContainer.classList.remove("hidden");

  // Recreate icons
  lucide.createIcons();

  // Optional: Play success sound or vibration
  if (navigator.vibrate) {
    navigator.vibrate(200);
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
