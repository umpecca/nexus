const { contextBridge, ipcRenderer } = require("electron");

const menuActionChannel = "menu:action";
const windowMaximizeChannel = "window:maximize-changed";

// The single context bridge the renderer talks to. Everything the UI is allowed to ask the
// main process to do is listed here; add a method here + a matching ipcMain handler in main.cjs
// to extend the surface. Exposed as `window.api` (see src/api.d.ts for the typed contract).
contextBridge.exposeInMainWorld("api", {
  platform: process.platform,
  onMenuAction(callback) {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on(menuActionChannel, listener);
    return () => ipcRenderer.removeListener(menuActionChannel, listener);
  },
  onWindowMaximizeChange(callback) {
    const listener = (_event, isMaximized) => callback(isMaximized);
    ipcRenderer.on(windowMaximizeChannel, listener);
    return () => ipcRenderer.removeListener(windowMaximizeChannel, listener);
  },
  minimizeWindow() {
    return ipcRenderer.invoke("window:minimize");
  },
  toggleMaximizeWindow() {
    return ipcRenderer.invoke("window:toggle-maximize");
  },
  closeWindow() {
    return ipcRenderer.invoke("window:close");
  },
  isWindowMaximized() {
    return ipcRenderer.invoke("window:is-maximized");
  },
  newWindow() {
    return ipcRenderer.invoke("window:new");
  },
  quitApp() {
    return ipcRenderer.invoke("app:quit");
  },
  runEditCommand(command) {
    return ipcRenderer.invoke("edit:command", command);
  },
  openTextFile() {
    return ipcRenderer.invoke("file:open");
  },
  saveTextFile(filePath, content) {
    return ipcRenderer.invoke("file:save", { filePath, content });
  },
  saveTextFileAs(currentPath, content) {
    return ipcRenderer.invoke("file:saveAs", { currentPath, content });
  },
  openExternal(url) {
    return ipcRenderer.invoke("app:open-external", url);
  }
});
