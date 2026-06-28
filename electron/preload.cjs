const { contextBridge, ipcRenderer } = require("electron");

const menuActionChannel = "menu:action";
const openRecentChannel = "menu:open-recent";
const closeRequestChannel = "app:request-close";
const externalFileChangeChannel = "file:external-change";
const exportProgressChannel = "export:progress";
const mcpConfirmWriteChannel = "mcp:confirm-write";
const mcpRequestSelectionChannel = "mcp:request-selection";
const sftpConfirmHostKeyChannel = "sftp:confirm-host-key";
const aiChatStreamEventChannel = "ai:chat-stream-event";

contextBridge.exposeInMainWorld("nexus", {
  platform: process.platform,
  getAppVersion() {
    return ipcRenderer.invoke("app:get-version");
  },
  onMenuAction(callback) {
    const listener = (_event, action, payload) => callback(action, payload);
    ipcRenderer.on(menuActionChannel, listener);
    return () => ipcRenderer.removeListener(menuActionChannel, listener);
  },
  onOpenRecentFile(callback) {
    const listener = (_event, filePath) => callback(filePath);
    ipcRenderer.on(openRecentChannel, listener);
    return () => ipcRenderer.removeListener(openRecentChannel, listener);
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
  onExportProgress(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(exportProgressChannel, listener);
    return () => ipcRenderer.removeListener(exportProgressChannel, listener);
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
  openRecentFile(filePath) {
    return ipcRenderer.invoke("recent:open", filePath);
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
  selectLocalImage(documentPath) {
    return ipcRenderer.invoke("image:select-local", { documentPath });
  },
  selectBase64Image() {
    return ipcRenderer.invoke("image:select-base64");
  },
  resolveImagePreview(documentPath, imageSource) {
    return ipcRenderer.invoke("image:resolve-preview", { documentPath, imageSource });
  },
  readDiagramSvg(documentPath, src) {
    return ipcRenderer.invoke("diagram:read-svg", { documentPath, src });
  },
  writeDiagramSvg(documentPath, svgText, kind) {
    return ipcRenderer.invoke("diagram:write-svg", { documentPath, svgText, kind });
  },
  cleanupDiagramAssets(documentPath, keepNames) {
    return ipcRenderer.invoke("diagram:cleanup-assets", { documentPath, keepNames });
  },
  editDiagram(payload) {
    return ipcRenderer.invoke("drawio:edit", payload);
  },
  editIsoflow(payload) {
    return ipcRenderer.invoke("isoflow:edit", payload);
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
  testMcpConnection() {
    return ipcRenderer.invoke("mcp:test-connection");
  },
  stopMcpNgrok() {
    return ipcRenderer.invoke("mcp:stop-ngrok");
  },
  restartMcpNgrok(config) {
    return ipcRenderer.invoke("mcp:restart-ngrok", config);
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
  onMcpRequestSelection(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(mcpRequestSelectionChannel, listener);
    return () => ipcRenderer.removeListener(mcpRequestSelectionChannel, listener);
  },
  resolveMcpSelection(requestId, selection) {
    ipcRenderer.send("mcp:selection-result", { requestId, selection });
  },
  publishWeb(payload) {
    return ipcRenderer.invoke("sftp:publish", payload);
  },
  publishQuickConnect(payload) {
    return ipcRenderer.invoke("quickconnect:publish", payload);
  },
  getQuickConnectToken(profileName) {
    return ipcRenderer.invoke("quickconnect:get-token", profileName);
  },
  setQuickConnectToken(profileName, token) {
    return ipcRenderer.invoke("quickconnect:set-token", { profileName, token });
  },
  getMcpBearerToken(profileName) {
    return ipcRenderer.invoke("mcp:get-bearer-token", profileName);
  },
  setMcpBearerToken(profileName, token) {
    return ipcRenderer.invoke("mcp:set-bearer-token", { profileName, token });
  },
  getAiProviderKey(profileName, providerId) {
    return ipcRenderer.invoke("ai:get-key", { profileName, providerId });
  },
  setAiProviderKey(profileName, providerId, key) {
    return ipcRenderer.invoke("ai:set-key", { profileName, providerId, key });
  },
  aiChat(payload) {
    return ipcRenderer.invoke("ai:chat", payload);
  },
  listMcpTools() {
    return ipcRenderer.invoke("mcp:list-tools");
  },
  callMcpTool(payload) {
    return ipcRenderer.invoke("mcp:call-tool", payload);
  },
  startAiChatStream(requestId, payload) {
    ipcRenderer.send("ai:chat-stream", { requestId, payload });
  },
  abortAiChatStream(requestId) {
    ipcRenderer.send("ai:chat-abort", { requestId });
  },
  onAiChatStreamEvent(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(aiChatStreamEventChannel, listener);
    return () => ipcRenderer.removeListener(aiChatStreamEventChannel, listener);
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
