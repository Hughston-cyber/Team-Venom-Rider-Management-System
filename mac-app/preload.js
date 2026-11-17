const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("venomDesktop", {
  exportBackup: data => ipcRenderer.invoke("backup:export", data),
  importBackup: () => ipcRenderer.invoke("backup:import"),
  platform: process.platform
});