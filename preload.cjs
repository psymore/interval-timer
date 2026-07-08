const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // App
  quitApp: () => ipcRenderer.invoke("app:quit"),

  // Dosya
  getFilePath: () => ipcRenderer.invoke("get-file-path"),

  // Mini / always on top
  setAlwaysOnTop: value => ipcRenderer.invoke("set-always-on-top", value),
  sendTimerState: state => ipcRenderer.send("timer-state", state),
  sendMiniAction: action => ipcRenderer.send("mini-action", action),
  onMiniClosed: cb => ipcRenderer.on("mini-closed", cb),
  onTimerState: cb => ipcRenderer.on("timer-state", (_e, s) => cb(s)),
  onMiniAction: cb => ipcRenderer.on("mini-action", (_e, a) => cb(a)),
  onMiniReady: cb => ipcRenderer.on("mini-ready", cb),

  // Presets
  presetsGetAll: () => ipcRenderer.invoke("presets:get-all"),
  presetsGetActive: () => ipcRenderer.invoke("presets:get-active"),
  presetsSave: preset => ipcRenderer.invoke("presets:save", preset),
  presetsDelete: id => ipcRenderer.invoke("presets:delete", id),
  presetsSetActive: id => ipcRenderer.invoke("presets:set-active", id),

  // Spotify — client_secret hiçbir zaman renderer'a geçmez
  spotifyLogin: () => ipcRenderer.invoke("spotify:login"),
  spotifyRefresh: token => ipcRenderer.invoke("spotify:refresh", token),
  spotifyOpenTrack: trackId => ipcRenderer.invoke("spotify:open-track", trackId),

  // Spotify token storage — encrypted at rest in the main process
  // (safeStorage), never held in the renderer's localStorage.
  spotifyGetTokens: () => ipcRenderer.invoke("spotify:get-tokens"),
  spotifySaveTokens: tokens => ipcRenderer.invoke("spotify:save-tokens", tokens),
  spotifyClearTokens: () => ipcRenderer.invoke("spotify:clear-tokens"),
});
