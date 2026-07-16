import { alarmManager } from "./alarm/AlarmManager.js";
import { AlarmProviderFactory } from "./alarm/AlarmProviderFactory.js";
import { addRecentPath, loadRecentPaths, saveRecentPaths } from "./alarm/recentAlarms.js";
import { createLogger } from "../lib/logger.js";
import { t, format, onLanguageChange } from "./i18n/i18n.js";

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
// Mirrors LOCAL_AUDIO_EXTENSIONS in lib/localServer.js — duplicated because
// the renderer can't import a main-process module; keep both lists in sync
// if the supported formats ever change.
const SUPPORTED_LOCAL_EXTENSIONS = [".mp3", ".wav", ".ogg"];

// Lucide "folder-open" (ISC license) — no brand mark exists for "local
// file", so this is a generic glyph using currentColor to match whichever
// element it's dropped into (unlike the Spotify/YouTube <img> icons, which
// carry their own fixed brand color and must never be recolored).
const FOLDER_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/></svg>`;

// ── Modal setup ───────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  const chooseAlarmBtn = document.getElementById("chooseAlarmBtn");
  const previewAlarmBtn = document.getElementById("previewAlarmBtn");
  const closeAlarmBtn = document.getElementById("closeAlarmFolderBtn");
  const alarmCurrentFile = document.getElementById("alarmCurrentFile");
  const alarmCurrentIcon = document.getElementById("alarmCurrentIcon");
  const localSectionIcon = document.getElementById("localSectionIcon");
  const alarmFeedback = document.getElementById("alarmFeedback");
  const youtubeUrlInput = document.getElementById("youtubeUrlInput");
  const youtubeUrlLoadBtn = document.getElementById("youtubeUrlLoadBtn");
  const spotifyUrlInput = document.getElementById("spotifyUrlInput");
  const spotifyUrlLoadBtn = document.getElementById("spotifyUrlLoadBtn");
  const spotifyUrlRow = document.getElementById("spotifyUrlRow");
  const spotifyStatusLabel = document.getElementById("spotifyStatusLabel");
  const spotifyConnectBtn = document.getElementById("spotifyConnectBtn");
  const spotifyLogoutBtn = document.getElementById("spotifyLogoutBtn");

  if (!chooseAlarmBtn) {
    log.error("alarmModal: #chooseAlarmBtn not found.");
    return;
  }

  if (localSectionIcon) localSectionIcon.innerHTML = FOLDER_ICON_SVG;

  const alarmDropzone = document.getElementById("alarmDropzone");
  const alarmRecentList = document.getElementById("alarmRecentList");
  const alarmResetDefaultBtn = document.getElementById("alarmResetDefaultBtn");

  let recentPaths = loadRecentPaths();

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
    alarmCurrentFile.textContent = label || t("alarm.defaultLabel");
  }

  function updateCurrentIcon(type) {
    if (alarmCurrentIcon) {
      const markup = {
        local: FOLDER_ICON_SVG,
        youtube: '<img src="assets/icons/youtube.svg" alt="" />',
        spotify: '<img src="assets/icons/spotify.svg" alt="" />',
      };
      alarmCurrentIcon.innerHTML = markup[type] || markup.local;
    }

    if (previewAlarmBtn) {
      const disablePreview = type === "spotify";
      previewAlarmBtn.disabled = disablePreview;
      previewAlarmBtn.title = disablePreview
        ? t("alarm.previewDisabledTitle")
        : "";
    }
  }

  // ── Accordion: only one section open at a time ────────────
  function setupAccordion() {
    const toggles = document.querySelectorAll(".alarm-section-toggle");
    toggles.forEach(toggle => {
      toggle.addEventListener("click", () => {
        if (toggle.getAttribute("aria-expanded") === "true") return;

        toggles.forEach(t => {
          t.setAttribute("aria-expanded", "false");
          const body = document.getElementById(t.getAttribute("aria-controls"));
          if (body) body.classList.add("hidden");
        });

        toggle.setAttribute("aria-expanded", "true");
        const body = document.getElementById(toggle.getAttribute("aria-controls"));
        if (body) body.classList.remove("hidden");
      });
    });
  }
  setupAccordion();

  function resetPreviewBtn() {
    isPreviewing = false;
    if (previewAlarmBtn) {
      previewAlarmBtn.textContent = t("alarm.preview");
      previewAlarmBtn.setAttribute("aria-label", t("alarm.previewAriaLabel"));
    }
  }

  // ── AlarmManager callbacks ────────────────────────────────
  alarmManager.setCallbacks({
    onFallback: ({ reason }) => {
      log.warn("Alarm fallback:", reason);
      showFeedback(t("alarm.feedback.fallback"), "error");
      updateCurrentIcon("local");
    },
    onError: ({ error, type }) => {
      log.error(`Alarm error [${type}]:`, error?.message);
    },
    onStop: () => resetPreviewBtn(),
  });

  // ── Başlangıç yükleme ─────────────────────────────────────
  await alarmManager.initialize(DEFAULT_ALARM);
  await updateSpotifyAuthUI();

  // Tracks whether the current-file label is showing the translated
  // default (vs. a custom filename/URL) — used by the onLanguageChange
  // handler below to re-render only the default label, not a real
  // custom source name (see design spec's documented scope boundary
  // on why custom-source labels don't re-sync on toggle).
  let usingDefaultAlarm = false;

  const savedSource = localStorage.getItem("selectedAlarmPath");
  if (savedSource) {
    const type = AlarmProviderFactory.detect(savedSource);
    if (type === "local") {
      updateCurrentFile(getFileName(savedSource));
      updateCurrentIcon("local");
    } else {
      const label =
        savedSource.length > 40 ? savedSource.slice(0, 37) + "…" : savedSource;
      updateCurrentFile(label);
      // alarmManager.initialize() may have silently fallen back to local
      // (e.g. no Spotify session) — reflect what actually loaded, not the
      // raw saved string, so the icon/Preview-disable state stays accurate.
      updateCurrentIcon(alarmManager.getProviderType());
    }
  } else {
    usingDefaultAlarm = true;
    updateCurrentFile(t("alarm.defaultFile"));
    updateCurrentIcon("local");
  }

  // ── Local dosya: paylaşılan uygulama mantığı ──────────────
  // Used by the file-picker button, drag-and-drop, and clicking a "Recent"
  // entry — all three converge here so allowlist registration, current-file
  // display, and the recent-list update stay in exactly one place.
  async function applyLocalFile(filePath) {
    const result = await window.electronAPI.alarmUseLocalPath(filePath);
    if (result?.error) {
      showFeedback(t("alarm.feedback.fileLoadError"), "error");
      return false;
    }

    const url = toFileUrl(filePath);
    await alarmManager.load(url);
    alarmManager.setFallbackSource(url);
    localStorage.setItem("selectedAlarmPath", filePath);

    recentPaths = addRecentPath(recentPaths, filePath);
    saveRecentPaths(recentPaths);

    usingDefaultAlarm = false;
    updateCurrentFile(getFileName(filePath));
    updateCurrentIcon("local");
    resetPreviewBtn();
    await renderRecentList();
    return true;
  }

  async function renderRecentList() {
    if (!alarmRecentList) return;

    if (recentPaths.length === 0) {
      alarmRecentList.innerHTML = "";
      return;
    }

    const existsResults = await window.electronAPI.alarmCheckPathsExist(recentPaths);
    const currentPath = localStorage.getItem("selectedAlarmPath");

    alarmRecentList.innerHTML = recentPaths
      .map((p, i) => {
        const exists = existsResults[i];
        const isActive = p === currentPath;
        const classes = ["alarm-recent-item"];
        if (!exists) classes.push("missing");
        if (isActive) classes.push("active");
        const tag = !exists
          ? `<span class="alarm-recent-tag missing">${t("alarm.recentMissing")}</span>`
          : isActive
            ? `<span class="alarm-recent-tag">${t("alarm.recentActive")}</span>`
            : "";
        return `<li class="${classes.join(" ")}" data-path="${encodeURIComponent(p)}">
          <span class="alarm-recent-name">${getFileName(p)}</span>
          ${tag}
        </li>`;
      })
      .join("");

    alarmRecentList.querySelectorAll(".alarm-recent-item:not(.missing)").forEach(item => {
      item.addEventListener("click", () => {
        applyLocalFile(decodeURIComponent(item.dataset.path));
      });
    });
  }

  async function resetToDefault() {
    await alarmManager.load(DEFAULT_ALARM);
    alarmManager.setFallbackSource(DEFAULT_ALARM);
    localStorage.removeItem("selectedAlarmPath");
    usingDefaultAlarm = true;
    updateCurrentFile(t("alarm.defaultFile"));
    updateCurrentIcon("local");
    resetPreviewBtn();
    await renderRecentList();
  }

  // ── Local dosya seç ───────────────────────────────────────
  chooseAlarmBtn.addEventListener("click", async () => {
    try {
      const filePath = await window.electronAPI.getFilePath();
      if (!filePath) {
        showFeedback(t("alarm.feedback.noFileSelected"), "error");
        return;
      }

      const applied = await applyLocalFile(filePath);
      if (applied) {
        showFeedback(
          format(t("alarm.feedback.fileLoaded"), { name: getFileName(filePath) }),
          "success",
        );
      }
    } catch (err) {
      log.error("File pick error:", err);
      showFeedback(t("alarm.feedback.fileLoadError"), "error");
    }
  });

  if (alarmResetDefaultBtn) {
    alarmResetDefaultBtn.addEventListener("click", resetToDefault);
  }

  if (alarmDropzone) {
    alarmDropzone.addEventListener("dragover", e => {
      e.preventDefault();
      alarmDropzone.classList.add("dragover");
    });

    alarmDropzone.addEventListener("dragleave", () => {
      alarmDropzone.classList.remove("dragover");
    });

    alarmDropzone.addEventListener("drop", async e => {
      e.preventDefault();
      alarmDropzone.classList.remove("dragover");

      const file = e.dataTransfer.files[0];
      if (!file) return;

      const filePath = window.electronAPI.getPathForFile(file);
      const ext = "." + (filePath.split(".").pop() || "").toLowerCase();
      if (!SUPPORTED_LOCAL_EXTENSIONS.includes(ext)) {
        showFeedback(t("alarm.feedback.unsupportedFile"), "error");
        return;
      }

      const applied = await applyLocalFile(filePath);
      if (applied) {
        showFeedback(
          format(t("alarm.feedback.fileLoaded"), { name: getFileName(filePath) }),
          "success",
        );
      }
    });
  }

  await renderRecentList();

  // ── URL ile yükleme (YouTube / Spotify, ayrı kutular) ─────
  function setUrlLoadBtnState(btn, loading) {
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? t("alarm.urlLoading") : t("alarm.urlLoad");
  }

  async function handleUrlLoad({ expectedType, input, loadBtn }) {
    const rawUrl = input.value.trim();
    if (!rawUrl) {
      showFeedback(t("alarm.feedback.enterUrl"), "error");
      input.focus();
      return;
    }

    const detectedType = AlarmProviderFactory.detect(rawUrl);
    if (detectedType === "local") {
      showFeedback(t("alarm.feedback.invalidUrl"), "error");
      return;
    }
    if (detectedType !== expectedType) {
      const providerLabel = detectedType === "youtube" ? "YouTube" : "Spotify";
      showFeedback(
        format(t("alarm.feedback.wrongServiceLink"), { provider: providerLabel }),
        "error",
      );
      return;
    }

    setUrlLoadBtnState(loadBtn, true);

    try {
      const result = await alarmManager.load(rawUrl);
      const providerLabel = expectedType === "youtube" ? "YouTube" : "Spotify";

      if (result.usedFallback) {
        showFeedback(
          format(t("alarm.feedback.providerFallback"), { provider: providerLabel }),
          "error",
        );
        updateCurrentIcon("local");
        updateCurrentFile(t("alarm.fallbackFile"));
      } else {
        showFeedback(
          format(t("alarm.feedback.providerLoaded"), { provider: providerLabel }),
          "success",
        );
        updateCurrentIcon(expectedType);

        const displayLabel =
          rawUrl.length > 40 ? rawUrl.slice(0, 37) + "…" : rawUrl;
        usingDefaultAlarm = false;
        updateCurrentFile(displayLabel);
        localStorage.setItem("selectedAlarmPath", rawUrl);
      }

      resetPreviewBtn();
      input.value = "";
    } catch (err) {
      log.error("URL load error:", err);
      showFeedback(
        format(t("alarm.feedback.loadFailed"), { message: err.message ?? "Unknown error" }),
        "error",
      );
    } finally {
      setUrlLoadBtnState(loadBtn, false);
    }
  }

  youtubeUrlLoadBtn.addEventListener("click", () =>
    handleUrlLoad({ expectedType: "youtube", input: youtubeUrlInput, loadBtn: youtubeUrlLoadBtn }),
  );
  spotifyUrlLoadBtn.addEventListener("click", () =>
    handleUrlLoad({ expectedType: "spotify", input: spotifyUrlInput, loadBtn: spotifyUrlLoadBtn }),
  );

  // ── Preview ───────────────────────────────────────────────
  if (previewAlarmBtn) {
    previewAlarmBtn.addEventListener("click", async () => {
      if (isPreviewing) {
        await alarmManager.stop();
        resetPreviewBtn();
        return;
      }

      if (!alarmManager.isReady()) {
        showFeedback(t("alarm.feedback.noAlarmLoaded"), "error");
        return;
      }

      try {
        await alarmManager.play(0);
        isPreviewing = true;
        previewAlarmBtn.textContent = t("alarm.stopPreview");
        previewAlarmBtn.setAttribute("aria-label", t("alarm.stopPreviewAriaLabel"));
      } catch (err) {
        log.warn("Preview failed:", err);
        showFeedback(t("alarm.feedback.playFailed"), "error");
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
      spotifyStatusLabel.textContent = connected
        ? t("alarm.spotifyConnected")
        : t("alarm.spotifyNotConnected");
    }
    if (spotifyConnectBtn) spotifyConnectBtn.classList.toggle("hidden", connected);
    if (spotifyLogoutBtn) spotifyLogoutBtn.classList.toggle("hidden", !connected);
    if (spotifyUrlRow) spotifyUrlRow.classList.toggle("hidden", !connected);
  }

  if (spotifyConnectBtn) {
    spotifyConnectBtn.addEventListener("click", async () => {
      spotifyConnectBtn.disabled = true;
      spotifyConnectBtn.textContent = t("alarm.spotifyConnecting");
      try {
        const tokens = await window.electronAPI.spotifyLogin();
        await alarmManager._saveSpotifyTokens(tokens);
        await updateSpotifyAuthUI();
        showFeedback(t("alarm.feedback.spotifyConnected"), "success");
      } catch (err) {
        log.error("Spotify login error:", err);
        showFeedback(
          format(t("alarm.feedback.spotifyConnectFailed"), { message: err.message ?? "Unknown error" }),
          "error",
        );
      } finally {
        spotifyConnectBtn.disabled = false;
        spotifyConnectBtn.textContent = t("alarm.spotifyConnect");
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
          usingDefaultAlarm = true;
          updateCurrentFile(t("alarm.defaultFile"));
        } catch (e) {
          log.error("Failed to revert to default alarm after Spotify disconnect:", e);
        }
      }

      showFeedback(t("alarm.feedback.spotifyDisconnected"), "success");
      updateCurrentIcon("local");
      await updateSpotifyAuthUI();
    });
  }

  await updateSpotifyAuthUI();

  onLanguageChange(() => {
    if (!isPreviewing) resetPreviewBtn();
    updateSpotifyAuthUI();
    if (usingDefaultAlarm) updateCurrentFile(t("alarm.defaultFile"));
    renderRecentList();
  });
});
