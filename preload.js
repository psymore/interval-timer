// preload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  send: (channel, data) => ipcRenderer.send(channel, data),
  on: (channel, listener) =>
    ipcRenderer.on(channel, (_evt, ...args) => listener(...args)),
  onTick: listener => ipcRenderer.on("tick", listener), // Existing onTick listener
  startTimer: intervalMs => ipcRenderer.send("start-timer", intervalMs), // Expose start-timer
  stopTimer: () => ipcRenderer.send("stop-timer"), // Expose stop-timer
});
