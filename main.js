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
import Store from "electron-store";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Store schema ──────────────────────────────────────────────
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
  },
});

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
    resizable: false,
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
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.destroy();
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

// ── File picker IPC ───────────────────────────────────────────
ipcMain.handle("get-file-path", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "Audio Files", extensions: ["mp3", "wav", "ogg"] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// ── Always on Top IPC ─────────────────────────────────────────
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

// ── Mini IPC ──────────────────────────────────────────────────
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

// ── Preset IPC handlers ───────────────────────────────────────
ipcMain.handle("presets:get-all", () => {
  return store.get("presets");
});

ipcMain.handle("presets:get-active", () => {
  const presets = store.get("presets");
  const activeId = store.get("activePresetId");
  return presets.find(p => p.id === activeId) ?? presets[0];
});

ipcMain.handle("presets:save", (_event, preset) => {
  const presets = store.get("presets");
  const index = presets.findIndex(p => p.id === preset.id);
  if (index >= 0) {
    presets[index] = preset; // güncelle
  } else {
    presets.push(preset); // yeni ekle
  }
  store.set("presets", presets);
  return presets;
});

ipcMain.handle("presets:delete", (_event, id) => {
  const presets = store.get("presets");
  const filtered = presets.filter(p => p.id !== id);
  store.set("presets", filtered);

  // Silinen preset aktifse ilkini seç
  if (store.get("activePresetId") === id) {
    store.set("activePresetId", filtered[0]?.id ?? null);
  }
  return filtered;
});

ipcMain.handle("presets:set-active", (_event, id) => {
  store.set("activePresetId", id);
  return id;
});

process.on("uncaughtException", error => {
  console.error("Uncaught exception:", error);
});
