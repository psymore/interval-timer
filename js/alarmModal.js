import { alarmManager } from "./alarm/AlarmManager.js";
import { AlarmProviderFactory } from "./alarm/AlarmProviderFactory.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("alarmModal");

// ── Path helpers ──────────────────────────────────────────────
// Renderer http:// origin'inden yüklendiği için file:// kaynaklar artık
// çalışmıyor (bkz. main.js handleLocalAudioRequest) — bunun yerine local
// server'ın /local-audio/ route'u üzerinden aynı origin'den servis ediyoruz.
export function toFileUrl(filePath) {
  return `${window.location.origin}/local-audio/${encodeURIComponent(filePath)}`;
}

export function getFileName(filePath) {
  return filePath.replace(/\\/g, "/").split("/").pop();
}

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
  const spotifyStatusLabel = document.getElementById("spotifyStatusLabel");
  const spotifyConnectBtn = document.getElementById("spotifyConnectBtn");
  const spotifyLogoutBtn = document.getElementById("spotifyLogoutBtn");

  if (!chooseAlarmBtn) {
    log.error("alarmModal: #chooseAlarmBtn not found.");
    return;
  }

  let isPreviewing = false;

  // ── Helpers ───────────────────────────────────────────────
  function showFeedback(message, type = "success") {
    if (!alarmFeedback) return;
    alarmFeedback.textContent = message;
    alarmFeedback.className = `alarm-feedback ${type}`;
    alarmFeedback.classList.remove("hidden");
    setTimeout(() => alarmFeedback.classList.add("hidden"), 4000);
  }

  function updateCurrentFile(label) {
    if (!alarmCurrentFile) return;
    alarmCurrentFile.textContent = label || "Default alarm";
  }

  function updateProviderTag(type) {
    if (urlProviderTag) {
      const labels = { youtube: "YouTube", spotify: "Spotify" };
      const label = labels[type];
      if (label) {
        urlProviderTag.textContent = label;
        urlProviderTag.classList.remove("hidden");
      } else {
        urlProviderTag.classList.add("hidden");
      }
    }

    if (previewAlarmBtn) {
      const disablePreview = type === "spotify";
      previewAlarmBtn.disabled = disablePreview;
      previewAlarmBtn.title = disablePreview
        ? "Preview isn't available for Spotify — playing opens the Spotify app directly."
        : "";
    }
  }

  function resetPreviewBtn() {
    isPreviewing = false;
    if (previewAlarmBtn) {
      previewAlarmBtn.textContent = "▶ Preview";
      previewAlarmBtn.setAttribute("aria-label", "Preview alarm sound");
    }
  }

  function setUrlLoadBtnState(loading) {
    if (!urlLoadBtn) return;
    urlLoadBtn.disabled = loading;
    urlLoadBtn.textContent = loading ? "Loading…" : "Load";
  }

  // ── AlarmManager callbacks ────────────────────────────────
  alarmManager.setCallbacks({
    onFallback: ({ reason }) => {
      log.warn("Alarm fallback:", reason);
      showFeedback(
        "External alarm unavailable. Using local fallback.",
        "error",
      );
      updateProviderTag("local");
    },
    onError: ({ error, type }) => {
      log.error(`Alarm error [${type}]:`, error?.message);
    },
    onStop: () => resetPreviewBtn(),
  });

  // ── Başlangıç yükleme ─────────────────────────────────────
  await alarmManager.initialize(DEFAULT_ALARM);
  await updateSpotifyAuthUI();

  const savedSource = localStorage.getItem("selectedAlarmPath");
  if (savedSource) {
    const type = AlarmProviderFactory.detect(savedSource);
    if (type === "local") {
      updateCurrentFile(getFileName(savedSource));
    } else {
      const label =
        savedSource.length > 40 ? savedSource.slice(0, 37) + "…" : savedSource;
      updateCurrentFile(label);
      // alarmManager.initialize() may have silently fallen back to local
      // (e.g. no Spotify session) — reflect what actually loaded, not the
      // raw saved string, so the tag/Preview-disable state stays accurate.
      updateProviderTag(alarmManager.getProviderType());
    }
  } else {
    updateCurrentFile("alarm.mp3 (default)");
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

      await alarmManager.load(url);
      alarmManager.setFallbackSource(url);

      // Ham path'i kaydet (file:// olmadan) — initialize doğru tespit etsin
      localStorage.setItem("selectedAlarmPath", filePath);

      updateCurrentFile(getFileName(filePath));
      updateProviderTag("local");
      resetPreviewBtn();
      showFeedback(`"${getFileName(filePath)}" loaded as alarm.`, "success");
    } catch (err) {
      log.error("File pick error:", err);
      showFeedback("Could not load audio file.", "error");
    }
  });

  // ── URL ile yükleme (YouTube / Spotify) ───────────────────
  urlLoadBtn.addEventListener("click", async () => {
    const rawUrl = urlInput.value.trim();
    if (!rawUrl) {
      showFeedback("Please enter a YouTube or Spotify URL.", "error");
      urlInput.focus();
      return;
    }

    const detectedType = AlarmProviderFactory.detect(rawUrl);
    if (detectedType === "local") {
      showFeedback("Please enter a valid YouTube or Spotify URL.", "error");
      return;
    }

    setUrlLoadBtnState(true);

    try {
      const result = await alarmManager.load(rawUrl);

      if (result.usedFallback) {
        const providerLabel =
          detectedType === "youtube" ? "YouTube" : "Spotify";
        showFeedback(
          `${providerLabel} unavailable. Using local alarm as fallback.`,
          "error",
        );
        updateProviderTag("local");
        updateCurrentFile("alarm.mp3 (fallback)");
      } else {
        const providerLabel =
          detectedType === "youtube" ? "YouTube" : "Spotify";
        showFeedback(`${providerLabel} alarm loaded.`, "success");
        updateProviderTag(detectedType);

        const displayLabel =
          rawUrl.length > 40 ? rawUrl.slice(0, 37) + "…" : rawUrl;
        updateCurrentFile(displayLabel);
        localStorage.setItem("selectedAlarmPath", rawUrl);
      }

      resetPreviewBtn();
      urlInput.value = "";
    } catch (err) {
      log.error("URL load error:", err);
      showFeedback(
        `Failed to load: ${err.message ?? "Unknown error"}`,
        "error",
      );
    } finally {
      setUrlLoadBtnState(false);
    }
  });

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
        log.warn("Preview failed:", err);
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

  // ── Spotify auth UI ────────────────────────────────────────
  async function hasSpotifySession() {
    const tokens = await window.electronAPI.spotifyGetTokens();
    return Boolean(tokens?.accessToken || tokens?.refreshToken);
  }

  async function updateSpotifyAuthUI() {
    const connected = await hasSpotifySession();
    if (spotifyStatusLabel) {
      spotifyStatusLabel.textContent = connected ? "Connected" : "Not connected";
    }
    if (spotifyConnectBtn) spotifyConnectBtn.classList.toggle("hidden", connected);
    if (spotifyLogoutBtn) spotifyLogoutBtn.classList.toggle("hidden", !connected);
  }

  if (spotifyConnectBtn) {
    spotifyConnectBtn.addEventListener("click", async () => {
      spotifyConnectBtn.disabled = true;
      spotifyConnectBtn.textContent = "Connecting…";
      try {
        const tokens = await window.electronAPI.spotifyLogin();
        await alarmManager._saveSpotifyTokens(tokens);
        await updateSpotifyAuthUI();
        showFeedback("Spotify connected.", "success");
      } catch (err) {
        log.error("Spotify login error:", err);
        showFeedback(
          `Spotify connection failed: ${err.message ?? "Unknown error"}`,
          "error",
        );
      } finally {
        spotifyConnectBtn.disabled = false;
        spotifyConnectBtn.textContent = "Connect Spotify";
      }
    });
  }

  if (spotifyLogoutBtn) {
    spotifyLogoutBtn.addEventListener("click", async () => {
      await alarmManager._clearSpotifyTokens();

      // Spotify was the active alarm source — the loaded provider now holds
      // a dead session (OS launch needs no token so Preview would still
      // "work" and restart the track, but stop() would silently no-op with
      // no token). Revert the actual loaded source back to local so
      // Preview/Stop stay correct, matching what the UI now shows.
      if (alarmManager.getProviderType() === "spotify") {
        try {
          await alarmManager.load(DEFAULT_ALARM);
          alarmManager.setFallbackSource(DEFAULT_ALARM);
          localStorage.removeItem("selectedAlarmPath");
          updateCurrentFile("alarm.mp3 (default)");
        } catch (e) {
          log.error("Failed to revert to default alarm after Spotify disconnect:", e);
        }
      }

      showFeedback("Spotify disconnected.", "success");
      updateProviderTag("local");
      await updateSpotifyAuthUI();
    });
  }

  await updateSpotifyAuthUI();
});
