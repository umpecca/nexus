const { contextBridge, ipcRenderer } = require("electron");

const menuActionChannel = "menu:action";

contextBridge.exposeInMainWorld("nexus", {
  platform: process.platform,
  onMenuAction(callback) {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on(menuActionChannel, listener);
    return () => ipcRenderer.removeListener(menuActionChannel, listener);
  },
  openMarkdownFile() {
    return ipcRenderer.invoke("file:open");
  },
  saveMarkdownFile(filePath, markdown) {
    return ipcRenderer.invoke("file:save", { filePath, markdown });
  },
  saveMarkdownFileAs(currentPath, markdown) {
    return ipcRenderer.invoke("file:saveAs", { currentPath, markdown });
  }
});
