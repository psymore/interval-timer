// Only ever loaded when js/demo/loader.js finds neither a real
// preload.cjs (Electron) nor ?demo=1 (the GitHub Pages demo) — i.e. only
// in the deployed PWA (docs/pwa/). Classic (non-module) script, same as
// js/demo/electron-demo-shim.js and for the same reason: it must run and
// set window.electronAPI before any type="module" script (renderer.js,
// alarmModal.js) touches it, and module scripts are always deferred until
// after parsing — a classic script inserted via document.write during
// parsing is what guarantees that ordering.
//
// Real (persistent) implementation of the window.electronAPI contract:
// presets/language persist to localStorage. Local alarm file uploads are
// handled separately by js/alarm/localSourceAdapter.js, which checks the
// __platform marker set below and dynamically loads
// platform/localBlobStrategy.js — this file doesn't need to know about
// that. Native-window chrome (mini/tray/quit/updates) and Spotify stay as
// no-ops/rejections, matching electron-demo-shim.js's shapes.
(function () {
  const STORAGE_KEY = "interval-timer-pwa-state";
  const MAX_PRESETS = 20;

  const DEFAULT_STATE = {
    presets: [
      {
        id: "default-pomodoro",
        name: "Pomodoro",
        workMinutes: 25,
        workSeconds: 0,
        breakMinutes: 5,
        breakSeconds: 0,
        loops: 4,
        isDefault: true,
      },
      {
        id: "default-short",
        name: "Short Focus",
        workMinutes: 15,
        workSeconds: 0,
        breakMinutes: 3,
        breakSeconds: 0,
        loops: 6,
        isDefault: false,
      },
      {
        id: "default-long",
        name: "Deep Work",
        workMinutes: 50,
        workSeconds: 0,
        breakMinutes: 10,
        breakSeconds: 0,
        loops: 2,
        isDefault: false,
      },
    ],
    activePresetId: "default-pomodoro",
    language: "en",
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULT_STATE));
      const parsed = JSON.parse(raw);
      return {
        presets: Array.isArray(parsed.presets) ? parsed.presets : DEFAULT_STATE.presets,
        activePresetId: parsed.activePresetId ?? DEFAULT_STATE.activePresetId,
        language: parsed.language ?? DEFAULT_STATE.language,
      };
    } catch {
      return JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
  }

  let state = loadState();

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  const SPOTIFY_UNAVAILABLE_ERROR =
    "Spotify isn't available in the web app yet — use the desktop app, or a local/YouTube alarm here.";

  window.electronAPI = {
    __platform: "pwa",

    presetsGetAll: async () => state.presets.map(p => ({ ...p })),
    presetsGetActive: async () =>
      state.presets.find(p => p.id === state.activePresetId) ?? state.presets[0] ?? null,
    presetsSave: async preset => {
      const index = state.presets.findIndex(p => p.id === preset.id);
      if (index >= 0) {
        state.presets[index] = preset;
      } else {
        if (state.presets.length >= MAX_PRESETS) {
          return { error: `Maximum ${MAX_PRESETS} presets allowed.` };
        }
        state.presets.push(preset);
      }
      saveState();
      return { presets: state.presets.map(p => ({ ...p })) };
    },
    presetsDelete: async id => {
      state.presets = state.presets.filter(p => p.id !== id);
      if (state.activePresetId === id) {
        state.activePresetId = state.presets[0]?.id ?? null;
      }
      saveState();
      return { presets: state.presets.map(p => ({ ...p })) };
    },
    presetsSetActive: async id => {
      state.activePresetId = id;
      saveState();
      return { id };
    },

    sendTimerState: () => {},

    isWindowsStoreBuild: false,
    onUpdateAvailable: () => {},
    updatesCheck: async () => ({
      currentVersion: "0.0.0-pwa",
      latestVersion: "0.0.0-pwa",
      updateAvailable: false,
      releaseUrl: "",
    }),
    updatesDismiss: () => {},
    updatesOpenReleases: () => {},

    languageGet: async () => state.language,
    languageSet: async lang => {
      state.language = lang;
      saveState();
    },
    onLanguageChanged: () => {},

    setAlwaysOnTop: () => {},
    quitApp: () => {},
    onMiniAction: () => {},
    onMiniReady: () => {},
    onMiniClosed: () => {},

    // Real support lives in js/alarm/localSourceAdapter.js's PWA strategy
    // (platform/localBlobStrategy.js) — these stay as safe fallbacks in
    // case anything reaches them directly instead of through the adapter,
    // same defense-in-depth precedent as the demo shim.
    alarmCheckPathsExist: async paths => paths.map(() => false),
    alarmUseLocalPath: async () => ({ error: "Not available in the web app." }),
    getFilePath: async () => null,
    getPathForFile: () => null,

    spotifyGetTokens: async () => null,
    spotifyLogin: async () => {
      throw new Error(SPOTIFY_UNAVAILABLE_ERROR);
    },
    spotifyRefresh: async () => {
      throw new Error(SPOTIFY_UNAVAILABLE_ERROR);
    },
    spotifySaveTokens: async () => {},
    spotifyClearTokens: async () => {},
    spotifyOpenTrack: async () => {},
  };
})();
