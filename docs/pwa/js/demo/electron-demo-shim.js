// Only ever loaded when index.html is opened with ?demo=1 (see the
// conditional loader snippet near the bottom of index.html) — never
// reachable from the packaged Electron app, which has a real preload.cjs
// and never sets that query param. Fakes window.electronAPI in-memory so
// the unmodified app code can run in a plain browser tab / iframe.
(function () {
  const DEFAULT_PRESETS = [
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
  ];

  const MAX_PRESETS = 20;
  let presets = DEFAULT_PRESETS.map(p => ({ ...p }));
  let activePresetId = "default-pomodoro";

  const SPOTIFY_LOGIN_ERROR =
    "Spotify login isn't available in this preview — try it in the desktop app.";

  window.electronAPI = {
    // ── Presets — in-memory, same contract as lib/presetsIpc.js ──
    presetsGetAll: async () => presets.map(p => ({ ...p })),
    presetsGetActive: async () =>
      presets.find(p => p.id === activePresetId) ?? presets[0] ?? null,
    presetsSave: async preset => {
      const index = presets.findIndex(p => p.id === preset.id);
      if (index >= 0) {
        presets[index] = preset;
      } else {
        if (presets.length >= MAX_PRESETS) {
          return { error: `Maximum ${MAX_PRESETS} presets allowed.` };
        }
        presets.push(preset);
      }
      return { presets: presets.map(p => ({ ...p })) };
    },
    presetsDelete: async id => {
      presets = presets.filter(p => p.id !== id);
      if (activePresetId === id) activePresetId = presets[0]?.id ?? null;
      return { presets: presets.map(p => ({ ...p })) };
    },
    presetsSetActive: async id => {
      activePresetId = id;
      return { id };
    },

    // ── Timer state broadcast — fires every 200ms tick, must be silent ──
    sendTimerState: () => {},

    // ── Updates — property, not a function (see js/updates.js:53) ──
    isWindowsStoreBuild: false,

    // ── Updates — js/updates.js:setupUpdateChecker() runs unconditionally
    // from renderer.js at module-init time (isWindowsStoreBuild is false
    // above), so these must exist even though nothing in the audited brief
    // exercised them; "no update available" keeps the Settings modal's
    // update-check UI functional without erroring. Shape matches the real
    // updates:check IPC handler (lib/updateChecker.js). ──
    onUpdateAvailable: () => {},
    updatesCheck: async () => ({
      currentVersion: "0.0.0-demo",
      latestVersion: "0.0.0-demo",
      updateAvailable: false,
      releaseUrl: "",
    }),
    updatesDismiss: () => {},
    updatesOpenReleases: () => {},

    // ── Language — switching still works client-side, just doesn't persist ──
    languageGet: async () => "en",
    languageSet: async () => {},
    onLanguageChanged: () => {},

    // ── Native-window-only chrome — no-ops in a browser tab ──
    setAlwaysOnTop: () => {},
    quitApp: () => {},
    onMiniAction: () => {},
    onMiniReady: () => {},
    onMiniClosed: () => {},

    // ── Local alarm files — browsing UI is hidden in demo mode (Task 6),
    // these stay as safe fallbacks in case anything still reaches them ──
    alarmCheckPathsExist: async paths => paths.map(() => false),
    alarmUseLocalPath: async () => ({
      error: "Not available in this preview.",
    }),
    getFilePath: async () => null,
    getPathForFile: () => null,

    // ── Spotify — logged-out shape. AlarmManager already falls back to
    // the local alarm and shows its existing "Spotify unavailable" message
    // when there's no session, so no further demo-specific handling is
    // needed (see spec Phase 3). ──
    spotifyGetTokens: async () => null,
    spotifyLogin: async () => {
      throw new Error(SPOTIFY_LOGIN_ERROR);
    },
    spotifyRefresh: async () => {
      throw new Error(SPOTIFY_LOGIN_ERROR);
    },
    spotifySaveTokens: async () => {},
    spotifyClearTokens: async () => {},
    spotifyOpenTrack: async () => {},
  };
})();
