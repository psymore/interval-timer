const path = require("path");
const { app, BrowserWindow, ipcMain, powerSaveBlocker } = require("electron");

let mainWindow;
let timer = null;
let blockerId = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      // For simple IPC usage (if you don't use contextBridge in preload)
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, "js", "renderer.js"), // still optional
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  // Prevent the system from throttling the app
  blockerId = powerSaveBlocker.start("prevent-app-suspension");

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (blockerId !== null) {
    powerSaveBlocker.stop(blockerId);
  }
  if (process.platform !== "darwin") app.quit();
});

// --- IPC logic for timer ---
ipcMain.on("start-timer", (event, intervalMs) => {
  clearInterval(timer); // in case it's running
  timer = setInterval(() => {
    event.sender.send("tick");
  }, intervalMs);
});

ipcMain.on("stop-timer", () => {
  clearInterval(timer);
});
