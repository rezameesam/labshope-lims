"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// Remote tenant pages only learn that they run inside the desktop app.
// The workspace/retry controls are exposed to the bundled local pages only.
const base = { isDesktop: true, platform: process.platform };

if (window.location.protocol === "file:") {
  contextBridge.exposeInMainWorld("lims", {
    ...base,
    getState: () => ipcRenderer.invoke("workspace:state"),
    saveWorkspace: (value) => ipcRenderer.invoke("workspace:save", value),
    cancelSetup: () => ipcRenderer.invoke("workspace:cancel"),
    retry: () => ipcRenderer.invoke("app:retry"),
    changeWorkspace: () => ipcRenderer.invoke("workspace:change"),
  });
} else {
  contextBridge.exposeInMainWorld("lims", base);
}
