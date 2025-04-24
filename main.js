import path from "path";
import { fileURLToPath } from "url";
import { app, BrowserWindow, ipcMain, powerSaveBlocker } from "electron";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("Main process started.");
console.log("Current directory:", __dirname);
console.log("File URL:", __filename);
const preloadPath = path.join(__dirname, "preload.js");
console.log("Preload script path:", preloadPath);

let mainWindow;
let timer = null;
let blockerId = null;

function createWindow() {
  const preloadPath = path.join(__dirname, "preload.js");
  const indexPath = path.join(__dirname, "index.html");

  // Check if preload.js exists
  if (!fs.existsSync(preloadPath)) {
    console.error(`Preload script not found at: ${preloadPath}`);
    return;
  }

  // Check if index.html exists
  if (!fs.existsSync(indexPath)) {
    console.error(`HTML file not found at: ${indexPath}`);
    return;
  }

  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      contextIsolation: true, // Ensure context isolation is enabled
      enableRemoteModule: false, // Disable remote module for security
      preload: preloadPath, // Ensure the preload path is correct
    },
  });

  mainWindow.loadFile(indexPath);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  console.log("Main window created successfully.");
}

function setCSP() {
  const csp = `
    default-src 'self';
    script-src 'self';
    style-src 'self' 'unsafe-inline';
    img-src 'self' data:;
    connect-src 'self';
    font-src 'self';
  `;
  const indexPath = path.join(__dirname, "index.html");
  let htmlContent = fs.readFileSync(indexPath, "utf8");

  // Inject CSP meta tag into the <head> of the HTML
  if (!htmlContent.includes("Content-Security-Policy")) {
    htmlContent = htmlContent.replace(
      "<head>",
      `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`
    );
    fs.writeFileSync(indexPath, htmlContent, "utf8");
    console.log("CSP added to index.html");
  }
}

function startTimer(event, intervalMs) {
  clearInterval(timer); // Clear any existing timer
  timer = setInterval(() => {
    event.sender.send("tick");
  }, intervalMs);
}

function stopTimer() {
  clearInterval(timer);
}

app.disableHardwareAcceleration(); // Disable hardware acceleration

app
  .whenReady()
  .then(() => {
    console.log("App is ready.");
    setCSP(); // Inject CSP before creating the window
    createWindow();

    // Prevent the system from throttling the app
    blockerId = powerSaveBlocker.start("prevent-app-suspension");

    // Handle app activation (e.g., when clicking the dock icon on macOS)
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  })
  .catch(err => {
    console.error("Error during app initialization:", err);
  });

app.on("window-all-closed", () => {
  if (blockerId !== null) {
    powerSaveBlocker.stop(blockerId);
  }
  if (process.platform !== "darwin") app.quit();
});

// --- IPC logic for timer ---
ipcMain.on("start-timer", (event, intervalMs) => startTimer(event, intervalMs));
ipcMain.on("stop-timer", stopTimer);

process.on("uncaughtException", error => {
  console.error("Uncaught exception in main process:", error);
});
