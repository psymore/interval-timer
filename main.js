import path from "path";
import { fileURLToPath } from "url";
import {
  app,
  BrowserWindow,
  ipcMain,
  powerSaveBlocker,
  dialog,
  Tray,
  Menu,
  nativeImage,
  screen,
} from "electron";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let miniWindow = null;
let tray = null;
let blockerId = null;
let isQuitting = false;

app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");

// ── Main window ───────────────────────────────────────────────
function createWindow() {
  const preloadPath = path.join(__dirname, "preload.cjs");
  const indexPath = path.join(__dirname, "index.html");

  if (!fs.existsSync(preloadPath)) {
    console.error(`Preload not found: ${preloadPath}`);
    return;
  }
  if (!fs.existsSync(indexPath)) {
    console.error(`index.html not found: ${indexPath}`);
    return;
  }

  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      contextIsolation: true,
      enableRemoteModule: false,
      preload: preloadPath,
      backgroundThrottling: false,
    },
  });

  mainWindow.loadFile(indexPath);

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
function createMiniWindow() {
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.show();
    miniWindow.focus();
    return;
  }

  const preloadPath = path.join(__dirname, "preload.cjs");
  const miniPath = path.join(__dirname, "mini.html");

  // Ekranın sağ üstüne konumlandır
  const { width: sw } = screen.getPrimaryDisplay().workAreaSize;

  miniWindow = new BrowserWindow({
    width: 280,
    height: 180,
    x: sw - 300,
    y: 20,
    minWidth: 240,
    minHeight: 160,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    resizable: false, // ← drag ile resize çakışmasını önler
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      enableRemoteModule: false,
      preload: preloadPath,
      backgroundThrottling: false,
    },
  });

  miniWindow.loadFile(miniPath);

  miniWindow.webContents.on("did-finish-load", () => {
    // Mini hazır — ana pencereye state iste
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("mini-ready");
    }
  });

  miniWindow.on("closed", () => {
    miniWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("mini-closed");
    }
  });
}

function closeMiniWindow() {
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.destroy();
  }
}

// ── Tray ──────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, "assets", "tray-icon.png");
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
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("click", () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.focus() : mainWindow.show();
    }
  });
}

// ── App lifecycle ─────────────────────────────────────────────
app
  .whenReady()
  .then(() => {
    createWindow();
    createTray();
    blockerId = powerSaveBlocker.start("prevent-app-suspension");
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  })
  .catch(err => console.error("App init error:", err));

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && isQuitting) {
    if (blockerId !== null) {
      powerSaveBlocker.stop(blockerId);
      blockerId = null;
    }
    app.quit();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
});

// ── IPC ───────────────────────────────────────────────────────
ipcMain.handle("get-file-path", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "Audio Files", extensions: ["mp3", "wav", "ogg"] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

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

process.on("uncaughtException", error => {
  console.error("Uncaught exception:", error);
});
