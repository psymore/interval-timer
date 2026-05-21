import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  // Open file picker dialog and return the selected file path
  getFilePath: () => ipcRenderer.invoke("get-file-path"),
});
