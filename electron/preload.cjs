const { contextBridge, ipcRenderer } = require("electron");

const menuActionChannel = "menu:action";
const closeRequestChannel = "app:request-close";
const externalFileChangeChannel = "file:external-change";

contextBridge.exposeInMainWorld("nexus", {
  platform: process.platform,
  onMenuAction(callback) {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on(menuActionChannel, listener);
    return () => ipcRenderer.removeListener(menuActionChannel, listener);
  },
  onCloseRequest(callback) {
    const listener = () => callback();
    ipcRenderer.on(closeRequestChannel, listener);
    return () => ipcRenderer.removeListener(closeRequestChannel, listener);
  },
  onExternalFileChange(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(externalFileChangeChannel, listener);
    return () => ipcRenderer.removeListener(externalFileChangeChannel, listener);
  },
  resolveCloseRequest(shouldClose) {
    return ipcRenderer.invoke("app:resolve-close-request", shouldClose);
  },
  runEditCommand(command) {
    return ipcRenderer.invoke("edit:command", command);
  },
  getProfileName() {
    return ipcRenderer.invoke("app:get-profile-name");
  },
  openMarkdownFile() {
    return ipcRenderer.invoke("file:open");
  },
  getInitialOpenFile() {
    return ipcRenderer.invoke("file:get-initial-open-file");
  },
  readWatchedMarkdownFile(filePath) {
    return ipcRenderer.invoke("file:read", filePath);
  },
  watchMarkdownFile(filePath) {
    return ipcRenderer.invoke("file:watch", filePath);
  },
  unwatchMarkdownFile() {
    return ipcRenderer.invoke("file:unwatch");
  },
  saveMarkdownFile(filePath, markdown) {
    return ipcRenderer.invoke("file:save", { filePath, markdown });
  },
  saveMarkdownFileAs(currentPath, markdown) {
    return ipcRenderer.invoke("file:saveAs", { currentPath, markdown });
  },
  exportMarkdownAsHtml(currentPath, markdown, options) {
    return ipcRenderer.invoke("file:export-html", { currentPath, markdown, options });
  },
  exportMarkdownAsPdf(currentPath, markdown, options) {
    return ipcRenderer.invoke("file:export-pdf", { currentPath, markdown, options });
  },
  selectLocalImage() {
    return ipcRenderer.invoke("image:select-local");
  },
  selectBase64Image() {
    return ipcRenderer.invoke("image:select-base64");
  },
  resolveImagePreview(documentPath, imageSource) {
    return ipcRenderer.invoke("image:resolve-preview", { documentPath, imageSource });
  },
  confirmSaveChanges() {
    return ipcRenderer.invoke("dialog:confirmSaveChanges");
  },
  setMenuState(state) {
    ipcRenderer.send("menu:set-state", state);
  }
});
