const { contextBridge, ipcRenderer } = require("electron");

const menuActionChannel = "menu:action";
const closeRequestChannel = "app:request-close";
const externalFileChangeChannel = "file:external-change";
const mcpConfirmWriteChannel = "mcp:confirm-write";
const sftpConfirmHostKeyChannel = "sftp:confirm-host-key";

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
  writeHtmlToClipboard(payload) {
    return ipcRenderer.invoke("clipboard:write-html", payload);
  },
  copyMarkdownAsHtml(currentPath, markdown, options) {
    return ipcRenderer.invoke("clipboard:copy-html-document", { currentPath, markdown, options });
  },
  convertImageToDataUrl(source) {
    return ipcRenderer.invoke("image:to-data-url", source);
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
  exportMarkdownAsWord(currentPath, markdown, options) {
    return ipcRenderer.invoke("file:export-word", { currentPath, markdown, options });
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
  },
  configureMcpServer(config) {
    return ipcRenderer.invoke("mcp:configure", config);
  },
  registerMcpWindow(payload) {
    ipcRenderer.send("mcp:register-window", payload);
  },
  updateMcpWindowState(state) {
    ipcRenderer.send("mcp:update-window-state", state);
  },
  unregisterMcpWindow() {
    ipcRenderer.send("mcp:unregister-window");
  },
  onMcpConfirmWrite(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(mcpConfirmWriteChannel, listener);
    return () => ipcRenderer.removeListener(mcpConfirmWriteChannel, listener);
  },
  resolveMcpWrite(requestId, decision) {
    ipcRenderer.send("mcp:write-decision", { requestId, decision });
  },
  publishWeb(payload) {
    return ipcRenderer.invoke("sftp:publish", payload);
  },
  publishQuickConnect(payload) {
    return ipcRenderer.invoke("quickconnect:publish", payload);
  },
  selectPrivateKeyFile() {
    return ipcRenderer.invoke("dialog:select-private-key");
  },
  onConfirmHostKey(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(sftpConfirmHostKeyChannel, listener);
    return () => ipcRenderer.removeListener(sftpConfirmHostKeyChannel, listener);
  },
  resolveHostKey(requestId, decision) {
    ipcRenderer.send("sftp:host-key-decision", { requestId, decision });
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
  onWindowMaximizeChange(callback) {
    const listener = (_event, isMaximized) => callback(isMaximized);
    ipcRenderer.on("window:maximize-changed", listener);
    return () => ipcRenderer.removeListener("window:maximize-changed", listener);
  },
  newWindow() {
    return ipcRenderer.invoke("window:new");
  },
  quitApp() {
    return ipcRenderer.invoke("app:quit");
  }
});
