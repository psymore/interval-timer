import { alarmManager } from "./alarm/AlarmManager.js";

// ── Path helpers ──────────────────────────────────────────────
export function toFileUrl(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.startsWith("/")
    ? `file://${normalized}`
    : `file:///${normalized}`;
}

export function getFileName(filePath) {
  return filePath.replace(/\\/g, "/").split("/").pop();
}

// ── Default alarm source ──────────────────────────────────────
const DEFAULT_ALARM = "assets/alarm.mp3";

// ── Modal setup ───────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  const chooseAlarmBtn = document.getElementById("chooseAlarmBtn");
  const previewAlarmBtn = document.getElementById("previewAlarmBtn");
  const closeAlarmBtn = document.getElementById("closeAlarmFolderBtn");
  const alarmCurrentFile = document.getElementById("alarmCurrentFile");
  const alarmFeedback = document.getElementById("alarmFeedback");
  const urlInput = document.getElementById("alarmUrlInput");
  const urlLoadBtn = document.getElementById("alarmUrlLoadBtn");
  const urlProviderTag = document.getElementById("alarmProviderTag");

  if (!chooseAlarmBtn) {
    console.error("alarmModal: #chooseAlarmBtn not found.");
    return;
  }

  let isPreviewing = false;

  // ── Feedback ──────────────────────────────────────────────
  function showFeedback(message, type = "success") {
    if (!alarmFeedback) return;
    alarmFeedback.textContent = message;
    alarmFeedback.className = `alarm-feedback ${type}`;
    alarmFeedback.classList.remove("hidden");
    setTimeout(() => alarmFeedback.classList.add("hidden"), 3000);
  }

  // ── Dosya adı / kaynak güncelle ───────────────────────────
  function updateCurrentFile(label) {
    if (!alarmCurrentFile) return;
    alarmCurrentFile.textContent = label || "Default alarm";
  }

  function updateProviderTag(type) {
    if (!urlProviderTag) return;
    const labels = {
      local: null, // tag gösterme
      youtube: "YouTube",
      spotify: "Spotify",
    };
    const label = labels[type];
    if (label) {
      urlProviderTag.textContent = label;
      urlProviderTag.classList.remove("hidden");
    } else {
      urlProviderTag.classList.add("hidden");
    }
  }

  // ── Preview durumunu sıfırla ──────────────────────────────
  function resetPreviewBtn() {
    isPreviewing = false;
    if (previewAlarmBtn) {
      previewAlarmBtn.textContent = "▶ Preview";
      previewAlarmBtn.setAttribute("aria-label", "Preview alarm sound");
    }
  }

  // ── AlarmManager callback'leri ────────────────────────────
  alarmManager.setCallbacks({
    onFallback: ({ reason }) => {
      console.warn("Alarm fallback:", reason);
      showFeedback("External alarm failed, using local.", "error");
      updateProviderTag("local");
    },
    onError: ({ error, type }) => {
      console.error(`Alarm error [${type}]:`, error?.message);
    },
    onStop: () => {
      resetPreviewBtn();
    },
  });

  // ── Başlangıç: default veya kayıtlı ──────────────────────
  await alarmManager.initialize(DEFAULT_ALARM);

  const savedPath = localStorage.getItem("selectedAlarmPath");
  if (savedPath) {
    updateCurrentFile(getFileName(savedPath));
    updateProviderTag("local");
  } else {
    updateCurrentFile("alarm.mp3 (default)");
    updateProviderTag("local");
  }

  // ── Local dosya seç ───────────────────────────────────────
  chooseAlarmBtn.addEventListener("click", async () => {
    try {
      const filePath = await window.electronAPI.getFilePath();
      if (!filePath) {
        showFeedback("No file selected.", "error");
        return;
      }

      const url = toFileUrl(filePath);
      localStorage.setItem("selectedAlarmPath", filePath);

      await alarmManager.load(url);
      alarmManager.setFallbackSource(url);

      updateCurrentFile(getFileName(filePath));
      updateProviderTag("local");
      resetPreviewBtn();
      showFeedback(`"${getFileName(filePath)}" loaded as alarm.`, "success");
    } catch (err) {
      console.error("File pick error:", err);
      showFeedback("Could not load audio file.", "error");
    }
  });

  // ── URL ile yükleme (YouTube / Spotify) ───────────────────
  if (urlLoadBtn && urlInput) {
    urlLoadBtn.addEventListener("click", async () => {
      const url = urlInput.value.trim();
      if (!url) {
        showFeedback("Please enter a YouTube or Spotify URL.", "error");
        urlInput.focus();
        return;
      }

      const detectedType = (
        await import("./alarm/AlarmProviderFactory.js")
      ).AlarmProviderFactory.detect(url);

      if (detectedType === "local") {
        showFeedback("Please enter a valid YouTube or Spotify URL.", "error");
        return;
      }

      urlLoadBtn.disabled = true;
      urlLoadBtn.textContent = "Loading…";

      try {
        const result = await alarmManager.load(url);

        if (result.usedFallback) {
          showFeedback(
            `${detectedType === "youtube" ? "YouTube" : "Spotify"} failed. ` +
              `Using local alarm instead.`,
            "error",
          );
          updateProviderTag("local");
          updateCurrentFile("alarm.mp3 (fallback)");
        } else {
          const label = detectedType === "youtube" ? "YouTube" : "Spotify";
          showFeedback(`${label} alarm loaded.`, "success");
          updateProviderTag(detectedType);
          updateCurrentFile(url.length > 40 ? url.slice(0, 37) + "…" : url);
          // localStorage'dan local path'i temizle — artık URL kullanılıyor
          localStorage.removeItem("selectedAlarmPath");
        }

        resetPreviewBtn();
      } catch (err) {
        showFeedback(
          "Failed to load URL. Check the link and try again.",
          "error",
        );
        console.error("URL load error:", err);
      } finally {
        urlLoadBtn.disabled = false;
        urlLoadBtn.textContent = "Load";
      }
    });

    // Enter tuşuyla yükle
    urlInput.addEventListener("keydown", e => {
      if (e.key === "Enter") urlLoadBtn.click();
    });
  }

  // ── Preview ───────────────────────────────────────────────
  if (previewAlarmBtn) {
    previewAlarmBtn.addEventListener("click", async () => {
      if (isPreviewing) {
        await alarmManager.stop();
        resetPreviewBtn();
        return;
      }

      if (!alarmManager.isReady()) {
        showFeedback("No alarm loaded. Choose a file or URL first.", "error");
        return;
      }

      try {
        await alarmManager.play(0);
        isPreviewing = true;
        previewAlarmBtn.textContent = "⏹ Stop";
        previewAlarmBtn.setAttribute("aria-label", "Stop preview");
      } catch (err) {
        console.warn("Preview failed:", err);
        showFeedback("Could not play alarm. Check the source.", "error");
        resetPreviewBtn();
      }
    });
  }

  // ── Modal kapanınca preview durdur ────────────────────────
  if (closeAlarmBtn) {
    closeAlarmBtn.addEventListener("click", async () => {
      if (isPreviewing) {
        await alarmManager.stop();
        resetPreviewBtn();
      }
    });
  }
});
