const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nexusOpenApiHost", {
  ready() {
    ipcRenderer.send("openapi:ready");
  },
  onInit(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.once("openapi:init", listener);
  },
  save(result) {
    ipcRenderer.send("openapi:save", result);
  },
  cancel() {
    ipcRenderer.send("openapi:cancel");
  }
});
