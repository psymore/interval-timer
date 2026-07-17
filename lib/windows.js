import path from "path";
import fs from "fs";
import {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  screen,
} from "electron";

import { createLogger } from "./logger.js";
import { startLocalServer, getServerPort } from "./localServer.js";

const log = createLogger("windows");

// Set via initWindows() — the app root directory, used to resolve
// preload/index/mini/icon paths the same way __dirname did before the
// split.
let appRoot = null;

export function initWindows({ appRoot: root }) {
  appRoot = root;
}

// Framed/taskbar-visible windows only — frameless windows (mini) have no
// titlebar to show it in, and skip the taskbar entirely.
function getAppIconPath() {
  return path.join(appRoot, "build", "icon.ico");
}

let mainWindow = null;
let miniWindow = null;
let tray = null;
let isQuitting = false;
let miniTopmostInterval = null;

export function getMainWindow() {
  return mainWindow;
}

export function getMiniWindow() {
  return miniWindow;
}

export function isAppQuitting() {
  return isQuitting;
}

// Called from app.on("before-quit") in main.js — that handler fires for
// every quit path (tray Quit, app:quit IPC, OS shutdown, Cmd+Q), not just
// the ones that go through quitApp() below.
export function markQuitting() {
  isQuitting = true;
}

// ── Main window ───────────────────────────────────────────────
export async function createWindow() {
  const preloadPath = path.join(appRoot, "preload.cjs");
  const indexPath = path.join(appRoot, "index.html");

  if (!fs.existsSync(preloadPath)) {
    log.error(`Preload not found: ${preloadPath}`);
    return;
  }
  if (!fs.existsSync(indexPath)) {
    log.error(`index.html not found: ${indexPath}`);
    return;
  }

  // Local server'ı başlat (henüz başlamadıysa)
  await startLocalServer();

  mainWindow = new BrowserWindow({
    width: 800,
    height: 1100,
    icon: getAppIconPath(),
    webPreferences: {
      contextIsolation: true,
      enableRemoteModule: false,
      sandbox: true,
      preload: preloadPath,
      backgroundThrottling: false,
      autoplayPolicy: "no-user-gesture-required",
    },
  });

  const serverPort = getServerPort();
  const homeUrl = `http://127.0.0.1:${serverPort}/index.html`;
  const homeOrigin = `http://127.0.0.1:${serverPort}/`;

  // Keep the window on its own local-server origin — if a bug ever let the
  // renderer navigate away, it would otherwise carry the real preload's
  // window.electronAPI (quitApp, presets, Spotify login) to wherever it went.
  mainWindow.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(homeOrigin)) e.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription) => {
      log.error(
        `Main window failed to load: ${errorDescription} (${errorCode})`,
      );
    },
  );
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    log.error("Main window renderer process gone:", details.reason);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.reload();
    }
  });
  mainWindow.webContents.on("unresponsive", () => {
    log.warn("Main window renderer became unresponsive.");
  });

  // file:// yerine http:// kullan
  mainWindow.loadURL(homeUrl).catch(err => {
    log.error("Main window initial load failed:", err);
  });

  mainWindow.on("close", e => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ── Mini window ───────────────────────────────────────────────
export function createMiniWindow() {
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.show();
    miniWindow.focus();
    return;
  }

  const preloadPath = path.join(appRoot, "preload.cjs");
  const miniPath = path.join(appRoot, "mini.html");
  const { width: sw } = screen.getPrimaryDisplay().workAreaSize;

  miniWindow = new BrowserWindow({
    width: 280,
    height: 194,
    x: sw - 300,
    y: 20,
    minWidth: 240,
    minHeight: 174,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      enableRemoteModule: false,
      sandbox: true,
      preload: preloadPath,
      backgroundThrottling: false,
    },
  });

  miniWindow.webContents.on("will-navigate", e => e.preventDefault());
  miniWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  miniWindow.webContents.on("render-process-gone", (_event, details) => {
    log.error("Mini window renderer process gone:", details.reason);
  });

  // Plain `alwaysOnTop: true` puts the window at Windows' default topmost
  // z-band, which other apps' own topmost windows can still cover — and
  // which Windows' fullscreen-optimization behavior hides outright when
  // another app goes fullscreen. "screen-saver" is the highest z-band
  // Electron exposes and is what reliably stays above fullscreen apps.
  miniWindow.setAlwaysOnTop(true, "screen-saver");

  // Belt-and-suspenders: some apps re-assert their own topmost status
  // (fullscreen video, games, presentation mode) which can still bump the
  // mini window down in the topmost stack even at "screen-saver" level.
  // Periodically re-assert ours so it recovers within a couple seconds
  // instead of staying hidden until manually refocused.
  miniTopmostInterval = setInterval(() => {
    if (miniWindow && !miniWindow.isDestroyed()) {
      miniWindow.setAlwaysOnTop(true, "screen-saver");
    }
  }, 2000);

  miniWindow.on("show", () => {
    miniWindow.setAlwaysOnTop(true, "screen-saver");
  });

  miniWindow.loadFile(miniPath);

  miniWindow.webContents.on("did-finish-load", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("mini-ready");
    }
  });

  miniWindow.on("closed", () => {
    miniWindow = null;
    if (miniTopmostInterval) {
      clearInterval(miniTopmostInterval);
      miniTopmostInterval = null;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("mini-closed");
    }
  });
}

export function closeMiniWindow() {
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.destroy();
}

// ── Quit ──────────────────────────────────────────────────────
export function quitApp() {
  isQuitting = true;
  app.quit();
}

// ── Tray ──────────────────────────────────────────────────────
export function createTray() {
  const iconPath = path.join(appRoot, "assets", "icons", "stopwatch-main.png");
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();

  tray = new Tray(icon);
  tray.setToolTip("Timer App");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Open",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: quitApp,
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("click", () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.focus() : mainWindow.show();
    }
  });
}

// ── Quit / Always on Top / Mini IPC ────────────────────────────
export function registerWindowIpc() {
  ipcMain.handle("app:quit", () => quitApp());

  ipcMain.handle("set-always-on-top", (_event, value) => {
    if (value) {
      createMiniWindow();
      if (mainWindow) mainWindow.hide();
    } else {
      closeMiniWindow();
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });

  ipcMain.on("mini-action", (_event, action) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("mini-action", action);
    }
  });

  ipcMain.on("timer-state", (_event, state) => {
    if (miniWindow && !miniWindow.isDestroyed()) {
      miniWindow.webContents.send("timer-state", state);
    }
  });
}
