document.addEventListener("DOMContentLoaded", () => {
  const chooseAlarmBtn = document.getElementById("chooseAlarmBtn");
  const previewAlarmBtn = document.getElementById("previewAlarmBtn");
  const closeAlarmBtn = document.getElementById("closeAlarmFolderBtn");
  const alarmSound = document.getElementById("alarmSound");
  const alarmCurrentFile = document.getElementById("alarmCurrentFile");
  const alarmFeedback = document.getElementById("alarmFeedback");

  if (!chooseAlarmBtn || !alarmSound) {
    console.error("alarmModal: required elements not found.");
    return;
  }

  // ── Path helper ───────────────────────────────────────────
  function toFileUrl(filePath) {
    const normalized = filePath.replace(/\\/g, "/");
    return normalized.startsWith("/")
      ? `file://${normalized}`
      : `file:///${normalized}`;
  }

  function getFileName(filePath) {
    return filePath.replace(/\\/g, "/").split("/").pop();
  }

  // ── Feedback helper ───────────────────────────────────────
  function showFeedback(message, type = "success") {
    if (!alarmFeedback) return;
    alarmFeedback.textContent = message;
    alarmFeedback.className = `alarm-feedback ${type}`;
    alarmFeedback.classList.remove("hidden");
    setTimeout(() => {
      alarmFeedback.classList.add("hidden");
    }, 3000);
  }

  // ── Dosya adını güncelle ──────────────────────────────────
  function updateCurrentFile(filePath) {
    if (!alarmCurrentFile) return;
    alarmCurrentFile.textContent = filePath
      ? getFileName(filePath)
      : "Default alarm";
  }

  // ── Kayıtlı dosyayı yükle ────────────────────────────────
  const savedAlarmPath = localStorage.getItem("selectedAlarmPath");
  if (savedAlarmPath) {
    alarmSound.src = toFileUrl(savedAlarmPath);
    updateCurrentFile(savedAlarmPath);
  } else {
    updateCurrentFile(null);
  }

  // ── Dosya seç ────────────────────────────────────────────
  chooseAlarmBtn.addEventListener("click", async () => {
    try {
      const filePath = await window.electronAPI.getFilePath();
      if (!filePath) {
        showFeedback("No file selected.", "error");
        return;
      }
      localStorage.setItem("selectedAlarmPath", filePath);
      alarmSound.src = toFileUrl(filePath);
      updateCurrentFile(filePath);
      showFeedback(`"${getFileName(filePath)}" saved as alarm.`, "success");
    } catch (err) {
      console.error("Error opening file dialog:", err);
      showFeedback("Could not open file picker.", "error");
    }
  });

  // ── Preview ───────────────────────────────────────────────
  let isPreviewing = false;

  if (previewAlarmBtn) {
    previewAlarmBtn.addEventListener("click", () => {
      if (isPreviewing) {
        // Durdur
        alarmSound.pause();
        alarmSound.currentTime = 0;
        isPreviewing = false;
        previewAlarmBtn.textContent = "▶ Preview";
        previewAlarmBtn.setAttribute("aria-label", "Preview alarm sound");
      } else {
        // Çal
        alarmSound.currentTime = 0;
        alarmSound
          .play()
          .then(() => {
            isPreviewing = true;
            previewAlarmBtn.textContent = "⏹ Stop";
            previewAlarmBtn.setAttribute("aria-label", "Stop preview");
          })
          .catch(err => {
            console.warn("Preview failed:", err);
            showFeedback("Could not play audio. Check file path.", "error");
          });
      }
    });

    // Ses bitince butonu sıfırla
    alarmSound.addEventListener("ended", () => {
      isPreviewing = false;
      previewAlarmBtn.textContent = "▶ Preview";
      previewAlarmBtn.setAttribute("aria-label", "Preview alarm sound");
    });
  }

  // ── Modal kapanınca preview durdur ────────────────────────
  if (closeAlarmBtn) {
    closeAlarmBtn.addEventListener("click", () => {
      if (isPreviewing) {
        alarmSound.pause();
        alarmSound.currentTime = 0;
        isPreviewing = false;
        if (previewAlarmBtn) {
          previewAlarmBtn.textContent = "▶ Preview";
        }
      }
    });
  }

  // ── Doğal bitiş ───────────────────────────────────────────
  alarmSound.addEventListener("ended", () => {
    alarmSound.pause();
    alarmSound.currentTime = 0;
  });
});
