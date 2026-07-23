import { alarmManager } from "./alarm/AlarmManager.js";
import { AlarmProviderFactory } from "./alarm/AlarmProviderFactory.js";
import {
  addRecentPath,
  loadRecentPaths,
  removeRecentPath,
  saveRecentPaths,
} from "./alarm/recentAlarms.js";
import { addLink, removeLink } from "./alarm/presetAlarmLinks.js";
import { checkYoutubeLink, checkSpotifyLinks } from "./alarm/linkHealth.js";
import { escapeHtml } from "./presets.js";
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

const DEFAULT_ALARM = "assets/audio/alarm.mp3";
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
  const youtubeLinksList = document.getElementById("youtubeLinksList");
  const spotifyLinksList = document.getElementById("spotifyLinksList");

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

        toggles.forEach(other => {
          other.setAttribute("aria-expanded", "false");
          const body = document.getElementById(
            other.getAttribute("aria-controls"),
          );
          if (body) body.classList.add("hidden");
        });

        toggle.setAttribute("aria-expanded", "true");
        const body = document.getElementById(
          toggle.getAttribute("aria-controls"),
        );
        if (body) body.classList.remove("hidden");

        const section = toggle.closest(".alarm-section")?.dataset.section;
        if (section === "youtube" || section === "spotify") {
          renderLinkList(section, { checkHealth: true });
        }
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

  // ── Preset-aware alarm loading ─────────────────────────────
  // Tracks whether the current-file label is showing the translated
  // default (vs. a custom filename/URL) — used by the onLanguageChange
  // handler below to re-render only the default label, not a real
  // custom source name (see design spec's documented scope boundary
  // on why custom-source labels don't re-sync on toggle).
  let usingDefaultAlarm = false;

  async function getActivePreset() {
    return window.electronAPI.presetsGetActive();
  }

  async function saveActivePreset(patch) {
    const active = await getActivePreset();
    if (!active) return null;
    const updated = { ...active, ...patch };
    const result = await window.electronAPI.presetsSave(updated);
    return result?.error ? active : updated;
  }

  // One-time best-effort import of the legacy global alarm source (pre
  // per-preset storage) into the active preset — see design spec's
  // "One-time migration" section. Safe to call every launch: it's a no-op
  // once the active preset already has an alarmSource.
  async function migrateLegacyAlarmSource() {
    try {
      const legacy = localStorage.getItem("selectedAlarmPath");
      if (!legacy) return;

      const active = await getActivePreset();
      if (!active || active.alarmSource) return;

      const type = AlarmProviderFactory.detect(legacy);
      const patch = { alarmSource: { type, value: legacy } };

      if (type === "youtube" || type === "spotify") {
        const existing = active.alarmLinks?.[type] ?? [];
        patch.alarmLinks = {
          youtube: active.alarmLinks?.youtube ?? [],
          spotify: active.alarmLinks?.spotify ?? [],
          [type]: addLink(existing, legacy),
        };
      }

      await window.electronAPI.presetsSave({ ...active, ...patch });
    } catch (e) {
      log.warn("migrateLegacyAlarmSource: skipped due to error:", e.message);
    }
  }

  // Loads the given preset's alarmSource (or the local default if it has
  // none) and updates the current-file label/icon to match. Called once at
  // startup and again every time the active preset changes (see the
  // preset-activated listener below).
  async function loadPresetAlarm(preset) {
    const alarmSource = preset?.alarmSource ?? null;
    await alarmManager.initialize(DEFAULT_ALARM, alarmSource?.value ?? null);

    if (alarmSource?.value) {
      usingDefaultAlarm = false;
      if (alarmSource.type === "local") {
        updateCurrentFile(getFileName(alarmSource.value));
        updateCurrentIcon("local");
      } else {
        const label =
          alarmSource.value.length > 40
            ? alarmSource.value.slice(0, 37) + "…"
            : alarmSource.value;
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
  }

  // Checks the given alarmSource's health (if it's a remote link) and
  // dispatches the result for js/presets.js to badge the preset picker
  // with. Never awaited by callers — this is a background enhancement,
  // not something that should delay the alarm loading/UI it accompanies.
  // A null/local alarmSource clears the badge immediately (no network
  // call needed).
  async function updateAlarmHealthBadge(alarmSource) {
    const active = await getActivePreset();
    if (!active) return;
    const presetId = active.id;

    if (!alarmSource?.type || alarmSource.type === "local") {
      window.dispatchEvent(
        new CustomEvent("preset-alarm-health", {
          detail: { presetId, broken: false },
        }),
      );
      return;
    }

    let status = "unknown";
    if (alarmSource.type === "youtube") {
      status = await checkYoutubeLink(alarmSource.value);
    } else if (alarmSource.type === "spotify") {
      const results = await checkSpotifyLinks([alarmSource.value]);
      status = results.get(alarmSource.value) ?? "unknown";
    }

    window.dispatchEvent(
      new CustomEvent("preset-alarm-health", {
        detail: { presetId, broken: status === "broken" },
      }),
    );
  }

  await migrateLegacyAlarmSource();
  {
    const active = await getActivePreset();
    await loadPresetAlarm(active);
    updateAlarmHealthBadge(active?.alarmSource ?? null);
  }
  await updateSpotifyAuthUI();

  window.addEventListener("preset-activated", async () => {
    const active = await getActivePreset();
    await loadPresetAlarm(active);
    updateAlarmHealthBadge(active?.alarmSource ?? null);
    await renderLinkList("youtube");
    await renderLinkList("spotify");
  });

  // ── Kaydedilen bağlantılar (YouTube / Spotify) ────────────
  function linkListEl(type) {
    return type === "youtube" ? youtubeLinksList : spotifyLinksList;
  }

  async function renderLinkList(type, { checkHealth = false } = {}) {
    const listEl = linkListEl(type);
    if (!listEl) return;

    const active = await getActivePreset();
    const links = active?.alarmLinks?.[type] ?? [];
    const currentValue = active?.alarmSource?.value ?? null;

    if (links.length === 0) {
      listEl.innerHTML = "";
      return;
    }

    listEl.innerHTML = links
      .map(url => {
        const isActive = url === currentValue;
        const label = url.length > 40 ? url.slice(0, 37) + "…" : url;
        return `<li class="alarm-recent-item${isActive ? " active" : ""}" data-url="${encodeURIComponent(url)}">
          <span class="alarm-recent-name">${escapeHtml(label)}</span>
          ${isActive ? `<span class="alarm-recent-tag">${t("alarm.recentActive")}</span>` : ""}
          <button type="button" class="alarm-recent-remove no-hover-lift" aria-label="${t("alarm.savedLinkRemoveAriaLabel")}">&times;</button>
        </li>`;
      })
      .join("");

    listEl.querySelectorAll(".alarm-recent-item").forEach(item => {
      item.addEventListener("click", async e => {
        if (e.target.closest(".alarm-recent-remove")) return;
        await activateAlarmLink(type, decodeURIComponent(item.dataset.url));
      });
    });

    listEl.querySelectorAll(".alarm-recent-remove").forEach(btn => {
      btn.addEventListener("click", async e => {
        e.stopPropagation();
        const li = btn.closest(".alarm-recent-item");
        await removeAlarmLink(type, decodeURIComponent(li.dataset.url));
      });
    });

    if (checkHealth) {
      checkListHealth(type, links).then(brokenUrls => {
        listEl.querySelectorAll(".alarm-recent-item").forEach(li => {
          const url = decodeURIComponent(li.dataset.url);
          if (brokenUrls.has(url) && !li.querySelector(".alarm-recent-tag.missing")) {
            li.insertAdjacentHTML(
              "beforeend",
              `<span class="alarm-recent-tag missing">${t("alarm.linkBroken")}</span>`,
            );
          }
        });
      });
    }
  }

  // Returns a Set of URLs (from `links`) confirmed broken. Never includes
  // a URL whose check came back "unknown" — see linkHealth.js's contract.
  async function checkListHealth(type, links) {
    const broken = new Set();

    if (type === "youtube") {
      const results = await Promise.all(
        links.map(async url => [url, await checkYoutubeLink(url)]),
      );
      results.forEach(([url, status]) => {
        if (status === "broken") broken.add(url);
      });
    } else if (type === "spotify") {
      const results = await checkSpotifyLinks(links);
      results.forEach((status, url) => {
        if (status === "broken") broken.add(url);
      });
    }

    return broken;
  }

  async function saveAlarmLink(type, url) {
    const active = await getActivePreset();
    if (!active) return;
    const existing = active.alarmLinks?.[type] ?? [];
    const alarmLinks = {
      youtube: active.alarmLinks?.youtube ?? [],
      spotify: active.alarmLinks?.spotify ?? [],
      [type]: addLink(existing, url),
    };
    await window.electronAPI.presetsSave({
      ...active,
      alarmLinks,
      alarmSource: { type, value: url },
    });
    await renderLinkList(type);
  }

  async function removeAlarmLink(type, url) {
    const active = await getActivePreset();
    if (!active) return;
    const existing = active.alarmLinks?.[type] ?? [];
    const alarmLinks = {
      youtube: active.alarmLinks?.youtube ?? [],
      spotify: active.alarmLinks?.spotify ?? [],
      [type]: removeLink(existing, url),
    };
    await window.electronAPI.presetsSave({ ...active, alarmLinks });
    await renderLinkList(type);
  }

  async function activateAlarmLink(type, url) {
    const input = type === "youtube" ? youtubeUrlInput : spotifyUrlInput;
    const loadBtn = type === "youtube" ? youtubeUrlLoadBtn : spotifyUrlLoadBtn;
    input.value = url;
    await handleUrlLoad({ expectedType: type, input, loadBtn });
  }

  await renderLinkList("youtube");
  await renderLinkList("spotify");

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
    await saveActivePreset({ alarmSource: { type: "local", value: filePath } });
    updateAlarmHealthBadge({ type: "local", value: filePath });

    recentPaths = addRecentPath(recentPaths, filePath);
    saveRecentPaths(recentPaths);

    usingDefaultAlarm = false;
    updateCurrentFile(getFileName(filePath));
    updateCurrentIcon("local");
    resetPreviewBtn();
    await renderRecentList();
    await renderLinkList("youtube");
    await renderLinkList("spotify");
    return true;
  }

  async function renderRecentList() {
    if (!alarmRecentList) return;

    if (recentPaths.length === 0) {
      alarmRecentList.innerHTML = "";
      return;
    }

    const existsResults =
      await window.electronAPI.alarmCheckPathsExist(recentPaths);
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
          <span class="alarm-recent-name">${escapeHtml(getFileName(p))}</span>
          ${tag}
          <button type="button" class="alarm-recent-remove no-hover-lift" aria-label="${t("alarm.recentRemoveAriaLabel")}">&times;</button>
        </li>`;
      })
      .join("");

    alarmRecentList
      .querySelectorAll(".alarm-recent-item:not(.missing)")
      .forEach(item => {
        item.addEventListener("click", async () => {
          try {
            await applyLocalFile(decodeURIComponent(item.dataset.path));
          } catch (err) {
            log.error("Recent file reselect error:", err);
            showFeedback(t("alarm.feedback.fileLoadError"), "error");
          }
        });
      });

    // Attached to every entry (missing ones too, per .missing's CSS override
    // re-enabling pointer-events on this button) — removing a stale entry
    // from the list doesn't require it to still be selectable.
    alarmRecentList.querySelectorAll(".alarm-recent-remove").forEach(btn => {
      btn.addEventListener("click", async e => {
        e.stopPropagation();
        const li = btn.closest(".alarm-recent-item");
        recentPaths = removeRecentPath(
          recentPaths,
          decodeURIComponent(li.dataset.path),
        );
        saveRecentPaths(recentPaths);
        await renderRecentList();
      });
    });
  }

  async function resetToDefault() {
    await alarmManager.load(DEFAULT_ALARM);
    alarmManager.setFallbackSource(DEFAULT_ALARM);
    localStorage.removeItem("selectedAlarmPath");
    await saveActivePreset({ alarmSource: null });
    updateAlarmHealthBadge(null);
    usingDefaultAlarm = true;
    updateCurrentFile(t("alarm.defaultFile"));
    updateCurrentIcon("local");
    resetPreviewBtn();
    await renderRecentList();
    await renderLinkList("youtube");
    await renderLinkList("spotify");
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
          format(t("alarm.feedback.fileLoaded"), {
            name: getFileName(filePath),
          }),
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

      // webkitGetAsEntry().isDirectory is a real filesystem-entry check, not
      // a name guess — catches a dropped folder even if it's named to look
      // like an audio file (e.g. a folder literally named "trap.mp3"),
      // which an extension check alone would miss. The main-process
      // alarm:use-local-path handler enforces this too (defense in depth),
      // but checking here avoids an IPC round trip for the common case.
      const entry = e.dataTransfer.items?.[0]?.webkitGetAsEntry?.();
      if (entry?.isDirectory) {
        showFeedback(t("alarm.feedback.folderNotSupported"), "error");
        return;
      }

      const file = e.dataTransfer.files[0];
      if (!file) return;

      try {
        const filePath = window.electronAPI.getPathForFile(file);
        const ext = "." + (filePath.split(".").pop() || "").toLowerCase();
        if (!SUPPORTED_LOCAL_EXTENSIONS.includes(ext)) {
          showFeedback(t("alarm.feedback.unsupportedFile"), "error");
          return;
        }

        const applied = await applyLocalFile(filePath);
        if (applied) {
          showFeedback(
            format(t("alarm.feedback.fileLoaded"), {
              name: getFileName(filePath),
            }),
            "success",
          );
        }
      } catch (err) {
        log.error("File drop error:", err);
        showFeedback(t("alarm.feedback.fileLoadError"), "error");
      }
    });
  }

  await renderRecentList();

  // Re-check "Recent" entries' existence every time the modal is reopened —
  // js/renderer.js owns the open/close toggle itself, so this listens on
  // the same trigger button rather than duplicating that logic here. Without
  // this, a file deleted mid-session would keep showing as valid until the
  // next applyLocalFile/resetToDefault/language-change call happened to
  // re-render the list.
  const alarmFolderBtn = document.getElementById("alarmFolderBtn");
  if (alarmFolderBtn) {
    alarmFolderBtn.addEventListener("click", renderRecentList);
  }

  // ── URL ile yükleme (YouTube / Spotify, ayrı kutular) ─────
  function setUrlLoadBtnState(btn, loading) {
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? t("alarm.urlLoading") : t("alarm.urlLoad");
  }

  // Provider brand names below ("YouTube"/"Spotify") — not translated (see design spec).
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
        format(t("alarm.feedback.wrongServiceLink"), {
          provider: providerLabel,
        }),
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
          format(t("alarm.feedback.providerFallback"), {
            provider: providerLabel,
          }),
          "error",
        );
        updateCurrentIcon("local");
        updateCurrentFile(t("alarm.fallbackFile"));
      } else {
        showFeedback(
          format(t("alarm.feedback.providerLoaded"), {
            provider: providerLabel,
          }),
          "success",
        );
        updateCurrentIcon(expectedType);

        const displayLabel =
          rawUrl.length > 40 ? rawUrl.slice(0, 37) + "…" : rawUrl;
        usingDefaultAlarm = false;
        updateCurrentFile(displayLabel);
        await saveAlarmLink(expectedType, rawUrl);
        updateAlarmHealthBadge({ type: expectedType, value: rawUrl });
      }

      resetPreviewBtn();
      input.value = "";
    } catch (err) {
      log.error("URL load error:", err);
      showFeedback(
        format(t("alarm.feedback.loadFailed"), {
          message: err.message ?? "Unknown error",
        }),
        "error",
      );
    } finally {
      setUrlLoadBtnState(loadBtn, false);
    }
  }

  youtubeUrlLoadBtn.addEventListener("click", () =>
    handleUrlLoad({
      expectedType: "youtube",
      input: youtubeUrlInput,
      loadBtn: youtubeUrlLoadBtn,
    }),
  );
  spotifyUrlLoadBtn.addEventListener("click", () =>
    handleUrlLoad({
      expectedType: "spotify",
      input: spotifyUrlInput,
      loadBtn: spotifyUrlLoadBtn,
    }),
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
        previewAlarmBtn.setAttribute(
          "aria-label",
          t("alarm.stopPreviewAriaLabel"),
        );
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
    if (spotifyConnectBtn)
      spotifyConnectBtn.classList.toggle("hidden", connected);
    if (spotifyLogoutBtn)
      spotifyLogoutBtn.classList.toggle("hidden", !connected);
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
          format(t("alarm.feedback.spotifyConnectFailed"), {
            message: err.message ?? "Unknown error",
          }),
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
          await saveActivePreset({ alarmSource: null });
          updateAlarmHealthBadge(null);
          usingDefaultAlarm = true;
          updateCurrentFile(t("alarm.defaultFile"));
        } catch (e) {
          log.error(
            "Failed to revert to default alarm after Spotify disconnect:",
            e,
          );
        }
      }

      showFeedback(t("alarm.feedback.spotifyDisconnected"), "success");
      updateCurrentIcon("local");
      await updateSpotifyAuthUI();
      await renderLinkList("youtube");
      await renderLinkList("spotify");
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
