import path from "path";
import { fileURLToPath } from "url";
import {
  app,
  BrowserWindow,
  ipcMain,
  powerSaveBlocker,
  dialog,
} from "electron";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const preloadPath = path.join(__dirname, "preload.cjs");

let mainWindow;
let blockerId = null;

// ── Prevent Chromium throttling background timers ─────────────
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");

// ── Window creation ───────────────────────────────────────────
function createWindow() {
  const indexPath = path.join(__dirname, "index.html");

  if (!fs.existsSync(preloadPath)) {
    console.error(`Preload script not found at: ${preloadPath}`);
    return;
  }

  if (!fs.existsSync(indexPath)) {
    console.error(`HTML file not found at: ${indexPath}`);
    return;
  }

  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      contextIsolation: true,
      enableRemoteModule: false,
      preload: preloadPath,
      backgroundThrottling: false, // Keep timers alive in background
    },
  });

  mainWindow.loadFile(indexPath);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ── App lifecycle ─────────────────────────────────────────────
app
  .whenReady()
  .then(() => {
    createWindow();

    // Prevent Windows from suspending the app process
    blockerId = powerSaveBlocker.start("prevent-app-suspension");

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  })
  .catch(err => {
    console.error("Error during app initialization:", err);
  });

app.on("window-all-closed", () => {
  if (blockerId !== null) {
    powerSaveBlocker.stop(blockerId);
    blockerId = null;
  }
  if (process.platform !== "darwin") app.quit();
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

// ── Uncaught exception safety net ─────────────────────────────
process.on("uncaughtException", error => {
  console.error("Uncaught exception in main process:", error);
});
