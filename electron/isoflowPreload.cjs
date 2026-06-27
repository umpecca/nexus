// Preload for the isoflow editor host window (isoflow-host.html). Unlike electron/drawioPreload.cjs —
// which relays a third-party iframe's postMessage protocol — the host page here is Nexus's own React
// app, so we expose a small typed bridge directly over IPC and nothing else. Runs in the isolated
// preload world (contextIsolation), so the page reaches it only through `window.nexusIsoflowHost`.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nexusIsoflowHost", {
  // Host → main: the app mounted; ask for the initial diagram model.
  ready() {
    ipcRenderer.send("isoflow:ready");
  },
  // main → host: receive the initial model (or null for a brand-new diagram).
  onInit(callback) {
    ipcRenderer.on("isoflow:init", (_event, model) => callback(model));
  },
  // Host → main: the user saved; hand back the produced image + source model. Resolves the session.
  save(result) {
    ipcRenderer.send("isoflow:save", result);
  },
  // Host → main: the user cancelled. Resolves the session as canceled.
  cancel() {
    ipcRenderer.send("isoflow:cancel");
  }
});
