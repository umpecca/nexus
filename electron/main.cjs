const path = require("node:path");
const fs = require("node:fs/promises");
const { existsSync, watch } = require("node:fs");
const os = require("node:os");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, Menu, dialog, ipcMain } = require("electron");

const isDev = Boolean(process.env.NEXUS_DEV_SERVER_URL);
const appIconPath = path.join(__dirname, "..", "nexus.png");
const closeStates = new Map();
const fileWatchers = new Map();
const pendingInitialFiles = new Map();
const pendingExternalFilePaths = [];
let isQuitting = false;

const openableFileExtensions = new Set([".md", ".markdown", ".mdx", ".txt"]);
const fileWatchDebounceMs = 350;
const internalWriteSuppressMs = 1500;

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

function isProbablyFilePath(argument) {
  return (
    typeof argument === "string" &&
    argument.length > 0 &&
    !argument.startsWith("-") &&
    path.extname(argument).length > 0
  );
}

function getAppIconPath() {
  return existsSync(appIconPath) ? appIconPath : undefined;
}

async function getOpenableFilePaths(args) {
  const filePaths = [];

  for (const argument of args) {
    if (!isProbablyFilePath(argument)) {
      continue;
    }

    const filePath = path.resolve(argument);
    const extension = path.extname(filePath).toLowerCase();
    if (!openableFileExtensions.has(extension)) {
      continue;
    }

    try {
      const stats = await fs.stat(filePath);
      if (stats.isFile()) {
        filePaths.push(filePath);
      }
    } catch {
      // Ignore non-file process arguments.
    }
  }

  return filePaths;
}

async function readMarkdownFile(filePath) {
  const resolvedFilePath = path.resolve(filePath);
  const markdown = await fs.readFile(resolvedFilePath, "utf8");
  return { canceled: false, filePath: resolvedFilePath, markdown };
}

function hasUrlScheme(source) {
  if (/^[a-z]:[\\/]/i.test(source)) {
    return false;
  }

  return /^[a-z][a-z\d+.-]*:/i.test(source);
}

function shouldPassThroughImageSource(source) {
  return (
    source.startsWith("#") ||
    source.startsWith("//") ||
    hasUrlScheme(source)
  );
}

