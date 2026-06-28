const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getFilePath: () => ipcRenderer.invoke("get-file-path"),
  setAlwaysOnTop: value => ipcRenderer.invoke("set-always-on-top", value),
  sendTimerState: state => ipcRenderer.send("timer-state", state),
  sendMiniAction: action => ipcRenderer.send("mini-action", action),
  onMiniClosed: cb => ipcRenderer.on("mini-closed", cb),
  onTimerState: cb => ipcRenderer.on("timer-state", (_e, s) => cb(s)),
  onMiniAction: cb => ipcRenderer.on("mini-action", (_e, a) => cb(a)),
  onMiniReady: cb => ipcRenderer.on("mini-ready", cb), // ← eklendi
});
