const { app, BrowserWindow } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 400,
    height: 500,
    webPreferences: {
      preload: path.join(__dirname, "renderer.js"), // this will now work
    },
  });

  win.loadFile("index.html");
}

app.whenReady().then(createWindow);
