import path from "path";
import { fileURLToPath } from "url";
import { app, BrowserWindow, powerSaveBlocker, session } from "electron";
import Store from "electron-store";

import { createLogger } from "./lib/logger.js";
import {
  initLocalServer,
  registerLocalServerIpc,
  stopLocalServer,
} from "./lib/localServer.js";
import {
  initWindows,
  registerWindowIpc,
  createWindow,
  createTray,
  markQuitting,
  isAppQuitting,
} from "./lib/windows.js";
import { registerPresetsIpc } from "./lib/presetsIpc.js";
import { registerSettingsIpc } from "./lib/settingsIpc.js";
import { initSpotifyAuth, registerSpotifyIpc } from "./lib/spotifyAuth.js";
import { initUpdateChecker, registerUpdateIpc } from "./lib/updateChecker.js";

const log = createLogger("main");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Store ─────────────────────────────────────────────────────
const store = new Store({
  name: "timer-config",
  defaults: {
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
    dismissedUpdateVersion: null,
  },
});

let blockerId = null;

// ── Throttling prevention ─────────────────────────────────────
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");

// ── Wire up modules ─────────────────────────────────────────────
initLocalServer({ appRoot: __dirname, store });
initWindows({ appRoot: __dirname });
initSpotifyAuth({
  appRoot: __dirname,
  store,
  appIconPath: path.join(__dirname, "build", "icon.ico"),
});

registerLocalServerIpc();
registerWindowIpc();
registerPresetsIpc(store);
registerSettingsIpc(store);
registerSpotifyIpc();
// Store builds auto-update through Windows Update — a self-hosted "check for
// updates" pointing at GitHub Releases would conflict with Store policy and
// wouldn't match the Store's own version track anyway.
if (!process.windowsStore) {
  registerUpdateIpc(store);
}

// ── App lifecycle ─────────────────────────────────────────────
app
  .whenReady()
  .then(async () => {
    // Deny every permission request by default — this app doesn't need
    // camera/mic/geolocation/notifications, and the embedded YouTube
    // iframe/Spotify origins shouldn't get anything beyond that implicitly.
    session.defaultSession.setPermissionRequestHandler(
      (_webContents, _permission, callback) => callback(false),
    );

    await createWindow(); // ← await eklendi
    if (!process.windowsStore) {
      initUpdateChecker({ store });
    }
    createTray();
    blockerId = powerSaveBlocker.start("prevent-app-suspension");
    app.on("activate", async () => {
      try {
        if (BrowserWindow.getAllWindows().length === 0) await createWindow();
      } catch (err) {
        log.error("Activate error:", err);
      }
    });
  })
  .catch(err => log.error("App init error:", err));

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && isAppQuitting()) {
    if (blockerId !== null) {
      powerSaveBlocker.stop(blockerId);
      blockerId = null;
    }
    app.quit();
  }
});

app.on("before-quit", () => {
  markQuitting();
  stopLocalServer();
});

process.on("uncaughtException", error => {
  log.error("Uncaught exception:", error);
});

process.on("unhandledRejection", reason => {
  log.error("Unhandled rejection:", reason);
});
