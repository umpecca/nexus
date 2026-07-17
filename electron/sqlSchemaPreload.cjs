const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nexusSqlSchemaHost", {
  ready() { ipcRenderer.send("sqlschema:ready"); },
  onInit(callback) { ipcRenderer.once("sqlschema:init", (_event, payload) => callback(payload)); },
  save(result) { ipcRenderer.send("sqlschema:save", result); },
  cancel() { ipcRenderer.send("sqlschema:cancel"); }
});