function splitImageSourceSuffix(source) {
  const suffixIndex = source.search(/[?#]/);
  if (suffixIndex === -1) {
    return { imagePath: source, suffix: "" };
  }

  return {
    imagePath: source.slice(0, suffixIndex),
    suffix: source.slice(suffixIndex)
  };
}

function resolveImagePreviewSource(documentPath, imageSource) {
  if (typeof imageSource !== "string") {
    return "";
  }

  const source = imageSource.trim();
  if (!source || shouldPassThroughImageSource(source)) {
    return source;
  }

  const { imagePath, suffix } = splitImageSourceSuffix(source);
  if (!imagePath || shouldPassThroughImageSource(imagePath)) {
    return source;
  }

  if (path.isAbsolute(imagePath)) {
    return `${pathToFileURL(imagePath).href}${suffix}`;
  }

  if (typeof documentPath !== "string" || documentPath.length === 0) {
    return source;
  }

  const resolvedPath = path.resolve(path.dirname(documentPath), imagePath);
  return `${pathToFileURL(resolvedPath).href}${suffix}`;
}

function escapeHtmlAttribute(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getDocumentTitleForExport(currentPath) {
  if (typeof currentPath === "string" && currentPath.length > 0) {
    return path.basename(currentPath, path.extname(currentPath));
  }

  return "Untitled";
}

function getDefaultExportPath(currentPath, extension) {
  const fileName = `${getDocumentTitleForExport(currentPath)}.${extension}`;

  if (typeof currentPath === "string" && currentPath.length > 0) {
    return path.join(path.dirname(currentPath), fileName);
  }

  return fileName;
}

function buildExportHtmlDocument(title, bodyHtml) {
  const escapedTitle = escapeHtmlAttribute(title);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapedTitle}</title>
  <style>
    :root {
      color-scheme: light;
      font-family: "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      color: #111827;
      background: #ffffff;
    }

    body {
      margin: 0;
      background: #ffffff;
    }

    main {
      box-sizing: border-box;
      width: min(100%, 920px);
      margin: 0 auto;
      padding: 48px 40px;
      line-height: 1.6;
      font-size: 16px;
    }

    h1, h2, h3, h4, h5, h6 {
      line-height: 1.25;
      margin: 1.6em 0 0.6em;
    }

    h1:first-child, h2:first-child, h3:first-child {
      margin-top: 0;
    }

    p, ul, ol, blockquote, pre, table {
      margin: 0 0 1em;
    }

    a {
      color: #075985;
    }

    img {
      max-width: 100%;
      height: auto;
    }

    blockquote {
      border-left: 4px solid #d1d5db;
      color: #4b5563;
      padding-left: 1em;
    }

    code {
      background: #f3f4f6;
      border-radius: 4px;
      padding: 0.12em 0.3em;
      font-family: "Cascadia Code", "SFMono-Regular", Consolas, monospace;
      font-size: 0.92em;
    }

    pre {
      background: #f8fafc;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      overflow-x: auto;
      padding: 1em;
    }

    pre code {
      background: transparent;
      padding: 0;
    }

    table {
      border-collapse: collapse;
      width: 100%;
    }

    th, td {
      border: 1px solid #d1d5db;
      padding: 0.45em 0.6em;
      text-align: left;
      vertical-align: top;
    }

    th {
      background: #f3f4f6;
    }

    @media print {
      main {
        width: 100%;
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <main>
${bodyHtml}
  </main>
</body>
</html>`;
}

async function renderMarkdownExportHtml(markdown, currentPath) {
  const { Marked, Renderer } = await import("marked");
  const renderer = new Renderer();

  renderer.image = (token) => {
    const src = resolveImagePreviewSource(currentPath, token.href);
    const title = token.title ? ` title="${escapeHtmlAttribute(token.title)}"` : "";
    return `<img src="${escapeHtmlAttribute(src)}" alt="${escapeHtmlAttribute(token.text)}"${title}>`;
  };

  const marked = new Marked({
    async: true,
    breaks: false,
    gfm: true,
    renderer
  });
  const bodyHtml = await marked.parse(markdown ?? "");
  return buildExportHtmlDocument(getDocumentTitleForExport(currentPath), bodyHtml);
}

async function showExportError(event, format, error) {
  const window = BrowserWindow.fromWebContents(event.sender);
  const message = error instanceof Error ? error.message : "The document could not be exported.";
  const options = {
    type: "error",
    title: "Export Failed",
    message: `Nexus could not export this document as ${format}.`,
    detail: message
  };

  if (window && !window.isDestroyed()) {
    await dialog.showMessageBox(window, options);
  } else {
    await dialog.showMessageBox(options);
  }
}

function getComparableFilePath(filePath) {
  const resolvedFilePath = path.resolve(filePath);
  return process.platform === "win32" ? resolvedFilePath.toLowerCase() : resolvedFilePath;
}

function isSameFilePath(first, second) {
  return getComparableFilePath(first) === getComparableFilePath(second);
}

function getWindowByWebContentsId(webContentsId) {
  return BrowserWindow.getAllWindows().find((window) => {
    try {
      return !window.isDestroyed() && window.webContents.id === webContentsId;
    } catch {
      return false;
    }
  });
}

function getFileSignature(stats) {
  return `${stats.mtimeMs}:${stats.size}`;
}

async function readFileSignature(filePath) {
  const stats = await fs.stat(filePath);
  if (!stats.isFile()) {
    throw new Error("The watched path is not a file.");
  }

  return getFileSignature(stats);
}

function sendFileWatchEvent(webContentsId, payload) {
  const window = getWindowByWebContentsId(webContentsId);
  if (!window || window.isDestroyed()) {
    stopFileWatcher(webContentsId);
    return;
  }

  window.webContents.send("file:external-change", payload);
}

function stopFileWatcher(webContentsId) {
  const state = fileWatchers.get(webContentsId);
  if (!state) {
    return;
  }

  if (state.timeout) {
    clearTimeout(state.timeout);
  }

  state.watcher?.close();
  fileWatchers.delete(webContentsId);
}

async function refreshWatchedFileSignature(webContentsId, filePath) {
  const state = fileWatchers.get(webContentsId);
  if (!state || !isSameFilePath(state.filePath, filePath)) {
    return;
  }

  try {
    state.lastSignature = await readFileSignature(state.filePath);
  } catch {
    // A follow-up watcher event will report the missing file if it remains unavailable.
  }
}

function markInternalWrite(webContentsId, filePath) {
  const state = fileWatchers.get(webContentsId);
  if (!state || !isSameFilePath(state.filePath, filePath)) {
    return;
  }

  state.suppressUntil = Date.now() + internalWriteSuppressMs;
}

async function handleWatchedFileEvent(webContentsId) {
  const state = fileWatchers.get(webContentsId);
  if (!state) {
    return;
  }

  if (Date.now() <= state.suppressUntil) {
    await refreshWatchedFileSignature(webContentsId, state.filePath);
    return;
  }

  let nextSignature;
  try {
    nextSignature = await readFileSignature(state.filePath);
  } catch {
    sendFileWatchEvent(webContentsId, {
      filePath: state.filePath,
      kind: "missing",
      timestamp: Date.now()
    });
    stopFileWatcher(webContentsId);
    return;
  }

  if (nextSignature === state.lastSignature) {
    return;
  }

  state.lastSignature = nextSignature;
  restartFileWatcherHandle(webContentsId, state);
  sendFileWatchEvent(webContentsId, {
    filePath: state.filePath,
    kind: "changed",
    timestamp: Date.now()
  });
}

function scheduleWatchedFileEvent(webContentsId) {
  const state = fileWatchers.get(webContentsId);
  if (!state) {
    return;
  }

  if (state.timeout) {
    clearTimeout(state.timeout);
  }

  state.timeout = setTimeout(() => {
    state.timeout = null;
    void handleWatchedFileEvent(webContentsId);
  }, fileWatchDebounceMs);
}

function attachFileWatcherHandle(webContentsId, state) {
  state.watcher = watch(state.filePath, { persistent: false }, () => {
    scheduleWatchedFileEvent(webContentsId);
  });

  state.watcher.on("error", () => {
    sendFileWatchEvent(webContentsId, {
      filePath: state.filePath,
      kind: "missing",
      timestamp: Date.now()
    });
    stopFileWatcher(webContentsId);
  });
}

function restartFileWatcherHandle(webContentsId, state) {
  try {
    state.watcher?.close();
    attachFileWatcherHandle(webContentsId, state);
  } catch {
    // The next file operation or watcher error will surface if the path is no longer watchable.
  }
}

async function startFileWatcher(webContentsId, filePath) {
  const resolvedFilePath = path.resolve(filePath);
  const lastSignature = await readFileSignature(resolvedFilePath);

  stopFileWatcher(webContentsId);

  const state = {
    filePath: resolvedFilePath,
    lastSignature,
    suppressUntil: 0,
    timeout: null,
    watcher: null
  };

  fileWatchers.set(webContentsId, state);
  try {
    attachFileWatcherHandle(webContentsId, state);
  } catch (error) {
    fileWatchers.delete(webContentsId);
    throw error;
  }
  return { filePath: resolvedFilePath };
}

function getCloseState(window) {
  let state = closeStates.get(window);
  if (!state) {
    state = { allowed: false, pending: false };
    closeStates.set(window, state);
  }

  return state;
}

function requestWindowClose(window) {
  if (!window || window.isDestroyed()) {
    return;
  }

  const state = getCloseState(window);
  if (state.allowed || state.pending) {
    return;
  }

  state.pending = true;
  window.webContents.send("app:request-close");
}

function requestNextWindowClose() {
  const window = BrowserWindow.getAllWindows().find((candidate) => {
    const state = getCloseState(candidate);
    return !state.allowed && !state.pending;
  });

  if (!window) {
    app.quit();
    return;
  }

  if (!window.isFocused()) {
    window.focus();
  }

  requestWindowClose(window);
}

function requestAppQuit() {
  const windows = BrowserWindow.getAllWindows();
  if (windows.length === 0) {
    app.quit();
    return;
  }

  isQuitting = true;
  requestNextWindowClose();
}

function createWindow(options = {}) {
  const { filePath } = options;
  const window = new BrowserWindow({
    title: "Nexus",
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#f6f2ea",
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const webContentsId = window.webContents.id;

  closeStates.set(window, { allowed: false, pending: false });

  if (filePath) {
    pendingInitialFiles.set(webContentsId, readMarkdownFile(filePath));
  }

  window.on("close", (event) => {
    const state = getCloseState(window);
    if (state.allowed) {
      return;
    }

    event.preventDefault();
    requestWindowClose(window);
  });

  window.on("closed", () => {
    stopFileWatcher(webContentsId);
    pendingInitialFiles.delete(webContentsId);
    closeStates.delete(window);

    if (isQuitting && BrowserWindow.getAllWindows().length > 0) {
      setImmediate(requestNextWindowClose);
    }
  });

  if (isDev) {
    window.loadURL(process.env.NEXUS_DEV_SERVER_URL);
  } else {
    window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  return window;
}

async function openFilesInNewWindows(filePaths) {
  for (const filePath of filePaths) {
    createWindow({ filePath });
  }
}

async function openFilesFromArgs(args) {
  const filePaths = await getOpenableFilePaths(args);
  if (filePaths.length === 0) {
    return false;
  }

  await openFilesInNewWindows(filePaths);
  return true;
}

function sendMenuAction(action) {
  const window = BrowserWindow.getFocusedWindow();
  if (window) {
    window.webContents.send("menu:action", action);
  }
}

function runEditCommand(window, command) {
  if (!window || window.isDestroyed()) {
    return;
  }

  if (command === "cut") {
    window.webContents.cut();
  }

  if (command === "copy") {
    window.webContents.copy();
  }

  if (command === "paste") {
    window.webContents.paste();
  }
}

function buildMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "New Window",
          accelerator: "CmdOrCtrl+Shift+N",
          click: () => createWindow()
        },
        {
          type: "separator"
        },
        {
          label: "New",
          accelerator: "CmdOrCtrl+N",
          click: () => sendMenuAction("new")
        },
        {
          label: "Open",
          accelerator: "CmdOrCtrl+O",
          click: () => sendMenuAction("open")
        },
        {
          label: "Save",
          accelerator: "CmdOrCtrl+S",
          click: () => sendMenuAction("save")
        },
        {
          label: "Save As",
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => sendMenuAction("saveAs")
        },
        {
          type: "separator"
        },
        {
          label: "Export as HTML",
          click: () => sendMenuAction("exportHtml")
        },
        {
          label: "Export as PDF",
          click: () => sendMenuAction("exportPdf")
        },
        {
          type: "separator"
        },
        {
          label: "Exit",
          accelerator: process.platform === "darwin" ? "Cmd+Q" : "Alt+F4",
          click: () => requestAppQuit()
        }
      ]
    },
    {
      label: "Edit",
      submenu: [
        {
          label: "Undo",
          role: "undo"
        },
        {
          label: "Redo",
          role: "redo"
        },
        {
          type: "separator"
        },
        {
          label: "Refresh",
          click: () => sendMenuAction("refresh")
        },
        {
          label: "Compare with Previous Version",
          click: () => sendMenuAction("comparePreviousVersion")
        },
        {
          type: "separator"
        },
        {
          label: "Cut",
          role: "cut"
        },
        {
          label: "Copy",
          role: "copy"
        },
        {
          label: "Paste",
          role: "paste"
        }
      ]
    },
    {
      label: "Settings",
      submenu: [
        {
          label: "Preferences",
          accelerator: "CmdOrCtrl+,",
          click: () => sendMenuAction("settings")
        }
      ]
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About",
          click: () => sendMenuAction("about")
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

const markdownFilters = [
  { name: "Markdown", extensions: ["md", "markdown", "mdx"] },
  { name: "Text", extensions: ["txt"] },
  { name: "All Files", extensions: ["*"] }
];

const htmlFilters = [
  { name: "HTML", extensions: ["html", "htm"] },
  { name: "All Files", extensions: ["*"] }
];

const pdfFilters = [
  { name: "PDF", extensions: ["pdf"] },
  { name: "All Files", extensions: ["*"] }
];

const imageFilters = [
  { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"] },
  { name: "All Files", extensions: ["*"] }
];

const imageMimeTypes = new Map([
  [".bmp", "image/bmp"],
  [".gif", "image/gif"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"]
]);

function getImageMimeType(filePath) {
  return imageMimeTypes.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream";
}

async function selectImageFile() {
  const result = await dialog.showOpenDialog({
    title: "Import Image",
    properties: ["openFile"],
    filters: imageFilters
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  return { canceled: false, filePath: path.resolve(result.filePaths[0]) };
}

ipcMain.handle("file:open", async () => {
  const result = await dialog.showOpenDialog({
    title: "Open Markdown",
    properties: ["openFile"],
    filters: markdownFilters
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const filePath = result.filePaths[0];
  return readMarkdownFile(filePath);
});

ipcMain.handle("file:get-initial-open-file", async (event) => {
  const pendingFile = pendingInitialFiles.get(event.sender.id);
  if (!pendingFile) {
    return { canceled: true };
  }

  pendingInitialFiles.delete(event.sender.id);

  try {
    return await pendingFile;
  } catch (error) {
    const window = BrowserWindow.fromWebContents(event.sender);
    const message = error instanceof Error ? error.message : "The file could not be opened.";
    const options = {
      type: "error",
      title: "Open Failed",
      message: "Nexus could not open this file.",
      detail: message
    };

    if (window && !window.isDestroyed()) {
      await dialog.showMessageBox(window, options);
    } else {
      await dialog.showMessageBox(options);
    }

    return { canceled: true };
  }
});

ipcMain.handle("file:read", async (event, filePath) => {
  if (typeof filePath !== "string" || filePath.length === 0) {
    throw new Error("A file path is required to read the document.");
  }

  const result = await readMarkdownFile(filePath);
  await refreshWatchedFileSignature(event.sender.id, result.filePath);
  return result;
});

ipcMain.handle("file:watch", async (event, filePath) => {
  if (typeof filePath !== "string" || filePath.length === 0) {
    throw new Error("A file path is required to watch the document.");
  }

  return startFileWatcher(event.sender.id, filePath);
});

ipcMain.handle("file:unwatch", (event) => {
  stopFileWatcher(event.sender.id);
});

ipcMain.handle("file:save", async (event, payload) => {
  const { filePath, markdown } = payload ?? {};
  if (typeof filePath !== "string" || filePath.length === 0) {
    throw new Error("A file path is required to save the document.");
  }

  markInternalWrite(event.sender.id, filePath);
  await fs.writeFile(filePath, markdown ?? "", "utf8");
  await refreshWatchedFileSignature(event.sender.id, filePath);
  return { filePath };
});

ipcMain.handle("file:saveAs", async (event, payload) => {
  const { currentPath, markdown } = payload ?? {};
  const result = await dialog.showSaveDialog({
    title: "Save Markdown",
    defaultPath: currentPath || "untitled.md",
    filters: markdownFilters
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  markInternalWrite(event.sender.id, result.filePath);
  await fs.writeFile(result.filePath, markdown ?? "", "utf8");
  await refreshWatchedFileSignature(event.sender.id, result.filePath);
  return { canceled: false, filePath: result.filePath };
});

ipcMain.handle("file:export-html", async (event, payload) => {
  const { currentPath, markdown } = payload ?? {};

  try {
    const html = await renderMarkdownExportHtml(markdown, currentPath);
    const result = await dialog.showSaveDialog({
      title: "Export HTML",
      defaultPath: getDefaultExportPath(currentPath, "html"),
      filters: htmlFilters
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    await fs.writeFile(result.filePath, html, "utf8");
    return { canceled: false, filePath: result.filePath };
  } catch (error) {
    await showExportError(event, "HTML", error);
    return { canceled: true };
  }
});

ipcMain.handle("file:export-pdf", async (event, payload) => {
  const { currentPath, markdown } = payload ?? {};
  let exportWindow;

  try {
    const html = await renderMarkdownExportHtml(markdown, currentPath);
    const result = await dialog.showSaveDialog({
      title: "Export PDF",
      defaultPath: getDefaultExportPath(currentPath, "pdf"),
      filters: pdfFilters
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    exportWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: false
      }
    });

    await exportWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await exportWindow.webContents.executeJavaScript("document.fonts?.ready", true);
    const pdf = await exportWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4"
    });

    await fs.writeFile(result.filePath, pdf);
    return { canceled: false, filePath: result.filePath };
  } catch (error) {
    await showExportError(event, "PDF", error);
    return { canceled: true };
  } finally {
    if (exportWindow && !exportWindow.isDestroyed()) {
      exportWindow.destroy();
    }
  }
});

ipcMain.handle("image:select-local", async () => {
  const result = await selectImageFile();
  if (result.canceled) {
    return result;
  }

  return {
    canceled: false,
    filePath: result.filePath,
    src: pathToFileURL(result.filePath).href
  };
});

ipcMain.handle("image:select-base64", async () => {
  const result = await selectImageFile();
  if (result.canceled) {
    return result;
  }

  const data = await fs.readFile(result.filePath);
  const mimeType = getImageMimeType(result.filePath);

  return {
    canceled: false,
    filePath: result.filePath,
    mimeType,
    dataUrl: `data:${mimeType};base64,${data.toString("base64")}`
  };
});

ipcMain.handle("image:resolve-preview", (_event, payload) => {
  const { documentPath, imageSource } = payload ?? {};
  return resolveImagePreviewSource(documentPath, imageSource);
});

ipcMain.handle("edit:command", (event, command) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  runEditCommand(window, command);
});

ipcMain.handle("app:get-profile-name", () => {
  try {
    return os.userInfo().username || "default";
  } catch {
    return "default";
  }
});

ipcMain.handle("dialog:confirmSaveChanges", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow();
  const options = {
    type: "warning",
    title: "Unsaved Changes",
    message: "Do you want to save changes to this document?",
    detail: "Your changes will be lost if you don't save them.",
    buttons: ["Save", "Don't Save", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    noLink: true
  };
  const result = window
    ? await dialog.showMessageBox(window, options)
    : await dialog.showMessageBox(options);

  if (result.response === 0) {
    return "save";
  }

  if (result.response === 1) {
    return "discard";
  }

  return "cancel";
});

ipcMain.handle("app:resolve-close-request", (event, shouldClose) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window.isDestroyed()) {
    return;
  }

  const state = getCloseState(window);
  state.pending = false;

  if (shouldClose) {
    state.allowed = true;
    window.close();
  } else {
    isQuitting = false;
  }
});

if (gotSingleInstanceLock) {
  app.on("second-instance", (_event, argv) => {
    void openFilesFromArgs(argv);
  });

  app.on("open-file", (event, filePath) => {
    event.preventDefault();

    if (!app.isReady()) {
      pendingExternalFilePaths.push(filePath);
      return;
    }

    void openFilesInNewWindows([filePath]);
  });
}

app.whenReady().then(async () => {
  const iconPath = getAppIconPath();
  if (process.platform === "darwin" && iconPath) {
    app.dock?.setIcon(iconPath);
  }

  buildMenu();
  const initialFilePaths = [
    ...(await getOpenableFilePaths(process.argv)),
    ...pendingExternalFilePaths
  ];
  pendingExternalFilePaths.length = 0;

  if (initialFilePaths.length > 0) {
    await openFilesInNewWindows(initialFilePaths);
  } else {
    createWindow();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", (event) => {
  if (!isQuitting) {
    isQuitting = true;
  }

  const guardedWindow = BrowserWindow.getAllWindows().find((window) => {
    const state = getCloseState(window);
    return !state.allowed;
  });

  if (!guardedWindow) {
    return;
  }

  event.preventDefault();
  requestWindowClose(guardedWindow);
});

app.on("window-all-closed", () => {
  if (isQuitting || process.platform !== "darwin") {
    app.quit();
  }
});
