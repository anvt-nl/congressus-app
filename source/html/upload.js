// Initialize Lucide icons
lucide.createIcons();

// File input handling
const fileInput = document.getElementById("fileInput");
const uploadBtn = document.getElementById("uploadBtn");
const fileName = document.getElementById("fileName");

fileInput.addEventListener("change", function () {
  if (this.files.length > 0) {
    fileName.textContent = `Geselecteerd: ${this.files[0].name}`;
    fileName.classList.remove("hidden");
    uploadBtn.disabled = false;
  } else {
    fileName.classList.add("hidden");
    uploadBtn.disabled = true;
  }
});

async function uploadFile() {
  const file = fileInput.files[0];
  if (!file) {
    alert("Selecteer een bestand");
    return;
  }

  // Show loading state
  document.getElementById("uploadForm").classList.add("hidden");
  document.getElementById("loadingState").classList.remove("hidden");
  document.getElementById("resultsSection").classList.add("hidden");

  try {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/upload-kenteken", {
      method: "POST",
      body: formData,
    });

    const result = await response.json();

    // Hide loading
    document.getElementById("loadingState").classList.add("hidden");
    document.getElementById("resultsSection").classList.remove("hidden");

    if (result.status === "success") {
      // Show success results
      document.getElementById("successResults").classList.remove("hidden");
      document.getElementById("errorResults").classList.add("hidden");

      // Update counts
      document.getElementById("totalCount").textContent = result.total || 0;
      document.getElementById("addedCount").textContent = result.added || 0;
      document.getElementById("duplicatesCount").textContent =
        result.duplicates || 0;

      // Show errors if any
      if (result.errors && result.errors.length > 0) {
        document.getElementById("errorsSection").classList.remove("hidden");
        const errorsList = document.getElementById("errorsList");
        errorsList.innerHTML = "";
        result.errors.forEach((error) => {
          const li = document.createElement("li");
          li.textContent = error;
          errorsList.appendChild(li);
        });
      } else {
        document.getElementById("errorsSection").classList.add("hidden");
      }
    } else {
      // Show error
      document.getElementById("successResults").classList.add("hidden");
      document.getElementById("errorResults").classList.remove("hidden");
      document.getElementById("errorMessage").textContent =
        result.message || "Onbekende fout";
    }

    // Reinitialize icons
    lucide.createIcons();
  } catch (error) {
    console.error("Upload error:", error);

    // Hide loading
    document.getElementById("loadingState").classList.add("hidden");
    document.getElementById("resultsSection").classList.remove("hidden");

    // Show error
    document.getElementById("successResults").classList.add("hidden");
    document.getElementById("errorResults").classList.remove("hidden");
    document.getElementById("errorMessage").textContent =
      "Fout bij uploaden: " + error.message;

    // Reinitialize icons
    lucide.createIcons();
  }
}

function resetForm() {
  // Reset form
  fileInput.value = "";
  fileName.classList.add("hidden");
  uploadBtn.disabled = true;

  // Show form, hide results
  document.getElementById("uploadForm").classList.remove("hidden");
  document.getElementById("loadingState").classList.add("hidden");
  document.getElementById("resultsSection").classList.add("hidden");

  // Reinitialize icons
  lucide.createIcons();
}
