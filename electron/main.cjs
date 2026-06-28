const path = require("node:path");
const fs = require("node:fs/promises");
const { existsSync, watch, readFileSync } = require("node:fs");
const os = require("node:os");
const { pathToFileURL, fileURLToPath } = require("node:url");
const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, safeStorage, shell } = require("electron");
const htmlToDocx = require("@turbodocx/html-to-docx");
const crypto = require("node:crypto");
const SftpClient = require("ssh2-sftp-client");

const mcpServer = require("./mcp-server.cjs");
const ngrokTunnel = require("./ngrok-tunnel.cjs");
const recentFilesStore = require("./recentFiles.cjs");
const headingSlugger = require("./headingSlugger.cjs");
const mcpDocumentTools = require("./mcpDocumentTools.cjs");
const mcpDocumentEdits = require("./mcpDocumentEdits.cjs");
const imagePaths = require("./imagePaths.cjs");
const aiProviders = require("./aiProviders.cjs");
const { createDrawioSession } = require("./drawioEmbed.cjs");
const { ISOFLOW_WINDOW, normalizeSaveResult } = require("./isoflowEmbed.cjs");
const {
  AI_SELECTION_ACTIONS,
  AI_TONE_OPTIONS,
  AI_TRANSLATE_LANGUAGES
} = require("./aiSelectionCatalog.cjs");

const isDev = Boolean(process.env.NEXUS_DEV_SERVER_URL);
// Routine main-process traces (export/publish progress, IPC handler entry, host-key flow, etc.) are
// noise in packaged builds, so they go through debugLog and only print in dev mode or when
// NEXUS_DEBUG is set. Genuine failures use console.error directly so they always surface.
const isDebugLoggingEnabled = isDev || Boolean(process.env.NEXUS_DEBUG);
function debugLog(...args) {
  if (isDebugLoggingEnabled) {
    console.log(...args);
  }
}
const appIconPath = path.join(__dirname, "..", "nexus.png");
const closeStates = new Map();
const fileWatchers = new Map();
const pendingInitialFiles = new Map();
const pendingExternalFilePaths = [];
let isQuitting = false;

const mcpWindowRecords = new Map();
let mcpFocusedWindowId = null;
let mcpPendingWriteCounter = 0;
const mcpPendingWrites = new Map();
let mcpPendingSelectionCounter = 0;
const mcpPendingSelections = new Map();

let sftpPendingHostKeyCounter = 0;
const sftpPendingHostKeys = new Map();

function findMcpWindowByWindowId(windowId) {
  for (const record of mcpWindowRecords.values()) {
    if (record.windowId === windowId) {
      return record;
    }
  }
  return null;
}

function findMcpFocusedWindow() {
  if (mcpFocusedWindowId) {
    const focused = findMcpWindowByWindowId(mcpFocusedWindowId);
    if (focused) {
      return focused;
    }
  }

  return mcpWindowRecords.values().next().value ?? null;
}

function mcpListWindows() {
  const focusedId = findMcpFocusedWindow()?.windowId ?? null;
  return Array.from(mcpWindowRecords.values()).map((record) => ({
    windowId: record.windowId,
    title: record.title || "Untitled",
    filePath: record.filePath || null,
    dirty: Boolean(record.dirty),
    focused: record.windowId === focusedId
  }));
}

function resolveMcpWindowRecord(windowId) {
  return windowId ? findMcpWindowByWindowId(windowId) : findMcpFocusedWindow();
}

function mcpGetDocument(windowId) {
  const record = resolveMcpWindowRecord(windowId);

  if (!record) {
    return null;
  }

  return {
    windowId: record.windowId,
    title: record.title || "Untitled",
    filePath: record.filePath || null,
    dirty: Boolean(record.dirty),
    markdown: record.markdown ?? ""
  };
}

function mcpGetOutline(windowId) {
  const record = resolveMcpWindowRecord(windowId);
  if (!record) {
    return null;
  }

  return {
    windowId: record.windowId,
    title: record.title || "Untitled",
    filePath: record.filePath || null,
    headings: mcpDocumentTools.buildDocumentOutline(record.markdown ?? "")
  };
}

function mcpGetSection(windowId, selector) {
  const record = resolveMcpWindowRecord(windowId);
  if (!record) {
    return null;
  }

  return {
    windowId: record.windowId,
    filePath: record.filePath || null,
    ...mcpDocumentTools.getDocumentSection(record.markdown ?? "", selector || {})
  };
}

function mcpSearchDocument(windowId, options) {
  const record = resolveMcpWindowRecord(windowId);
  if (!record) {
    return null;
  }

  return {
    windowId: record.windowId,
    filePath: record.filePath || null,
    ...mcpDocumentTools.searchDocument(record.markdown ?? "", options || {})
  };
}

function mcpFind(windowId, options) {
  const record = resolveMcpWindowRecord(windowId);
  if (!record) {
    return null;
  }

  return {
    windowId: record.windowId,
    filePath: record.filePath || null,
    ...mcpDocumentTools.findInDocument(record.markdown ?? "", options || {})
  };
}

function normalizeSelectionResult(selection) {
  if (!selection || typeof selection !== "object") {
    return { ok: true, mode: "unknown", hasSelection: false, text: "" };
  }

  return {
    ok: true,
    mode: typeof selection.mode === "string" ? selection.mode : "unknown",
    hasSelection: Boolean(selection.hasSelection),
    text: typeof selection.text === "string" ? selection.text : ""
  };
}

function finishMcpSelection(requestId, value) {
  const pending = mcpPendingSelections.get(requestId);
  if (!pending) {
    return;
  }

  mcpPendingSelections.delete(requestId);
  clearTimeout(pending.timeout);
  pending.resolve(value);
}

function mcpRequestSelection(windowId) {
  return new Promise((resolve) => {
    const record = resolveMcpWindowRecord(windowId);
    if (!record) {
      resolve({ ok: false, reason: "no-window" });
      return;
    }

    const window = BrowserWindow.fromId(record.browserWindowId);
    if (!window || window.isDestroyed()) {
      mcpWindowRecords.delete(record.webContentsId);
      resolve({ ok: false, reason: "no-window" });
      return;
    }

    mcpPendingSelectionCounter += 1;
    const requestId = `mcp-selection-${mcpPendingSelectionCounter}`;
    const timeout = setTimeout(() => {
      finishMcpSelection(requestId, { ok: false, reason: "timeout" });
    }, 5000);

    mcpPendingSelections.set(requestId, {
      resolve,
      timeout,
      webContentsId: record.webContentsId
    });

    try {
      window.webContents.send("mcp:request-selection", { requestId });
    } catch (error) {
      finishMcpSelection(requestId, {
        ok: false,
        reason: "send-failed",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });
}

function rejectPendingMcpSelectionsForWebContents(webContentsId) {
  for (const [requestId, pending] of mcpPendingSelections.entries()) {
    if (pending.webContentsId === webContentsId) {
      finishMcpSelection(requestId, { ok: false, reason: "window-closed" });
    }
  }
}

function rejectAllPendingMcpWrites(reason) {
  for (const pending of mcpPendingWrites.values()) {
    pending.resolve({ applied: false, reason });
  }
  mcpPendingWrites.clear();
}

// Route an already-computed proposed buffer to a resolved window record through the write-confirmation
// pipeline. Shared by every write tool (full replace and the granular in-buffer edits) so they all
// inherit the same busy/no-window handling and the renderer's diff-confirmation (or auto-approve).
function requestReplaceWithMarkdown(record, proposedMarkdown, clientLabel) {
  return new Promise((resolve) => {
    for (const pending of mcpPendingWrites.values()) {
      if (pending.webContentsId === record.webContentsId) {
        resolve({ applied: false, reason: "busy" });
        return;
      }
    }

    const window = BrowserWindow.fromId(record.browserWindowId);
    if (!window || window.isDestroyed()) {
      mcpWindowRecords.delete(record.webContentsId);
      resolve({ applied: false, reason: "no-window" });
      return;
    }

    mcpPendingWriteCounter += 1;
    const requestId = `mcp-write-${mcpPendingWriteCounter}`;
    mcpPendingWrites.set(requestId, {
      resolve,
      webContentsId: record.webContentsId
    });

    try {
      window.webContents.send("mcp:confirm-write", {
        requestId,
        markdown: proposedMarkdown,
        clientLabel: clientLabel || "an MCP client"
      });
    } catch (error) {
      mcpPendingWrites.delete(requestId);
      resolve({
        applied: false,
        reason: "send-failed",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });
}

// Resolve the target window, compute a proposed buffer from its cached Markdown via `computeProposed`
// (a pure function returning `{ ok, markdown }` | `{ ok: false, ... }`), and either route the proposal
// through the confirmation pipeline or report the edit failure to the client (no dialog shown).
function requestComputedWrite(windowId, clientLabel, computeProposed) {
  const record = resolveMcpWindowRecord(windowId);
  if (!record) {
    return Promise.resolve({ applied: false, reason: "no-window" });
  }

  const result = computeProposed(record.markdown ?? "");
  if (!result.ok) {
    return Promise.resolve({ applied: false, reason: "edit-failed", error: result });
  }

  return requestReplaceWithMarkdown(record, result.markdown, clientLabel);
}

mcpServer.setHost({
  listWindows: mcpListWindows,
  getDocument: mcpGetDocument,
  getOutline: mcpGetOutline,
  getSection: mcpGetSection,
  searchDocument: mcpSearchDocument,
  find: mcpFind,
  getSelection: mcpRequestSelection,
  rejectAllPendingWrites: rejectAllPendingMcpWrites,
  requestReplaceDocument: ({ windowId, markdown, clientLabel }) =>
    requestComputedWrite(windowId, clientLabel, () => ({ ok: true, markdown })),
  requestApplyEdits: ({ windowId, edits, clientLabel }) =>
    requestComputedWrite(windowId, clientLabel, (current) =>
      mcpDocumentEdits.applyEdits(current, edits)
    ),
  requestReplaceSection: ({ windowId, selector, markdown, clientLabel }) =>
    requestComputedWrite(windowId, clientLabel, (current) =>
      mcpDocumentEdits.replaceSection(current, selector, markdown)
    ),
  requestSetFrontmatter: ({ windowId, set, remove, clientLabel }) =>
    requestComputedWrite(windowId, clientLabel, (current) =>
      mcpDocumentEdits.setFrontmatter(current, { set, remove })
    )
});

const openableFileExtensions = new Set([".md", ".markdown", ".mdx", ".txt"]);
const admonitionTypes = new Set(["note", "tip", "danger", "info", "caution"]);
const githubAlertTypes = new Set(["note", "tip", "important", "warning", "caution"]);
const fileWatchDebounceMs = 350;
const internalWriteSuppressMs = 1500;
const exportProgressPaintDelayMs = 80;
const exportProgressChannel = "export:progress";
const htmlMermaidPngEnhancementTimeoutMs = 12000;
const htmlMermaidPngCaptureTimeoutMs = 4000;
const defaultExportFontFamily =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const exportFontDefinitions = [
  {
    family: defaultExportFontFamily,
    cssImports: [
      "@fontsource/inter/latin-400.css",
      "@fontsource/inter/latin-400-italic.css",
      "@fontsource/inter/latin-700.css"
    ]
  },
  {
    family: "Roboto, Arial, sans-serif",
    cssImports: [
      "@fontsource/roboto/latin-400.css",
      "@fontsource/roboto/latin-400-italic.css",
      "@fontsource/roboto/latin-700.css"
    ]
  },
  {
    family: '"Open Sans", Arial, sans-serif',
    cssImports: [
      "@fontsource/open-sans/latin-400.css",
      "@fontsource/open-sans/latin-400-italic.css",
      "@fontsource/open-sans/latin-700.css"
    ]
  },
  {
    family: "Lato, Arial, sans-serif",
    cssImports: [
      "@fontsource/lato/latin-400.css",
      "@fontsource/lato/latin-400-italic.css",
      "@fontsource/lato/latin-700.css"
    ]
  },
  {
    family: '"Source Sans 3", Arial, sans-serif',
    cssImports: [
      "@fontsource/source-sans-3/latin-400.css",
      "@fontsource/source-sans-3/latin-400-italic.css",
      "@fontsource/source-sans-3/latin-700.css"
    ]
  },
  { family: '"Segoe UI", Arial, sans-serif', cssImports: [] },
  {
    family: "Merriweather, Georgia, serif",
    cssImports: [
      "@fontsource/merriweather/latin-400.css",
      "@fontsource/merriweather/latin-400-italic.css",
      "@fontsource/merriweather/latin-700.css"
    ]
  },
  {
    family: '"Source Serif 4", Georgia, serif',
    cssImports: [
      "@fontsource/source-serif-4/latin-400.css",
      "@fontsource/source-serif-4/latin-400-italic.css",
      "@fontsource/source-serif-4/latin-700.css"
    ]
  },
  { family: 'Georgia, "Times New Roman", serif', cssImports: [] },
  { family: "Cambria, Georgia, serif", cssImports: [] },
  {
    family: '"JetBrains Mono", "Courier New", monospace',
    cssImports: [
      "@fontsource/jetbrains-mono/latin-400.css",
      "@fontsource/jetbrains-mono/latin-400-italic.css",
      "@fontsource/jetbrains-mono/latin-700.css"
    ]
  },
  {
    family: '"Roboto Mono", "Courier New", monospace',
    cssImports: [
      "@fontsource/roboto-mono/latin-400.css",
      "@fontsource/roboto-mono/latin-400-italic.css",
      "@fontsource/roboto-mono/latin-700.css"
    ]
  },
  { family: 'Consolas, "Courier New", monospace', cssImports: [] },
  { family: '"Courier New", monospace', cssImports: [] }
];
const exportFontFamilies = new Set(exportFontDefinitions.map((definition) => definition.family));
const exportFontCssImportsByFamily = new Map(
  exportFontDefinitions.map((definition) => [definition.family, definition.cssImports])
);
const defaultWordExportFontFamily = "Arial";
const wordExportFontsByFamily = new Map([
  [defaultExportFontFamily, defaultWordExportFontFamily],
  ["Roboto, Arial, sans-serif", defaultWordExportFontFamily],
  ['"Open Sans", Arial, sans-serif', defaultWordExportFontFamily],
  ["Lato, Arial, sans-serif", defaultWordExportFontFamily],
  ['"Source Sans 3", Arial, sans-serif', defaultWordExportFontFamily],
  ['"Segoe UI", Arial, sans-serif', "Segoe UI"],
  ["Merriweather, Georgia, serif", "Georgia"],
  ['"Source Serif 4", Georgia, serif', "Georgia"],
  ['Georgia, "Times New Roman", serif', "Georgia"],
  ["Cambria, Georgia, serif", "Cambria"],
  ['"JetBrains Mono", "Courier New", monospace', "Courier New"],
  ['"Roboto Mono", "Courier New", monospace', "Courier New"],
  ['Consolas, "Courier New", monospace', "Consolas"],
  ['"Courier New", monospace', "Courier New"]
]);
const defaultExportFontSizePixels = 16;
const minExportFontSizePixels = 12;
const maxExportFontSizePixels = 24;
const defaultExportParagraphSpacingPixels = 16;
const minExportParagraphSpacingPixels = 0;
const maxExportParagraphSpacingPixels = 32;
const defaultPdfPageMarginInches = 1;
const minPdfPageMarginInches = 0.25;
const maxPdfPageMarginInches = 2;
const twipsPerInch = 1440;
const pdfPageSizes = new Set(["Letter", "A4"]);
const pdfPageOrientations = new Set(["portrait", "landscape"]);

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
  // Any successful read means this file is now the active document (open dialog, watched
  // re-read, recent-file open, or OS file handoff), so record it in the recent-files list.
  addRecentFile(resolvedFilePath);
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

function resolveLocalImageFilePath(documentPath, imageSource) {
  if (typeof imageSource !== "string") {
    return null;
  }

  const source = imageSource.trim();
  if (!source || source.startsWith("#") || source.startsWith("//")) {
    return null;
  }

  const { imagePath } = splitImageSourceSuffix(source);
  if (!imagePath || imagePath.startsWith("#") || imagePath.startsWith("//")) {
    return null;
  }

  if (/^file:/i.test(imagePath)) {
    try {
      return fileURLToPath(imagePath);
    } catch {
      return null;
    }
  }

  if (hasUrlScheme(imagePath)) {
    return null;
  }

  if (path.isAbsolute(imagePath)) {
    return imagePath;
  }

  if (typeof documentPath !== "string" || documentPath.length === 0) {
    return null;
  }

  return path.resolve(path.dirname(documentPath), imagePath);
}

async function getLocalImageDataUrl(documentPath, imageSource) {
  const imagePath = resolveLocalImageFilePath(documentPath, imageSource);
  if (!imagePath) {
    return null;
  }

  const mimeType = imageMimeTypes.get(path.extname(imagePath).toLowerCase());
  if (!mimeType) {
    return null;
  }

  try {
    return await readFileAsDataUrl(imagePath, mimeType);
  } catch {
    return null;
  }
}

function escapeHtmlAttribute(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
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

function buildFallbackExportHtmlDocument(markdown, currentPath) {
  const title = getDocumentTitleForExport(currentPath);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtmlText(title)}</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
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

    pre {
      white-space: pre-wrap;
      word-break: break-word;
      font-family: "Cascadia Code", "SFMono-Regular", Consolas, monospace;
    }
  </style>
</head>
<body>
  <main>
    <pre>${escapeHtmlText(markdown ?? "")}</pre>
  </main>
</body>
</html>`;
}

function getPdfPageSize(value) {
  return pdfPageSizes.has(value) ? value : "Letter";
}

function getPdfPageOrientation(value) {
  return pdfPageOrientations.has(value) ? value : "portrait";
}

function getExportFontSize(value) {
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minExportFontSizePixels &&
    value <= maxExportFontSizePixels
  ) {
    return value;
  }

  return defaultExportFontSizePixels;
}

function getExportParagraphSpacing(value) {
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minExportParagraphSpacingPixels &&
    value <= maxExportParagraphSpacingPixels
  ) {
    return value;
  }

  return defaultExportParagraphSpacingPixels;
}

function getExportFontFamily(value) {
  return exportFontFamilies.has(value) ? value : defaultExportFontFamily;
}

function getWordExportFontFamily(value) {
  const fontFamily = getExportFontFamily(value);
  const mappedFont = wordExportFontsByFamily.get(fontFamily);
  if (mappedFont) {
    return mappedFont;
  }

  const normalizedFontFamily = fontFamily.toLowerCase();
  if (normalizedFontFamily.includes("monospace")) {
    return "Courier New";
  }
  if (normalizedFontFamily.includes("sans-serif")) {
    return defaultWordExportFontFamily;
  }
  if (normalizedFontFamily.includes("serif")) {
    return "Georgia";
  }

  return defaultWordExportFontFamily;
}

async function readFileAsDataUrl(filePath, mimeType) {
  const data = await fs.readFile(filePath);
  return `data:${mimeType};base64,${data.toString("base64")}`;
}

function getFontAssetMimeType(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".otf":
      return "font/otf";
    case ".ttf":
      return "font/ttf";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

function unquoteCssUrlValue(value) {
  const trimmed = String(value ?? "").trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

async function inlineCssFileUrls(cssText, cssFilePath) {
  const urlPattern = /url\(([^)]+)\)/g;
  let output = "";
  let lastIndex = 0;

  for (const match of cssText.matchAll(urlPattern)) {
    const index = match.index ?? 0;
    output += cssText.slice(lastIndex, index);

    const urlValue = unquoteCssUrlValue(match[1]);
    if (
      !urlValue ||
      urlValue.startsWith("#") ||
      urlValue.startsWith("//") ||
      hasUrlScheme(urlValue)
    ) {
      output += match[0];
    } else {
      const assetPath = path.resolve(path.dirname(cssFilePath), urlValue);
      const dataUrl = await readFileAsDataUrl(assetPath, getFontAssetMimeType(assetPath));
      output += `url("${dataUrl}")`;
    }

    lastIndex = index + match[0].length;
  }

  return `${output}${cssText.slice(lastIndex)}`;
}

async function getExportFontCssImportRules(value, options = {}) {
  const fontFamily = getExportFontFamily(value);
  const cssImports = exportFontCssImportsByFamily.get(fontFamily) ?? [];

  if (!options.inlineAssets) {
    return cssImports
      .map((cssPath) => `@import url("${pathToFileURL(require.resolve(cssPath)).href}");`)
      .join("\n");
  }

  const cssBlocks = [];
  for (const cssPath of cssImports) {
    try {
      const cssFilePath = require.resolve(cssPath);
      const cssText = await fs.readFile(cssFilePath, "utf8");
      cssBlocks.push(await inlineCssFileUrls(cssText, cssFilePath));
    } catch {
      try {
        cssBlocks.push(`@import url("${pathToFileURL(require.resolve(cssPath)).href}");`);
      } catch {
        // Keep export writing even if an optional bundled font package is unavailable.
      }
    }
  }

  return cssBlocks.join("\n");
}

function getPdfPageMargin(value) {
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minPdfPageMarginInches &&
    value <= maxPdfPageMarginInches
  ) {
    return value;
  }

  return defaultPdfPageMarginInches;
}

function getPdfPageMargins(value) {
  const margins = typeof value === "object" && value !== null ? value : {};

  return {
    marginType: "custom",
    top: getPdfPageMargin(margins.top),
    bottom: getPdfPageMargin(margins.bottom),
    left: getPdfPageMargin(margins.left),
    right: getPdfPageMargin(margins.right)
  };
}

function getDocxPageMarginTwips(value) {
  return Math.round(getPdfPageMargin(value) * twipsPerInch);
}

function getDocxPageMargins(value) {
  const margins = typeof value === "object" && value !== null ? value : {};

  return {
    top: getDocxPageMarginTwips(margins.top),
    right: getDocxPageMarginTwips(margins.right),
    bottom: getDocxPageMarginTwips(margins.bottom),
    left: getDocxPageMarginTwips(margins.left)
  };
}

function stripMarkdownFrontmatter(markdown) {
  const source = String(markdown ?? "");
  const frontmatterMatch = source.match(
    /^(?:\uFEFF)?---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/
  );

  if (!frontmatterMatch) {
    return source;
  }

  return source.slice(frontmatterMatch[0].length).replace(/^\r?\n/, "");
}

function getAdmonitionTitle(type, title) {
  if (typeof title === "string" && title.trim().length > 0) {
    return title.trim();
  }

  return `${type.slice(0, 1).toUpperCase()}${type.slice(1)}`;
}

function getAdmonitionClassName(type) {
  return `nexus-export-admonition nexus-export-admonition-${type}`;
}

function isFenceBoundary(line) {
  return /^ {0,3}(`{3,}|~{3,})/.test(line);
}

function getAdmonitionStart(line) {
  const match = line.match(/^:::(note|tip|danger|info|caution)(?:[ \t]+(.+?))?[ \t]*$/);

  if (!match || !admonitionTypes.has(match[1])) {
    return null;
  }

  return {
    type: match[1],
    title: getAdmonitionTitle(match[1], match[2])
  };
}

function isAdmonitionEnd(line) {
  return /^:::[ \t]*$/.test(line);
}

async function renderMarkdownAdmonitions(markdown, parseMarkdown) {
  const source = String(markdown ?? "");
  const lines = source.split(/\r?\n/);
  const output = [];
  let index = 0;
  let isInFence = false;

  while (index < lines.length) {
    const line = lines[index];

    if (isFenceBoundary(line)) {
      isInFence = !isInFence;
      output.push(line);
      index += 1;
      continue;
    }

    if (isInFence) {
      output.push(line);
      index += 1;
      continue;
    }

    const admonition = getAdmonitionStart(line);
    if (!admonition) {
      output.push(line);
      index += 1;
      continue;
    }

    const contentLines = [];
    let endIndex = index + 1;
    let foundEnd = false;

    while (endIndex < lines.length) {
      if (isAdmonitionEnd(lines[endIndex])) {
        foundEnd = true;
        break;
      }

      contentLines.push(lines[endIndex]);
      endIndex += 1;
    }

    if (!foundEnd) {
      output.push(line);
      index += 1;
      continue;
    }

    const contentHtml = await parseMarkdown(contentLines.join("\n"));
    output.push(
      [
        "",
        `<aside class="${getAdmonitionClassName(admonition.type)}">`,
        `<div class="nexus-export-admonition-title">${escapeHtmlText(admonition.title)}</div>`,
        `<div class="nexus-export-admonition-content">`,
        contentHtml.trim(),
        "</div>",
        "</aside>",
        ""
      ].join("\n")
    );
    index = endIndex + 1;
  }

  return output.join("\n");
}

function getGithubAlertClassName(type) {
  // Reuse the admonition aside/title/content classes (so the Word export's extraction works) plus a
  // GitHub-specific colour modifier.
  return `nexus-export-admonition nexus-export-gh-alert-${type}`;
}

function getGithubAlertStart(line) {
  const match = line.match(/^[ \t]*>[ \t]*\[!(note|tip|important|warning|caution)\][ \t]*$/i);

  if (!match) {
    return null;
  }

  const type = match[1].toLowerCase();
  if (!githubAlertTypes.has(type)) {
    return null;
  }

  return {
    type,
    title: `${type.slice(0, 1).toUpperCase()}${type.slice(1)}`
  };
}

function isBlockquoteLine(line) {
  return /^[ \t]*>/.test(line);
}

function stripBlockquoteMarker(line) {
  return line.replace(/^[ \t]*>[ \t]?/, "");
}

/**
 * Turn GitHub alerts (`> [!NOTE]` blockquotes) into the same `<aside>` callout markup the admonition
 * pre-processor emits, so they export as styled callouts instead of literal `[!NOTE]` blockquotes.
 */
async function renderMarkdownGithubAlerts(markdown, parseMarkdown) {
  const source = String(markdown ?? "");
  const lines = source.split(/\r?\n/);
  const output = [];
  let index = 0;
  let isInFence = false;

  while (index < lines.length) {
    const line = lines[index];

    if (isFenceBoundary(line)) {
      isInFence = !isInFence;
      output.push(line);
      index += 1;
      continue;
    }

    if (isInFence) {
      output.push(line);
      index += 1;
      continue;
    }

    const alert = getGithubAlertStart(line);
    if (!alert) {
      output.push(line);
      index += 1;
      continue;
    }

    const contentLines = [];
    let endIndex = index + 1;

    while (endIndex < lines.length && isBlockquoteLine(lines[endIndex])) {
      contentLines.push(stripBlockquoteMarker(lines[endIndex]));
      endIndex += 1;
    }

    const contentHtml = await parseMarkdown(contentLines.join("\n"));
    output.push(
      [
        "",
        `<aside class="${getGithubAlertClassName(alert.type)}">`,
        `<div class="nexus-export-admonition-title">${escapeHtmlText(alert.title)}</div>`,
        `<div class="nexus-export-admonition-content">`,
        contentHtml.trim(),
        "</div>",
        "</aside>",
        ""
      ].join("\n")
    );
    index = endIndex;
  }

  return output.join("\n");
}

async function buildExportHtmlDocument(title, bodyHtml, options = {}) {
  const escapedTitle = escapeHtmlAttribute(title);
  const fontFamily = getExportFontFamily(options.fontFamily);
  const fontCssImportRules = await getExportFontCssImportRules(fontFamily, {
    inlineAssets: options.inlineFontAssets
  });
  const fontSizePixels = getExportFontSize(options.fontSizePixels);
  const paragraphSpacingPixels = getExportParagraphSpacing(options.paragraphSpacingPixels);
  const pdfPrintStyle = options.pdfPrintStyle ?? "";
  const katexCssRules = hasExportMathPlaceholder(bodyHtml)
    ? await getKatexCssRules({ inlineAssets: options.inlineFontAssets })
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapedTitle}</title>
  <style>
${fontCssImportRules}
${katexCssRules}
${pdfPrintStyle}
    :root {
      color-scheme: light;
      font-family: ${fontFamily};
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
      font-size: ${fontSizePixels}px;
    }

    h1, h2, h3, h4, h5, h6 {
      font-weight: 700;
      line-height: 1.25;
      margin: 1.6em 0 0.6em;
    }

    h1 {
      font-size: ${fontSizePixels * 2.375}px;
    }

    h2 {
      font-size: ${fontSizePixels * 1.875}px;
    }

    h3 {
      font-size: ${fontSizePixels * 1.5}px;
    }

    h4 {
      font-size: ${fontSizePixels * 1.25}px;
    }

    h5 {
      font-size: ${fontSizePixels * 1.125}px;
    }

    h6 {
      font-size: ${fontSizePixels}px;
    }

    h1:first-child, h2:first-child, h3:first-child,
    h4:first-child, h5:first-child, h6:first-child {
      margin-top: 0;
    }

    ul, ol, blockquote, pre, table {
      margin: 0 0 1em;
    }

    p {
      margin: 0 0 ${paragraphSpacingPixels}px;
    }

    a {
      color: #075985;
    }

    mark {
      background: #fef08a;
      border-radius: 2px;
      color: inherit;
      padding: 0 0.12em;
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

    .nexus-export-admonition {
      --callout-accent: #6b7280;
      border-left: 3px solid var(--callout-accent);
      margin: 1.2em 0;
      padding: 0.2em 0 0.2em 1em;
    }

    .nexus-export-admonition-title {
      color: var(--callout-accent);
      font-weight: 700;
      margin-bottom: 0.4em;
    }

    .nexus-export-admonition-content > :last-child {
      margin-bottom: 0;
    }

    .nexus-export-admonition-note {
      --callout-accent: #0969da;
    }

    .nexus-export-admonition-tip {
      --callout-accent: #1a7f37;
    }

    .nexus-export-admonition-info {
      --callout-accent: #0e7490;
    }

    .nexus-export-admonition-caution {
      --callout-accent: #9a6700;
    }

    .nexus-export-admonition-danger {
      --callout-accent: #cf222e;
    }

    .nexus-export-gh-alert-note {
      --callout-accent: #0969da;
    }

    .nexus-export-gh-alert-tip {
      --callout-accent: #1a7f37;
    }

    .nexus-export-gh-alert-important {
      --callout-accent: #8250df;
    }

    .nexus-export-gh-alert-warning {
      --callout-accent: #9a6700;
    }

    .nexus-export-gh-alert-caution {
      --callout-accent: #cf222e;
    }

    code {
      background: #f3f4f6;
      border-radius: 4px;
      padding: 0.12em 0.3em;
      font-family: "Cascadia Code", "SFMono-Regular", Consolas, monospace;
      font-size: 0.9em;
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

    .nexus-export-mermaid {
      margin: 1.4em 0;
      max-width: 100%;
      overflow-x: auto;
      text-align: center;
    }

    .nexus-export-mermaid svg,
    .nexus-export-mermaid img {
      display: inline-block;
      max-width: 100%;
      height: auto;
    }

    .nexus-export-mermaid-source {
      margin: 0;
      text-align: left;
    }

    .nexus-export-mermaid-error {
      border: 1px solid #fecaca;
      border-radius: 6px;
      background: #fff7f7;
      color: #991b1b;
      padding: 1em;
      text-align: left;
    }

    .nexus-export-mermaid-error strong {
      display: block;
      margin-bottom: 0.5em;
    }

    .nexus-export-mermaid-error pre {
      margin: 0;
      border-color: #fecaca;
      background: #fffafa;
      white-space: pre-wrap;
    }

    .nexus-export-math {
      margin: 1.4em 0;
      max-width: 100%;
      overflow-x: auto;
      text-align: center;
    }

    .nexus-export-math .katex-display {
      margin: 0;
    }

    .nexus-export-math img {
      display: inline-block;
      max-width: 100%;
      height: auto;
    }

    .nexus-export-math-error {
      border: 1px solid #fecaca;
      border-radius: 6px;
      background: #fff7f7;
      color: #991b1b;
      padding: 1em;
      text-align: left;
    }

    .nexus-export-math-error strong {
      display: block;
      margin-bottom: 0.5em;
    }

    .nexus-export-math-error pre {
      margin: 0;
      border-color: #fecaca;
      background: #fffafa;
      white-space: pre-wrap;
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

function getCodeTokenLanguage(token) {
  return String(token?.lang ?? "")
    .trim()
    .split(/\s+/)[0]
    .toLowerCase();
}

function isMermaidFence(language) {
  return String(language ?? "").trim().toLowerCase() === "mermaid";
}

function isMathFence(language) {
  return String(language ?? "").trim().toLowerCase() === "math";
}

function renderExportMathBlockHtml(source) {
  const katex = require("katex");
  try {
    const html = katex.renderToString(String(source ?? ""), {
      displayMode: true,
      throwOnError: true,
      output: "htmlAndMathml",
      strict: "ignore"
    });
    return `<figure class="nexus-export-math">${html}</figure>`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [
      `<figure class="nexus-export-math nexus-export-math-error">`,
      `<strong>Math render error</strong>`,
      `<pre>${escapeHtmlText(message)}</pre>`,
      `<pre>${escapeHtmlText(source)}</pre>`,
      `</figure>`
    ].join("");
  }
}

function hasExportMathPlaceholder(html) {
  return typeof html === "string" && html.includes('class="nexus-export-math');
}

async function getKatexCssRules(options = {}) {
  const cssPath = require.resolve("katex/dist/katex.min.css");
  if (!options.inlineAssets) {
    return `@import url("${pathToFileURL(cssPath).href}");`;
  }

  try {
    const cssText = await fs.readFile(cssPath, "utf8");
    return await inlineCssFileUrls(cssText, cssPath);
  } catch {
    return `@import url("${pathToFileURL(cssPath).href}");`;
  }
}

function renderExportCodeBlockWithLineBreaks(token) {
  const language = getCodeTokenLanguage(token);
  const className = language ? ` class="language-${escapeHtmlAttribute(language)}"` : "";
  const codeText = String(token?.text ?? "").replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  const escapedCode = token?.escaped ? codeText : escapeHtmlText(codeText);
  const codeWithBreaks = escapedCode.replace(/\n/g, "<br />");
  return `<pre><code${className}>${codeWithBreaks}</code></pre>\n`;
}

function inlineWordMarkHighlightStyles(html) {
  return String(html ?? "").replace(
    /<mark\b((?:"[^"]*"|'[^']*'|[^'">])*)>/gi,
    (match, attributes) => {
      if (/\sstyle\s*=/i.test(attributes)) {
        return match.replace(
          /(\sstyle\s*=\s*)(["'])([\s\S]*?)\2/i,
          (styleMatch, prefix, quote, styleValue) => {
            if (/(^|;)\s*background(?:-color)?\s*:/i.test(styleValue)) {
              return styleMatch;
            }

            const separator = styleValue.trim().endsWith(";") || !styleValue.trim() ? "" : ";";
            return `${prefix}${quote}${styleValue}${separator} background-color: #ffff00;${quote}`;
          }
        );
      }

      return `<mark${attributes} style="background-color: #ffff00;">`;
    }
  );
}

function inlineWordTableHeaderStyles(html) {
  return String(html ?? "").replace(/<thead\b[\s\S]*?<\/thead>/gi, (theadHtml) =>
    theadHtml.replace(/<tr\b((?:"[^"]*"|'[^']*'|[^'">])*)>/i, (match, attributes) => {
      if (/\sstyle\s*=/i.test(attributes)) {
        return match.replace(
          /(\sstyle\s*=\s*)(["'])([\s\S]*?)\2/i,
          (styleMatch, prefix, quote, styleValue) => {
            if (/(^|;)\s*font-weight\s*:/i.test(styleValue)) {
              return styleMatch;
            }

            const separator = styleValue.trim().endsWith(";") || !styleValue.trim() ? "" : ";";
            return `${prefix}${quote}${styleValue}${separator} font-weight: bold;${quote}`;
          }
        );
      }

      return `<tr${attributes} style="font-weight: bold;">`;
    })
  );
}

function getWordAsideSectionHtml(content, className) {
  const match = String(content ?? "").match(
    new RegExp(
      `<div\\b(?=[^>]*\\bclass\\s*=\\s*["'][^"']*\\b${className}\\b)[^>]*>([\\s\\S]*?)<\\/div>`,
      "i"
    )
  );
  return match ? match[1].trim() : "";
}

function getWordAsideTableCellHtml(content) {
  const source = String(content ?? "").trim();
  const titleHtml = getWordAsideSectionHtml(source, "nexus-export-admonition-title");
  const bodyHtml = getWordAsideSectionHtml(source, "nexus-export-admonition-content");

  if (titleHtml || bodyHtml) {
    return `${titleHtml ? `<p><strong>${titleHtml}</strong></p>` : ""}${bodyHtml}`;
  }

  return source;
}

function convertWordAsidesToSingleCellTables(html) {
  return String(html ?? "").replace(
    /<aside\b((?:"[^"]*"|'[^']*'|[^'">])*)>([\s\S]*?)<\/aside>/gi,
    (_match, attributes, content) =>
      `<table${attributes}><tbody><tr><td>${getWordAsideTableCellHtml(content)}</td></tr></tbody></table>`
  );
}

function unwrapWordMainContainer(html) {
  return String(html ?? "")
    .replace(/(<body\b[^>]*>)\s*<main\b[^>]*>\s*/i, "$1")
    .replace(/\s*<\/main>\s*(<\/body>)/i, "$1");
}

function removeWordExportDoctype(html) {
  return String(html ?? "").replace(/^\s*<!doctype[^>]*>\s*/i, "");
}

function hasExportMermaidPlaceholder(html) {
  return typeof html === "string" && html.includes('<figure class="nexus-export-mermaid"');
}

function createMarkedHighlightExtension() {
  return {
    name: "highlight",
    level: "inline",
    start(source) {
      return source.match(/==/)?.index;
    },
    tokenizer(source) {
      const match = /^==(?![=])(?=\S)([\s\S]*?\S)==(?!=)/.exec(source);
      if (!match) {
        return undefined;
      }

      return {
        type: "highlight",
        raw: match[0],
        text: match[1],
        tokens: this.lexer.inlineTokens(match[1])
      };
    },
    renderer(token) {
      const inner = this.parser.parseInline(token.tokens);
      return `<mark>${inner}</mark>`;
    }
  };
}

function createExportWindow() {
  return new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: false
    }
  });
}

// The host page embeds the bundled drawio web app in an iframe in embed mode (the query string and
// iframe live in public/drawio-host.html); the pure session in drawioEmbed.cjs handles the
// resulting init/save/export/exit messages relayed by drawioPreload.cjs.
function loadDrawioEditor(editorWindow) {
  if (isDev) {
    // Vite serves everything under public/ at the web root, so public/drawio-host.html is here.
    return editorWindow.loadURL(new URL("drawio-host.html", process.env.NEXUS_DEV_SERVER_URL).toString());
  }
  // Packaged: public/ was copied to dist/ at build time. The host page (and the drawio app it
  // iframes) are unpacked from the asar — see build.asarUnpack — so drawio's many sub-resources and
  // workers load over file://.
  return editorWindow.loadFile(path.join(__dirname, "..", "dist", "drawio-host.html"));
}

// Shown in the editor window when the drawio web app cannot be loaded — almost always because it
// was never vendored — instead of letting the window flash open and closed with no explanation.
function buildDrawioErrorHtml(detail) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Diagram editor unavailable</title></head>
<body style="font-family: system-ui, -apple-system, sans-serif; padding: 2rem; color: #1f2937; line-height: 1.5;">
<h2 style="margin-top:0;">Diagram editor could not load</h2>
<p>The bundled drawio web app is missing or failed to load. From the project root, run:</p>
<pre style="background:#f3f4f6;padding:0.75rem 1rem;border-radius:6px;">npm run fetch:drawio</pre>
<p>then rebuild and try again. You can close this window.</p>
<p style="color:#6b7280;font-size:0.85rem;">Details: ${escapeHtmlText(String(detail || "unknown error"))}</p>
</body></html>`;
}

// Opens the bundled drawio editor in a modal window over `parentWindow`, loads `initialXml` (empty
// for a new diagram), and resolves when the user saves (with an editable-SVG data URL) or cancels
// by closing the window. The embed protocol is driven by the pure session in drawioEmbed.cjs; this
// function owns only the window lifecycle and the IPC relay to/from drawioPreload.cjs.
function openDrawioEditor(parentWindow, initialXml) {
  return new Promise((resolve) => {
    const session = createDrawioSession(initialXml);
    const hasParent = Boolean(parentWindow && !parentWindow.isDestroyed());
    const editorWindow = new BrowserWindow({
      parent: hasParent ? parentWindow : undefined,
      modal: hasParent,
      width: 1200,
      height: 820,
      minWidth: 800,
      minHeight: 600,
      title: "Edit diagram",
      backgroundColor: "#ffffff",
      autoHideMenuBar: true,
      icon: getAppIconPath(),
      webPreferences: {
        preload: path.join(__dirname, "drawioPreload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        webSecurity: false
      }
    });

    let settled = false;
    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      ipcMain.removeListener("drawio:from-editor", onFromEditor);
      if (!editorWindow.isDestroyed()) {
        editorWindow.destroy();
      }
      resolve(result);
    };

    function onFromEditor(event, raw) {
      // Scope to this window's editor so multiple diagram editors can be open at once.
      if (event.sender !== editorWindow.webContents) {
        return;
      }
      let message;
      try {
        message = JSON.parse(raw);
      } catch {
        return;
      }
      const { reply, result } = session.handleMessage(message);
      if (reply && !editorWindow.isDestroyed()) {
        editorWindow.webContents.send("drawio:to-editor", JSON.stringify(reply));
      }
      if (result) {
        finish(result);
      }
    }

    ipcMain.on("drawio:from-editor", onFromEditor);
    // Closing the window (the cancel affordance) resolves as canceled; a successful save resolves
    // first and destroys the window, so this becomes a no-op via the settled guard.
    editorWindow.on("closed", () => finish({ canceled: true }));

    // Surface the drawio app's own console output while debugging the embed protocol.
    editorWindow.webContents.on("console-message", (...args) => {
      const details = args[0];
      const message =
        details && typeof details === "object" && "message" in details ? details.message : args[2];
      debugLog("[drawio editor]", message);
    });

    // A genuine load failure (most often: the drawio web app was never vendored — run
    // `npm run fetch:drawio`) should explain itself in the window rather than flash closed. The
    // window stays open with the message; the user closes it, which resolves as canceled.
    editorWindow.webContents.on(
      "did-fail-load",
      (_event, errorCode, errorDescription, _validatedUrl, isMainFrame) => {
        // ERR_ABORTED (-3) is benign: drawio navigates in-page while booting, aborting the initial
        // load even though the editor is fine. Only treat real main-frame failures as errors.
        if (!isMainFrame || errorCode === -3 || settled || editorWindow.isDestroyed()) {
          return;
        }
        console.error(`drawio editor failed to load (${errorCode}): ${errorDescription}`);
        void editorWindow.loadURL(
          `data:text/html;charset=utf-8,${encodeURIComponent(buildDrawioErrorHtml(errorDescription))}`
        );
      }
    );

    // drawio's in-page boot navigation rejects the initial load promise with ERR_ABORTED even on
    // success, so do NOT close the window here; real failures are handled by did-fail-load above.
    loadDrawioEditor(editorWindow).catch((error) => {
      if (error && (error.code === "ERR_ABORTED" || error.errno === -3)) {
        return;
      }
      console.error("Failed to load the drawio editor:", error);
    });
  });
}

// The isoflow editor host is Nexus's own React app (isoflow-host.html), bundled by Vite as a separate
// page — not a vendored web app. In dev it is served by Vite at the web root; when packaged it sits
// in dist/ alongside the main editor. Both load over the normal page graph (no asar-unpack needed).
function loadIsoflowEditor(editorWindow) {
  if (isDev) {
    return editorWindow.loadURL(new URL("isoflow-host.html", process.env.NEXUS_DEV_SERVER_URL).toString());
  }
  return editorWindow.loadFile(path.join(__dirname, "..", "dist", "isoflow-host.html"));
}

// Shown in the editor window when the isoflow host page cannot load (e.g. a bundle/runtime error)
// instead of letting the window flash open and closed with no explanation.
function buildIsoflowErrorHtml(detail) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Diagram editor unavailable</title></head>
<body style="font-family: system-ui, -apple-system, sans-serif; padding: 2rem; color: #1f2937; line-height: 1.5;">
<h2 style="margin-top:0;">isoflow editor could not load</h2>
<p>The isoflow editor failed to start. Try rebuilding the app (<code>npm run build</code>) and reopening; you can close this window.</p>
<p style="color:#6b7280;font-size:0.85rem;">Details: ${escapeHtmlText(String(detail || "unknown error"))}</p>
</body></html>`;
}

// Opens the isoflow editor in a modal window over `parentWindow`, seeded with `initialModel` (null
// for a new diagram), and resolves when the user saves (with an editable-SVG data URL + the source
// model) or cancels by closing the window. Unlike drawio there is no postMessage protocol: the host
// is our own React app talking over the `nexusIsoflowHost` preload bridge (electron/isoflowPreload.cjs).
function openIsoflowEditor(parentWindow, initialModel) {
  return new Promise((resolve) => {
    const hasParent = Boolean(parentWindow && !parentWindow.isDestroyed());
    const editorWindow = new BrowserWindow({
      parent: hasParent ? parentWindow : undefined,
      modal: hasParent,
      width: ISOFLOW_WINDOW.width,
      height: ISOFLOW_WINDOW.height,
      minWidth: ISOFLOW_WINDOW.minWidth,
      minHeight: ISOFLOW_WINDOW.minHeight,
      title: "Edit isoflow diagram",
      backgroundColor: "#ffffff",
      autoHideMenuBar: true,
      icon: getAppIconPath(),
      webPreferences: {
        preload: path.join(__dirname, "isoflowPreload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        webSecurity: false
      }
    });

    let settled = false;
    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      ipcMain.removeListener("isoflow:ready", onReady);
      ipcMain.removeListener("isoflow:save", onSave);
      ipcMain.removeListener("isoflow:cancel", onCancel);
      if (!editorWindow.isDestroyed()) {
        editorWindow.destroy();
      }
      resolve(result);
    };

    // Scope every IPC message to this window's host so multiple isoflow editors can be open at once.
    const isFromThisWindow = (event) => event.sender === editorWindow.webContents;

    function onReady(event) {
      if (!isFromThisWindow(event) || editorWindow.isDestroyed()) {
        return;
      }
      editorWindow.webContents.send("isoflow:init", initialModel ?? null);
    }
    function onSave(event, raw) {
      if (!isFromThisWindow(event)) {
        return;
      }
      const result = normalizeSaveResult(raw);
      if (result) {
        finish(result);
      }
    }
    function onCancel(event) {
      if (!isFromThisWindow(event)) {
        return;
      }
      finish({ canceled: true });
    }

    ipcMain.on("isoflow:ready", onReady);
    ipcMain.on("isoflow:save", onSave);
    ipcMain.on("isoflow:cancel", onCancel);
    // Closing the window resolves as canceled; a successful save resolves first and destroys the
    // window, so this becomes a no-op via the settled guard.
    editorWindow.on("closed", () => finish({ canceled: true }));

    editorWindow.webContents.on("console-message", (...args) => {
      const details = args[0];
      const message =
        details && typeof details === "object" && "message" in details ? details.message : args[2];
      debugLog("[isoflow editor]", message);
    });

    editorWindow.webContents.on(
      "did-fail-load",
      (_event, errorCode, errorDescription, _validatedUrl, isMainFrame) => {
        // ERR_ABORTED (-3) is benign (HMR / in-page navigation). Only surface real main-frame failures.
        if (!isMainFrame || errorCode === -3 || settled || editorWindow.isDestroyed()) {
          return;
        }
        console.error(`isoflow editor failed to load (${errorCode}): ${errorDescription}`);
        void editorWindow.loadURL(
          `data:text/html;charset=utf-8,${encodeURIComponent(buildIsoflowErrorHtml(errorDescription))}`
        );
      }
    );

    loadIsoflowEditor(editorWindow).catch((error) => {
      if (error && (error.code === "ERR_ABORTED" || error.errno === -3)) {
        return;
      }
      console.error("Failed to load the isoflow editor:", error);
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout(promise, timeoutMs, description) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${description} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

// Drives the in-app export progress modal while a long export runs. Instead of opening a native
// progress window, we tell the renderer to show its own styled dialog (ExportProgressDialog), so the
// waiting UI matches the rest of the app. Callers always show the save dialog BEFORE invoking this, so
// the modal never overlaps file picking.
async function withExportProgress(parentWindow, title, message, task) {
  const hasWindow = parentWindow && !parentWindow.isDestroyed();
  if (hasWindow) {
    parentWindow.webContents.send(exportProgressChannel, { active: true, title, message });
  }

  try {
    // Give the renderer a beat to paint the modal before the main process gets busy rendering.
    await delay(exportProgressPaintDelayMs);
    return await task();
  } finally {
    if (parentWindow && !parentWindow.isDestroyed()) {
      parentWindow.webContents.send(exportProgressChannel, { active: false });
    }
  }
}

async function loadExportHtml(exportWindow, html) {
  await exportWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

async function loadExportHtmlFromTemporaryFile(exportWindow, html) {
  const tempDirectory = await fs.mkdtemp(path.join(app.getPath("temp"), "nexus-export-"));
  const tempFilePath = path.join(tempDirectory, "export.html");

  try {
    await fs.writeFile(tempFilePath, html, "utf8");
    await exportWindow.loadFile(tempFilePath);
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true }).catch(() => {});
  }
}

async function renderExportMermaidDiagrams(webContents, options = {}) {
  const mermaidScriptUrl = pathToFileURL(require.resolve("mermaid/dist/mermaid.min.js")).href;
  const diagramsAsImages = Boolean(options.diagramsAsImages);

  await webContents.executeJavaScript(
    `
      (async () => {
        const diagrams = Array.from(document.querySelectorAll(".nexus-export-mermaid"));

        if (diagrams.length === 0) {
          return;
        }

        await new Promise((resolve, reject) => {
          if (window.mermaid) {
            resolve();
            return;
          }

          const script = document.createElement("script");
          script.src = ${JSON.stringify(mermaidScriptUrl)};
          script.dataset.nexusExportMermaidScript = "true";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Mermaid export renderer could not be loaded."));
          document.head.appendChild(script);
        });

        window.mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "default"
        });

        const diagramsAsImages = ${JSON.stringify(diagramsAsImages)};
        const textToBase64 = (text) => {
          const bytes = new TextEncoder().encode(text);
          let binary = "";
          const chunkSize = 0x8000;
          for (let index = 0; index < bytes.length; index += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
          }
          return btoa(binary);
        };
        const parseSvgSize = (svgText) => {
          const wrapper = document.createElement("div");
          wrapper.innerHTML = svgText;
          const svg = wrapper.querySelector("svg");
          if (!svg) {
            return {};
          }

          const parseLength = (value) => {
            const match = String(value ?? "").match(/^([0-9]+(?:\\.[0-9]+)?)/);
            return match ? Number(match[1]) : null;
          };
          let width = parseLength(svg.getAttribute("width"));
          let height = parseLength(svg.getAttribute("height"));

          if ((!width || !height) && svg.getAttribute("viewBox")) {
            const parts = svg.getAttribute("viewBox").trim().split(/[\\s,]+/).map(Number);
            if (parts.length === 4 && parts.every(Number.isFinite)) {
              width = width || parts[2];
              height = height || parts[3];
            }
          }

          return {
            width: width && width > 0 ? Math.round(width) : null,
            height: height && height > 0 ? Math.round(height) : null
          };
        };

        for (const [index, diagram] of diagrams.entries()) {
          const source = diagram.querySelector(".nexus-export-mermaid-source")?.textContent ?? "";

          if (!source.trim()) {
            continue;
          }

          try {
            const result = await window.mermaid.render(
              \`nexus-export-mermaid-\${Date.now()}-\${index}\`,
              source
            );
            diagram.classList.add("nexus-export-mermaid-rendered");
            if (diagramsAsImages) {
              const image = document.createElement("img");
              const size = parseSvgSize(result.svg);
              image.src = \`data:image/svg+xml;base64,\${textToBase64(result.svg)}\`;
              image.alt = result.diagramType
                ? \`Mermaid \${result.diagramType} diagram\`
                : "Mermaid diagram";
              if (size.width) {
                image.width = size.width;
              }
              if (size.height) {
                image.height = size.height;
              }
              diagram.replaceChildren(image);
            } else {
              diagram.innerHTML = result.svg;
            }
          } catch (error) {
            const title = document.createElement("strong");
            const details = document.createElement("pre");
            title.textContent = "Mermaid render error";
            details.textContent = error instanceof Error ? error.message : String(error);
            diagram.classList.add("nexus-export-mermaid-error");
            diagram.replaceChildren(title, details);
          }
        }

        document.querySelector("[data-nexus-export-mermaid-script]")?.remove();
        await document.fonts?.ready;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      })();
    `,
    true
  );
}

async function replaceRenderedMermaidDiagramsWithPngImages(exportWindow) {
  const webContents = exportWindow.webContents;
  const diagramCount = await webContents.executeJavaScript(
    `
      (() => {
        const diagrams = Array.from(document.querySelectorAll(".nexus-export-mermaid-rendered"));
        for (const [index, diagram] of diagrams.entries()) {
          diagram.dataset.nexusExportMermaidIndex = String(index);
        }
        return diagrams.length;
      })();
    `,
    true
  );

  if (!Number.isInteger(diagramCount) || diagramCount <= 0) {
    return;
  }

  const originalContentSize = exportWindow.getContentSize();

  try {
    for (let index = 0; index < diagramCount; index += 1) {
      const measurement = await webContents.executeJavaScript(
        `
          (() => {
            const diagram = document.querySelector('[data-nexus-export-mermaid-index="${index}"]');
            const svg = diagram?.querySelector("svg");
            if (!diagram || !svg) {
              return null;
            }

            const diagramRect = diagram.getBoundingClientRect();
            const svgRect = svg.getBoundingClientRect();
            const title = svg.querySelector(":scope > title")?.textContent?.trim() ?? "";
            const desc = svg.querySelector(":scope > desc")?.textContent?.trim() ?? "";

            return {
              width: Math.ceil(Math.max(diagramRect.width, svgRect.width)),
              height: Math.ceil(Math.max(diagramRect.height, svgRect.height)),
              alt: desc || title || "Mermaid diagram"
            };
          })();
        `,
        true
      );

      if (!measurement || measurement.width <= 0 || measurement.height <= 0) {
        continue;
      }

      const contentWidth = Math.max(800, Math.min(4096, measurement.width + 96));
      const contentHeight = Math.max(600, Math.min(4096, measurement.height + 96));
      exportWindow.setContentSize(contentWidth, contentHeight);

      const captureRect = await webContents.executeJavaScript(
        `
          (async () => {
            const diagram = document.querySelector('[data-nexus-export-mermaid-index="${index}"]');
            if (!diagram) {
              return null;
            }

            diagram.scrollIntoView({ block: "center", inline: "center" });
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

            const rect = diagram.getBoundingClientRect();
            const left = Math.max(0, Math.floor(rect.left));
            const top = Math.max(0, Math.floor(rect.top));
            const width = Math.max(1, Math.ceil(Math.min(rect.width, window.innerWidth - left)));
            const height = Math.max(1, Math.ceil(Math.min(rect.height, window.innerHeight - top)));

            return {
              left,
              top,
              width,
              height,
              viewportWidth: window.innerWidth,
              viewportHeight: window.innerHeight
            };
          })();
        `,
        true
      );

      if (
        !captureRect ||
        captureRect.width <= 0 ||
        captureRect.height <= 0 ||
        captureRect.viewportWidth <= 0 ||
        captureRect.viewportHeight <= 0
      ) {
        continue;
      }

      const image = await withTimeout(
        webContents.capturePage(
          {
            x: captureRect.left,
            y: captureRect.top,
            width: captureRect.width,
            height: captureRect.height
          },
          { stayHidden: true }
        ),
        htmlMermaidPngCaptureTimeoutMs,
        "Mermaid PNG capture"
      );
      const pngDataUrl = `data:image/png;base64,${image.toPNG().toString("base64")}`;
      const replacement = {
        index,
        src: pngDataUrl,
        alt: measurement.alt,
        width: Math.round(captureRect.width),
        height: Math.round(captureRect.height)
      };

      await webContents.executeJavaScript(
        `
          (() => {
            const replacement = ${JSON.stringify(replacement)};
            const diagram = document.querySelector(
              \`[data-nexus-export-mermaid-index="\${replacement.index}"]\`
            );
            if (!diagram) {
              return false;
            }

            const image = document.createElement("img");
            image.src = replacement.src;
            image.alt = replacement.alt;
            image.width = replacement.width;
            image.height = replacement.height;
            diagram.classList.add("nexus-export-mermaid-png");
            diagram.replaceChildren(image);
            return true;
          })();
        `,
        true
      );
    }
  } finally {
    exportWindow.setContentSize(originalContentSize[0], originalContentSize[1]);
  }
}

async function serializeRenderedExportHtml(webContents) {
  const html = await webContents.executeJavaScript("document.documentElement.outerHTML", true);
  return `<!doctype html>\n${html}`;
}

async function renderMermaidPngImagesInExportHtml(html) {
  if (!hasExportMermaidPlaceholder(html)) {
    return html;
  }

  let exportWindow;
  try {
    exportWindow = createExportWindow();
    await withTimeout(
      loadExportHtmlFromTemporaryFile(exportWindow, html),
      htmlMermaidPngEnhancementTimeoutMs,
      "HTML export page load"
    );
    await withTimeout(
      renderExportMermaidDiagrams(exportWindow.webContents),
      htmlMermaidPngEnhancementTimeoutMs,
      "Mermaid diagram render"
    );
    await withTimeout(
      replaceRenderedMermaidDiagramsWithPngImages(exportWindow),
      htmlMermaidPngEnhancementTimeoutMs,
      "Mermaid PNG replacement"
    );
    return await withTimeout(
      serializeRenderedExportHtml(exportWindow.webContents),
      htmlMermaidPngEnhancementTimeoutMs,
      "HTML export serialization"
    );
  } finally {
    if (exportWindow && !exportWindow.isDestroyed()) {
      exportWindow.destroy();
    }
  }
}

async function renderMermaidInExportHtml(html, options = {}) {
  if (!hasExportMermaidPlaceholder(html)) {
    return html;
  }

  let exportWindow;
  try {
    exportWindow = createExportWindow();
    if (options.loadFromTemporaryFile) {
      await loadExportHtmlFromTemporaryFile(exportWindow, html);
    } else {
      await loadExportHtml(exportWindow, html);
    }
    await renderExportMermaidDiagrams(exportWindow.webContents, options);
    return serializeRenderedExportHtml(exportWindow.webContents);
  } finally {
    if (exportWindow && !exportWindow.isDestroyed()) {
      exportWindow.destroy();
    }
  }
}

async function renderMarkdownSelfContainedHtml(markdown, currentPath, options = {}) {
  const html = await renderMarkdownExportHtml(markdown, currentPath, {
    excludeFrontmatter: true,
    fontFamily: options.fontFamily,
    fontSizePixels: options.fontSizePixels,
    inlineFontAssets: true,
    inlineLocalImages: true,
    paragraphSpacingPixels: options.paragraphSpacingPixels
  });

  // Use the same timeout-guarded Mermaid PNG enhancement that HTML export relies on. The older
  // inline-SVG path had no timeout and could hang the hidden render window indefinitely, which
  // stalled publishing for any document containing a Mermaid diagram.
  return tryEnhanceExportHtmlWithMermaidPngs(
    html,
    "Publish kept baseline HTML after Mermaid enhancement failure"
  );
}

async function renderMarkdownExportHtml(markdown, currentPath, options = {}) {
  const { Marked, Renderer } = await import("marked");
  const renderer = new Renderer();
  const defaultCodeRenderer = renderer.code.bind(renderer);

  renderer.image = (token) => {
    const src = resolveImagePreviewSource(currentPath, token.href);
    const title = token.title ? ` title="${escapeHtmlAttribute(token.title)}"` : "";
    return `<img src="${escapeHtmlAttribute(src)}" alt="${escapeHtmlAttribute(token.text)}"${title}>`;
  };

  renderer.code = function (token) {
    const language = getCodeTokenLanguage(token);
    if (isMathFence(language)) {
      return renderExportMathBlockHtml(token.text);
    }
    if (!isMermaidFence(language)) {
      return options.codeBlockNewlinesAsBreaks
        ? renderExportCodeBlockWithLineBreaks(token)
        : defaultCodeRenderer(token);
    }
    return [
      `<figure class="nexus-export-mermaid">`,
      `<pre class="nexus-export-mermaid-source">${escapeHtmlText(token.text)}</pre>`,
      "</figure>"
    ].join("");
  };

  // Give every heading a GitHub-style id slug so in-document table-of-contents links
  // (`[Heading](#slug)`) resolve in exported and published HTML. One slugger instance per render
  // assigns slugs in document order, keeping dedupe (`-1`, `-2`, ...) aligned with the renderer-side
  // TOC builder in `src/lib/toc.ts`. Slugs only contain `[\p{L}\p{N}_-]`, so they are attribute-safe.
  const slugHeadingId = headingSlugger.createHeadingSlugger();
  renderer.heading = function (token) {
    const id = slugHeadingId(token.text);
    const text = this.parser.parseInline(token.tokens);
    return `<h${token.depth} id="${escapeHtmlAttribute(id)}">${text}</h${token.depth}>\n`;
  };

  const marked = new Marked({
    async: true,
    breaks: false,
    extensions: [createMarkedHighlightExtension()],
    gfm: true,
    renderer,
    walkTokens: options.inlineLocalImages
      ? async (token) => {
          if (token?.type !== "image" || typeof token.href !== "string") {
            return;
          }

          const dataUrl = await getLocalImageDataUrl(currentPath, token.href);
          if (dataUrl) {
            token.href = dataUrl;
          }
        }
      : null
  });
  const sourceMarkdown = options.excludeFrontmatter
    ? stripMarkdownFrontmatter(markdown)
    : markdown ?? "";
  const markdownWithAlerts = await renderMarkdownGithubAlerts(
    sourceMarkdown,
    (content) => marked.parse(content)
  );
  const markdownWithAdmonitions = await renderMarkdownAdmonitions(
    markdownWithAlerts,
    (content) => marked.parse(content)
  );
  const bodyHtml = await marked.parse(markdownWithAdmonitions);
  return buildExportHtmlDocument(getDocumentTitleForExport(currentPath), bodyHtml, {
    fontFamily: options.fontFamily,
    fontSizePixels: options.fontSizePixels,
    paragraphSpacingPixels: options.paragraphSpacingPixels,
    inlineFontAssets: options.inlineFontAssets,
    pdfPrintStyle: options.pdfPrintStyle
  });
}

async function showExportErrorForWindow(window, format, error) {
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

async function showExportError(event, format, error) {
  await showExportErrorForWindow(BrowserWindow.fromWebContents(event.sender), format, error);
}

async function showPublishErrorForWindow(window, detail) {
  const options = {
    type: "error",
    title: "Publish Failed",
    message: "Nexus could not publish this document to the SFTP server.",
    detail: detail || "The document could not be published."
  };

  if (window && !window.isDestroyed()) {
    await dialog.showMessageBox(window, options);
  } else {
    await dialog.showMessageBox(options);
  }
}

async function showSaveDialogForWindow(window, options) {
  if (window && !window.isDestroyed()) {
    return dialog.showSaveDialog(window, options);
  }

  return dialog.showSaveDialog(options);
}

async function renderBaselineExportHtml(markdown, currentPath, options = {}) {
  return renderMarkdownExportHtml(markdown, currentPath, {
    codeBlockNewlinesAsBreaks: options?.codeBlockNewlinesAsBreaks,
    excludeFrontmatter: true,
    fontFamily: options?.fontFamily,
    fontSizePixels: options?.fontSizePixels,
    inlineLocalImages: true,
    paragraphSpacingPixels: options?.paragraphSpacingPixels
  });
}

async function tryEnhanceExportHtmlWithMermaidPngs(html, warningContext) {
  if (!hasExportMermaidPlaceholder(html)) {
    return html;
  }

  try {
    return await renderMermaidPngImagesInExportHtml(html);
  } catch (enhanceError) {
    const message = enhanceError instanceof Error ? enhanceError.message : String(enhanceError);
    console.warn(`${warningContext}: ${message}`);
    return html;
  }
}

async function replaceRenderedMathBlocksWithPngImages(exportWindow) {
  const webContents = exportWindow.webContents;
  const blockCount = await webContents.executeJavaScript(
    `
      (() => {
        const blocks = Array.from(
          document.querySelectorAll(".nexus-export-math:not(.nexus-export-math-error)")
        );
        for (const [index, block] of blocks.entries()) {
          block.dataset.nexusExportMathIndex = String(index);
        }
        return blocks.length;
      })();
    `,
    true
  );

  if (!Number.isInteger(blockCount) || blockCount <= 0) {
    return;
  }

  const originalContentSize = exportWindow.getContentSize();

  try {
    for (let index = 0; index < blockCount; index += 1) {
      const measurement = await webContents.executeJavaScript(
        `
          (() => {
            const block = document.querySelector('[data-nexus-export-math-index="${index}"]');
            if (!block) {
              return null;
            }
            const blockRect = block.getBoundingClientRect();
            const katex =
              block.querySelector(".katex-display") ||
              block.querySelector(".katex") ||
              block;
            const katexRect = katex.getBoundingClientRect();
            return {
              width: Math.ceil(Math.max(blockRect.width, katexRect.width)),
              height: Math.ceil(Math.max(blockRect.height, katexRect.height)),
              alt: "Math equation"
            };
          })();
        `,
        true
      );

      if (!measurement || measurement.width <= 0 || measurement.height <= 0) {
        continue;
      }

      const contentWidth = Math.max(800, Math.min(4096, measurement.width + 96));
      const contentHeight = Math.max(600, Math.min(4096, measurement.height + 96));
      exportWindow.setContentSize(contentWidth, contentHeight);

      const captureRect = await webContents.executeJavaScript(
        `
          (async () => {
            const block = document.querySelector('[data-nexus-export-math-index="${index}"]');
            if (!block) {
              return null;
            }
            block.scrollIntoView({ block: "center", inline: "center" });
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const rect = block.getBoundingClientRect();
            const left = Math.max(0, Math.floor(rect.left));
            const top = Math.max(0, Math.floor(rect.top));
            const width = Math.max(1, Math.ceil(Math.min(rect.width, window.innerWidth - left)));
            const height = Math.max(1, Math.ceil(Math.min(rect.height, window.innerHeight - top)));
            return {
              left,
              top,
              width,
              height,
              viewportWidth: window.innerWidth,
              viewportHeight: window.innerHeight
            };
          })();
        `,
        true
      );

      if (
        !captureRect ||
        captureRect.width <= 0 ||
        captureRect.height <= 0 ||
        captureRect.viewportWidth <= 0 ||
        captureRect.viewportHeight <= 0
      ) {
        continue;
      }

      const image = await withTimeout(
        webContents.capturePage(
          {
            x: captureRect.left,
            y: captureRect.top,
            width: captureRect.width,
            height: captureRect.height
          },
          { stayHidden: true }
        ),
        htmlMermaidPngCaptureTimeoutMs,
        "Math PNG capture"
      );
      const pngDataUrl = `data:image/png;base64,${image.toPNG().toString("base64")}`;
      const replacement = {
        index,
        src: pngDataUrl,
        alt: measurement.alt,
        width: Math.round(captureRect.width),
        height: Math.round(captureRect.height)
      };

      await webContents.executeJavaScript(
        `
          (() => {
            const replacement = ${JSON.stringify(replacement)};
            const block = document.querySelector(
              \`[data-nexus-export-math-index="\${replacement.index}"]\`
            );
            if (!block) {
              return false;
            }

            const image = document.createElement("img");
            image.src = replacement.src;
            image.alt = replacement.alt;
            image.width = replacement.width;
            image.height = replacement.height;
            block.classList.add("nexus-export-math-png");
            block.replaceChildren(image);
            return true;
          })();
        `,
        true
      );
    }
  } finally {
    exportWindow.setContentSize(originalContentSize[0], originalContentSize[1]);
  }
}

async function renderMathPngImagesInExportHtml(html) {
  if (!hasExportMathPlaceholder(html)) {
    return html;
  }

  let exportWindow;
  try {
    exportWindow = createExportWindow();
    await withTimeout(
      loadExportHtmlFromTemporaryFile(exportWindow, html),
      htmlMermaidPngEnhancementTimeoutMs,
      "HTML export page load for math"
    );
    await exportWindow.webContents.executeJavaScript("document.fonts?.ready", true);
    await withTimeout(
      replaceRenderedMathBlocksWithPngImages(exportWindow),
      htmlMermaidPngEnhancementTimeoutMs,
      "Math PNG replacement"
    );
    return await withTimeout(
      serializeRenderedExportHtml(exportWindow.webContents),
      htmlMermaidPngEnhancementTimeoutMs,
      "HTML export serialization (math)"
    );
  } finally {
    if (exportWindow && !exportWindow.isDestroyed()) {
      exportWindow.destroy();
    }
  }
}

async function tryEnhanceExportHtmlWithMathPngs(html, warningContext) {
  if (!hasExportMathPlaceholder(html)) {
    return html;
  }

  try {
    return await renderMathPngImagesInExportHtml(html);
  } catch (enhanceError) {
    const message = enhanceError instanceof Error ? enhanceError.message : String(enhanceError);
    console.warn(`${warningContext}: ${message}`);
    return html;
  }
}

async function exportHtmlFromPayload(window, payload) {
  const { currentPath, markdown, options } = payload ?? {};

  try {
    const result = await showSaveDialogForWindow(window, {
      title: "Export HTML",
      defaultPath: getDefaultExportPath(currentPath, "html"),
      filters: htmlFilters
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    await fs.mkdir(path.dirname(result.filePath), { recursive: true });

    return await withExportProgress(
      window,
      "Exporting HTML",
      "Rendering diagrams and writing the HTML file. Please wait.",
      async () => {
        const html = await renderBaselineExportHtml(markdown, currentPath, options);

        await fs.writeFile(result.filePath, html, "utf8");
        debugLog(`Export HTML wrote baseline rendered HTML file: ${result.filePath}`);

        const renderedHtml = await tryEnhanceExportHtmlWithMermaidPngs(
          html,
          "Export HTML kept baseline file after Mermaid PNG enhancement failure"
        );
        if (renderedHtml !== html) {
          await fs.writeFile(result.filePath, renderedHtml, "utf8");
          debugLog(`Export HTML wrote Mermaid PNG-enhanced HTML file: ${result.filePath}`);
        }

        return { canceled: false, filePath: result.filePath };
      }
    );
  } catch (error) {
    await showExportErrorForWindow(window, "HTML", error);
    return { canceled: true };
  }
}

async function exportWordFromPayload(window, payload) {
  const { currentPath, markdown, options } = payload ?? {};

  try {
    const result = await showSaveDialogForWindow(window, {
      title: "Export Word",
      defaultPath: getDefaultExportPath(currentPath, "docx"),
      filters: docxFilters
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    await fs.mkdir(path.dirname(result.filePath), { recursive: true });

    return await withExportProgress(
      window,
      "Exporting Word",
      "Rendering diagrams and writing the Word file. Please wait.",
      async () => {
        const html = await renderBaselineExportHtml(markdown, currentPath, {
          ...options,
          codeBlockNewlinesAsBreaks: true
        });
        const mermaidEnhancedHtml = await tryEnhanceExportHtmlWithMermaidPngs(
          html,
          "Export Word kept baseline HTML after Mermaid PNG enhancement failure"
        );
        const renderedHtml = await tryEnhanceExportHtmlWithMathPngs(
          mermaidEnhancedHtml,
          "Export Word kept HTML after math PNG enhancement failure"
        );
        const wordHtml = convertWordAsidesToSingleCellTables(
          inlineWordTableHeaderStyles(
            inlineWordMarkHighlightStyles(unwrapWordMainContainer(removeWordExportDoctype(renderedHtml)))
          )
        );
        const wordFontFamily = getWordExportFontFamily(options?.fontFamily);

        const docx = await htmlToDocx(wordHtml, null, {
          font: wordFontFamily,
          margins: getDocxPageMargins(options?.pageMargins),
          table: {
            row: {
              cantSplit: true
            },
            borderOptions: {
              size: 1,
              color: "000000",
              stroke: "single"
            }
          }
        });
        const docxBuffer = Buffer.isBuffer(docx) ? docx : Buffer.from(docx);
        await fs.writeFile(result.filePath, docxBuffer);
        debugLog(`Export Word wrote DOCX file with ${wordFontFamily} font: ${result.filePath}`);

        return { canceled: false, filePath: result.filePath };
      }
    );
  } catch (error) {
    await showExportErrorForWindow(window, "Word", error);
    return { canceled: true };
  }
}

async function copyHtmlFromPayload(window, payload) {
  const { currentPath, markdown, options } = payload ?? {};

  try {
    return await withExportProgress(
      window,
      "Copying HTML",
      "Rendering diagrams and copying HTML. Please wait.",
      async () => {
        const html = await renderBaselineExportHtml(markdown, currentPath, options);
        const renderedHtml = await tryEnhanceExportHtmlWithMermaidPngs(
          html,
          "Copy HTML kept baseline HTML after Mermaid PNG enhancement failure"
        );

        clipboard.write({
          html: renderedHtml,
          text: markdown ?? ""
        });
        debugLog("Copy HTML wrote rendered document HTML to clipboard");

        return { copied: true };
      }
    );
  } catch (error) {
    await showExportErrorForWindow(window, "HTML", error);
    return { copied: false };
  }
}

function formatHostKeyFingerprint(hostKey) {
  // OpenSSH-style SHA256 fingerprint: base64 of the SHA-256 digest with padding removed.
  const digest = crypto.createHash("sha256").update(hostKey).digest("base64").replace(/=+$/, "");
  return `SHA256:${digest}`;
}

function requestSftpHostKeyConfirmation(window, payload) {
  return new Promise((resolve) => {
    if (!window || window.isDestroyed()) {
      resolve(false);
      return;
    }

    sftpPendingHostKeyCounter += 1;
    const requestId = `sftp-hostkey-${sftpPendingHostKeyCounter}`;
    sftpPendingHostKeys.set(requestId, { resolve, webContentsId: window.webContents.id });

    try {
      debugLog(`[publish] sending host-key prompt to renderer (requestId=${requestId})`);
      window.webContents.send("sftp:confirm-host-key", {
        requestId,
        host: payload.host,
        port: payload.port,
        fingerprint: payload.fingerprint
      });
    } catch (error) {
      console.error("[publish] failed to send host-key prompt:", error && error.message);
      sftpPendingHostKeys.delete(requestId);
      resolve(false);
    }
  });
}

function normalizeRemoteDirectory(remoteDirectory) {
  const trimmed = String(remoteDirectory ?? "").trim().replace(/\\+/g, "/");
  if (!trimmed) {
    return ".";
  }

  const withoutTrailingSlash = trimmed.replace(/\/+$/, "");
  return withoutTrailingSlash || "/";
}

function joinRemotePath(remoteDirectory, remoteFilename) {
  const dir = normalizeRemoteDirectory(remoteDirectory);
  const file = String(remoteFilename ?? "").trim().replace(/^\/+/, "");

  if (dir === ".") {
    return file;
  }
  if (dir === "/") {
    return `/${file}`;
  }
  return `${dir}/${file}`;
}

function composePublishedUrl(publicBaseUrl, remoteFilename) {
  const base = String(publicBaseUrl ?? "").trim();
  if (!base) {
    return null;
  }

  const file = String(remoteFilename ?? "").trim().replace(/^\/+/, "");
  return `${base.replace(/\/+$/, "")}/${file}`;
}

async function publishMarkdownOverSftp(window, payload) {
  const { currentPath, markdown, options, connection, auth } = payload ?? {};
  const conn = connection ?? {};
  const host = String(conn.host ?? "").trim();
  const username = String(conn.username ?? "").trim();
  const remoteFilename = String(conn.remoteFilename ?? "").trim();
  const port =
    Number.isInteger(conn.port) && conn.port >= 1 && conn.port <= 65535 ? conn.port : 22;

  if (!host) {
    throw new Error("An SFTP host is required to publish.");
  }
  if (!username) {
    throw new Error("An SFTP username is required to publish.");
  }
  if (!remoteFilename) {
    throw new Error("A remote filename is required to publish.");
  }

  debugLog(`[publish] request for ${username}@${host}:${port} -> ${remoteFilename}`);

  // Reuse the existing self-contained HTML export so images, fonts, and Mermaid travel inline.
  // Bound the render so a stalled hidden Mermaid/render window cannot freeze the publish forever.
  debugLog("[publish] rendering self-contained HTML...");
  const html = await withTimeout(
    renderMarkdownSelfContainedHtml(markdown, currentPath, options ?? {}),
    30000,
    "Publish HTML render"
  );
  debugLog(`[publish] HTML rendered (${html.length} bytes); opening SFTP connection...`);

  let hostKeyRejected = false;
  const connectConfig = {
    host,
    port,
    username,
    // Give the user time to review and accept the host-key fingerprint prompt before ssh2
    // abandons the handshake, but keep it bounded so a broken round trip cannot hang forever.
    readyTimeout: 120000,
    // ssh2 hands us the raw host-key buffer; verify it through the renderer prompt before connecting.
    hostVerifier: (hostKey, verify) => {
      const fingerprint = formatHostKeyFingerprint(hostKey);
      debugLog(`[publish] host key presented (${fingerprint}); awaiting user confirmation...`);
      requestSftpHostKeyConfirmation(window, { host, port, fingerprint }).then((accepted) => {
        debugLog(`[publish] host key ${accepted ? "ACCEPTED" : "REJECTED"} by user`);
        if (!accepted) {
          hostKeyRejected = true;
        }
        verify(accepted);
      });
    }
  };

  if (auth && auth.kind === "key") {
    const privateKeyPath = String(auth.privateKeyPath ?? "").trim();
    if (!privateKeyPath) {
      throw new Error("A private key file is required for key authentication.");
    }
    connectConfig.privateKey = await fs.readFile(privateKeyPath);
    if (typeof auth.passphrase === "string" && auth.passphrase.length > 0) {
      connectConfig.passphrase = auth.passphrase;
    }
  } else {
    const password = auth && typeof auth.password === "string" ? auth.password : "";
    if (!password) {
      throw new Error("A password is required for password authentication.");
    }
    connectConfig.password = password;
  }

  const client = new SftpClient();
  try {
    try {
      await client.connect(connectConfig);
    } catch (error) {
      if (hostKeyRejected) {
        return { canceled: true };
      }
      throw error;
    }

    debugLog("[publish] SFTP connected; preparing remote directory...");
    const remoteDir = normalizeRemoteDirectory(conn.remoteDirectory);
    if (remoteDir !== "." && remoteDir !== "/") {
      const exists = await client.exists(remoteDir);
      if (!exists) {
        await client.mkdir(remoteDir, true);
      }
    }

    const remotePath = joinRemotePath(conn.remoteDirectory, remoteFilename);
    await client.put(Buffer.from(html, "utf8"), remotePath);
    debugLog(`[publish] upload complete -> ${remotePath}`);

    return {
      published: true,
      remotePath,
      url: composePublishedUrl(conn.publicBaseUrl, remoteFilename)
    };
  } finally {
    try {
      await client.end();
    } catch {
      // Connection teardown failures must not mask the publish result.
    }
  }
}

function parseQuickConnectResultUrl(bodyText) {
  const trimmed = String(bodyText ?? "").trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed.url === "string" && parsed.url.trim()) {
      return parsed.url.trim();
    }
  } catch {
    // Body is not JSON; fall through to the plain-URL check.
  }

  if (/^https?:\/\/\S+$/i.test(trimmed)) {
    return trimmed;
  }

  return null;
}

async function publishMarkdownOverQuickConnect(payload) {
  const { currentPath, markdown, options, connection } = payload ?? {};
  const conn = connection ?? {};
  const url = String(conn.url ?? "").trim();
  const targetPath = String(conn.path ?? "").trim();
  const token = String(conn.token ?? "");

  if (!url) {
    throw new Error("A QuickConnect URL is required to publish.");
  }
  if (!targetPath) {
    throw new Error("A QuickConnect path is required to publish.");
  }

  debugLog(`[publish] QuickConnect POST to ${url} (path=${targetPath})`);

  // Reuse the same self-contained HTML render used by SFTP publish and HTML export.
  debugLog("[publish] rendering self-contained HTML...");
  const html = await withTimeout(
    renderMarkdownSelfContainedHtml(markdown, currentPath, options ?? {}),
    30000,
    "Publish HTML render"
  );
  debugLog(`[publish] HTML rendered (${html.length} bytes); sending HTTP POST...`);

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        Authorization: `Bearer ${token}`,
        "X-QuickConnect-Path": targetPath
      },
      body: html,
      signal: AbortSignal.timeout(30000)
    });
  } catch (error) {
    if (error && error.name === "TimeoutError") {
      throw new Error("The QuickConnect request timed out.");
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not reach the QuickConnect server: ${message}`);
  }

  let bodyText = "";
  try {
    bodyText = await response.text();
  } catch {
    bodyText = "";
  }

  if (!response.ok) {
    const snippet = bodyText ? ` - ${bodyText.slice(0, 200)}` : "";
    throw new Error(`The QuickConnect server responded ${response.status} ${response.statusText}${snippet}`);
  }

  debugLog(`[publish] QuickConnect succeeded (${response.status})`);
  return { published: true, url: parseQuickConnectResultUrl(bodyText) };
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
  const isMac = process.platform === "darwin";
  const window = new BrowserWindow({
    title: "Nexus",
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#f6f2ea",
    icon: getAppIconPath(),
    // Custom in-app titlebar (see src/components/titlebar). On macOS we keep the
    // native traffic lights via "hidden"; on Windows/Linux we go fully frameless.
    ...(isMac
      ? { titleBarStyle: "hidden", trafficLightPosition: { x: 12, y: 11 } }
      : { frame: false }),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  });

  const webContentsId = window.webContents.id;

  closeStates.set(window, { allowed: false, pending: false });

  // Keep the custom titlebar's maximize/restore button in sync with the window state.
  const sendMaximizeState = () => {
    if (!window.isDestroyed()) {
      window.webContents.send("window:maximize-changed", window.isMaximized());
    }
  };
  window.on("maximize", sendMaximizeState);
  window.on("unmaximize", sendMaximizeState);

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

  window.on("focus", () => {
    const record = mcpWindowRecords.get(webContentsId);
    if (record) {
      mcpFocusedWindowId = record.windowId;
    }
  });

  window.on("closed", () => {
    stopFileWatcher(webContentsId);
    pendingInitialFiles.delete(webContentsId);
    closeStates.delete(window);

    for (const [requestId, pending] of sftpPendingHostKeys.entries()) {
      if (pending.webContentsId === webContentsId) {
        pending.resolve(false);
        sftpPendingHostKeys.delete(requestId);
      }
    }

    const record = mcpWindowRecords.get(webContentsId);
    if (record) {
      mcpWindowRecords.delete(webContentsId);
      for (const [requestId, pending] of mcpPendingWrites.entries()) {
        if (pending.webContentsId === webContentsId) {
          pending.resolve({ applied: false, reason: "window-closed" });
          mcpPendingWrites.delete(requestId);
        }
      }
      rejectPendingMcpSelectionsForWebContents(webContentsId);
      if (mcpFocusedWindowId === record.windowId) {
        mcpFocusedWindowId = null;
      }
    }

    if (isQuitting && BrowserWindow.getAllWindows().length > 0) {
      setImmediate(requestNextWindowClose);
    }
  });

  window.webContents.on("context-menu", (_event, params) => {
    showEditorContextMenu(window, params);
  });

  // Open web links (e.g. the link popover's "open" button, which calls window.open)
  // in the user's default browser instead of spawning a new Electron window.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // Never let an external link navigate the app window away from its own document;
  // route external web links to the default browser instead.
  window.webContents.on("will-navigate", (event, url) => {
    let target;
    try {
      target = new URL(url);
    } catch {
      return;
    }

    if (target.protocol !== "http:" && target.protocol !== "https:") {
      return;
    }

    let current = null;
    try {
      current = new URL(window.webContents.getURL());
    } catch {
      current = null;
    }

    if (!current || target.host !== current.host) {
      event.preventDefault();
      void shell.openExternal(url);
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

function sendMenuAction(action, payload) {
  const window = BrowserWindow.getFocusedWindow();
  if (window) {
    window.webContents.send("menu:action", action, payload);
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

  if (command === "undo") {
    window.webContents.undo();
  }

  if (command === "redo") {
    window.webContents.redo();
  }
}

const menuState = {
  editorZoomPercent: 100,
  showInvisibleCharacters: false,
  spellCheckEnabled: true,
  outlineVisible: false,
  pageOrientation: "portrait",
  responsiveContentWrappingEnabled: true,
  paperViewEnabled: true,
  aiChatVisible: false,
  editorViewMode: "rich-text"
};

const RECENT_FILES_LIMIT = recentFilesStore.DEFAULT_RECENT_FILES_LIMIT;
const recentFilesOptions = { limit: RECENT_FILES_LIMIT, comparePath: getComparableFilePath };
let recentFiles = [];

function getRecentFilesStorePath() {
  return path.join(app.getPath("userData"), "recent-files.json");
}

function loadRecentFiles() {
  try {
    const raw = readFileSync(getRecentFilesStorePath(), "utf8");
    recentFiles = recentFilesStore.sanitizeRecentFiles(JSON.parse(raw), recentFilesOptions);
  } catch {
    // Missing or corrupt store: start from an empty list rather than failing menu construction.
    recentFiles = [];
  }
}

async function persistRecentFiles() {
  try {
    const filePath = getRecentFilesStorePath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(recentFiles), "utf8");
  } catch {
    // Persisting recents is best-effort; never let a disk error break opening or saving.
  }
}

function addRecentFile(filePath) {
  if (typeof filePath !== "string" || filePath.length === 0) {
    return;
  }

  const next = recentFilesStore.addRecentFile(recentFiles, filePath, recentFilesOptions);
  const unchanged =
    next.length === recentFiles.length && next.every((entry, index) => entry === recentFiles[index]);
  if (unchanged) {
    return;
  }

  recentFiles = next;
  app.addRecentDocument(next[0]);
  void persistRecentFiles();
  buildMenu();
}

function removeRecentFile(filePath) {
  const next = recentFilesStore.removeRecentFile(recentFiles, filePath, recentFilesOptions);
  if (next.length === recentFiles.length) {
    return;
  }

  recentFiles = next;
  void persistRecentFiles();
  buildMenu();
}

function clearRecentFiles() {
  if (recentFiles.length === 0) {
    return;
  }

  recentFiles = [];
  app.clearRecentDocuments();
  void persistRecentFiles();
  buildMenu();
}

function sendOpenRecentFile(filePath) {
  const window = BrowserWindow.getFocusedWindow();
  if (window && !window.isDestroyed()) {
    window.webContents.send("menu:open-recent", filePath);
    return;
  }

  // No focused window (e.g. the macOS menu bar with every window closed): open in a new window.
  void openFilesInNewWindows([filePath]);
}

function buildRecentFilesSubmenu() {
  if (recentFiles.length === 0) {
    return [{ label: "No Recent Files", enabled: false }];
  }

  const items = recentFiles.map((filePath) => ({
    label: path.basename(filePath),
    toolTip: filePath,
    click: () => sendOpenRecentFile(filePath)
  }));

  items.push({ type: "separator" }, { label: "Clear Recent", click: () => clearRecentFiles() });
  return items;
}

// The AI selection items for the AI menu: simple one-shot actions plus the "Change tone"
// and "Translate" submenus. The catalog comes from aiSelectionCatalog.cjs (kept in sync with
// src/lib/ai/prompts.ts by aiSelectionCatalog.test.ts). Each click sends an `aiSelection` menu
// action carrying the prompt id (and any options) to the renderer, which runs it against the
// current editor selection (see runSelectionAiAction in src/App.tsx).
function buildAiSelectionMenuItems() {
  return [
    ...AI_SELECTION_ACTIONS.map((action) => ({
      label: action.label,
      click: () => sendMenuAction("aiSelection", { action: action.id })
    })),
    {
      label: "Change tone",
      submenu: AI_TONE_OPTIONS.map((tone) => ({
        label: tone.label,
        click: () => sendMenuAction("aiSelection", { action: "tone", options: { tone: tone.value } })
      }))
    },
    {
      label: "Translate",
      submenu: AI_TRANSLATE_LANGUAGES.map((language) => ({
        label: language,
        click: () => sendMenuAction("aiSelection", { action: "translate", options: { language } })
      }))
    },
    { type: "separator" },
    {
      // Generate-and-insert action (not a selection transform), so it bypasses the aiSelection
      // catalog and sends a plain menu action the renderer maps to runImageToMarkdown.
      label: "Image to Markdown…",
      click: () => sendMenuAction("imageToMarkdown")
    }
  ];
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
          label: "Open Recent",
          submenu: buildRecentFilesSubmenu()
        },
        {
          label: "Load Demo Document",
          click: () => sendMenuAction("loadDemo")
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
          click: (_menuItem, browserWindow) => {
            debugLog("Export as HTML menu item clicked");
            const window =
              browserWindow && !browserWindow.isDestroyed()
                ? browserWindow
                : BrowserWindow.getFocusedWindow();
            const record = window ? mcpWindowRecords.get(window.webContents.id) : null;

            if (record) {
              debugLog("Export as HTML menu item using main-process document snapshot");
              void exportHtmlFromPayload(window, {
                currentPath: record.filePath,
                markdown: record.markdown ?? "",
                options: {}
              });
              return;
            }

            debugLog("Export as HTML menu item forwarding to renderer");
            sendMenuAction("exportHtml");
          }
        },
        {
          label: "Export to Word",
          click: (_menuItem, browserWindow) => {
            debugLog("Export to Word menu item clicked");
            const window =
              browserWindow && !browserWindow.isDestroyed()
                ? browserWindow
                : BrowserWindow.getFocusedWindow();
            const record = window ? mcpWindowRecords.get(window.webContents.id) : null;

            if (record) {
              debugLog("Export to Word menu item using main-process document snapshot");
              void exportWordFromPayload(window, {
                currentPath: record.filePath,
                markdown: record.markdown ?? "",
                options: record.exportOptions?.word ?? {}
              });
              return;
            }

            debugLog("Export to Word menu item forwarding to renderer");
            sendMenuAction("exportWord");
          }
        },
        {
          label: "Export as PDF",
          click: () => sendMenuAction("exportPdf")
        },
        {
          label: "Publish as HTML over SFTP…",
          click: () => sendMenuAction("publishWeb")
        },
        {
          label: "Publish as HTML over QuickConnect…",
          click: () => sendMenuAction("publishQuickConnect")
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
          label: "Find",
          accelerator: "CmdOrCtrl+F",
          click: () => sendMenuAction("find")
        },
        {
          label: "Replace",
          accelerator: "CmdOrCtrl+H",
          click: () => sendMenuAction("replace")
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
          label: "Edit Frontmatter…",
          click: () => sendMenuAction("editFrontmatter")
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
          label: "Copy as HTML",
          accelerator: "CmdOrCtrl+Shift+C",
          click: () => sendMenuAction("copyHtml")
        },
        {
          label: "Paste",
          role: "paste"
        }
      ]
    },
    {
      label: "AI",
      submenu: buildAiSelectionMenuItems()
    },
    {
      label: "View",
      submenu: [
        {
          label: "Zoom In",
          accelerator: "CmdOrCtrl+Plus",
          click: () => sendMenuAction("zoomIn")
        },
        {
          label: "Zoom Out",
          accelerator: "CmdOrCtrl+-",
          click: () => sendMenuAction("zoomOut")
        },
        {
          label: `Reset Zoom (${menuState.editorZoomPercent}%)`,
          accelerator: "CmdOrCtrl+0",
          click: () => sendMenuAction("resetZoom")
        },
        {
          type: "separator"
        },
        {
          label: "Show Invisible Characters",
          type: "checkbox",
          checked: menuState.showInvisibleCharacters,
          click: () => sendMenuAction("toggleShowInvisibles")
        },
        {
          label: "Check Spelling",
          type: "checkbox",
          checked: menuState.spellCheckEnabled,
          click: () => sendMenuAction("toggleSpellCheck")
        },
        {
          type: "separator"
        },
        {
          label: "Show Outline",
          type: "checkbox",
          checked: menuState.outlineVisible,
          enabled: menuState.editorViewMode === "rich-text",
          click: () => sendMenuAction("toggleOutline")
        },
        {
          label: "Show AI Chat",
          type: "checkbox",
          accelerator: "CmdOrCtrl+Shift+A",
          checked: menuState.aiChatVisible,
          click: () => sendMenuAction("toggleAiChat")
        },
        {
          label: "Landscape Orientation",
          type: "checkbox",
          checked: menuState.pageOrientation === "landscape",
          click: () => sendMenuAction("togglePageOrientation")
        },
        {
          label: "Paper View",
          type: "checkbox",
          checked: menuState.paperViewEnabled,
          click: () => sendMenuAction("togglePaperView")
        },
        {
          label: "Responsive Wrapping",
          type: "checkbox",
          checked: menuState.responsiveContentWrappingEnabled,
          enabled: !menuState.paperViewEnabled,
          click: () => sendMenuAction("toggleResponsiveWrapping")
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
        },
        {
          label: "AI Providers…",
          click: () => sendMenuAction("aiSettings")
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

const docxFilters = [
  { name: "Word Document", extensions: ["docx"] },
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

function getSpellCheckMenuContext(params = {}) {
  const misspelledWord = typeof params.misspelledWord === "string" ? params.misspelledWord.trim() : "";
  const dictionarySuggestions = Array.isArray(params.dictionarySuggestions)
    ? params.dictionarySuggestions.filter((suggestion) => typeof suggestion === "string" && suggestion.length > 0).slice(0, 5)
    : [];

  return { misspelledWord, dictionarySuggestions };
}

function showEditorContextMenu(window, params = {}) {
  if (!window || window.isDestroyed()) {
    return;
  }

  const { misspelledWord, dictionarySuggestions } = getSpellCheckMenuContext(params);
  if (!params.isEditable && misspelledWord.length === 0) {
    return;
  }

  const template = [];
  if (misspelledWord.length > 0) {
    if (dictionarySuggestions.length > 0) {
      for (const suggestion of dictionarySuggestions) {
        template.push({
          label: suggestion,
          click: () => window.webContents.replaceMisspelling(suggestion)
        });
      }
    } else {
      template.push({
        label: "No suggestions",
        enabled: false
      });
    }

    template.push({
      label: "Add to dictionary",
      click: () => window.webContents.session.addWordToSpellCheckerDictionary(misspelledWord)
    });
    template.push({ type: "separator" });
  }

  template.push(
    {
      label: "Cut",
      accelerator: "CmdOrCtrl+X",
      click: () => runEditCommand(window, "cut")
    },
    {
      label: "Copy",
      accelerator: "CmdOrCtrl+C",
      click: () => runEditCommand(window, "copy")
    },
    {
      label: "Copy as HTML",
      accelerator: "CmdOrCtrl+Shift+C",
      click: () => window.webContents.send("menu:action", "copyHtml")
    },
    {
      label: "Paste",
      accelerator: "CmdOrCtrl+V",
      click: () => runEditCommand(window, "paste")
    }
  );

  Menu.buildFromTemplate(template).popup({ window });
}

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

ipcMain.handle("recent:open", async (event, filePath) => {
  if (typeof filePath !== "string" || filePath.length === 0) {
    return { canceled: true };
  }

  try {
    const result = await readMarkdownFile(filePath);
    await refreshWatchedFileSignature(event.sender.id, result.filePath);
    return result;
  } catch (error) {
    // The recent entry points at a file that can no longer be read; drop it and tell the user.
    removeRecentFile(filePath);
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
  addRecentFile(result.filePath);
  return { canceled: false, filePath: result.filePath };
});

ipcMain.handle("file:export-html", async (event, payload) => {
  debugLog("Export HTML IPC handler started");
  return exportHtmlFromPayload(BrowserWindow.fromWebContents(event.sender), payload);
});

ipcMain.handle("file:export-word", async (event, payload) => {
  debugLog("Export Word IPC handler started");
  return exportWordFromPayload(BrowserWindow.fromWebContents(event.sender), payload);
});

ipcMain.handle("file:export-pdf", async (event, payload) => {
  debugLog("Export PDF IPC handler started");
  const window = BrowserWindow.fromWebContents(event.sender);
  const { currentPath, markdown, options } = payload ?? {};
  const pageSize = getPdfPageSize(options?.pageSize);
  const pageMargins = getPdfPageMargins(options?.pageMargins);
  const landscape = getPdfPageOrientation(options?.pageOrientation) === "landscape";

  try {
    const result = await showSaveDialogForWindow(window, {
      title: "Export PDF",
      defaultPath: getDefaultExportPath(currentPath, "pdf"),
      filters: pdfFilters
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    await fs.mkdir(path.dirname(result.filePath), { recursive: true });

    // Mirror the Word/HTML exports: keep the modal "Exporting PDF" window up while the heavy
    // rendering + print-to-PDF runs, so the user sees progress instead of a frozen editor. The
    // save dialog is shown first (above) so the modal never covers it.
    return await withExportProgress(
      window,
      "Exporting PDF",
      "Rendering diagrams and writing the PDF file. Please wait.",
      async () => {
        let exportWindow;
        try {
          const html = await renderMarkdownExportHtml(markdown, currentPath, {
            excludeFrontmatter: true,
            fontFamily: options?.fontFamily,
            fontSizePixels: options?.fontSizePixels,
            paragraphSpacingPixels: options?.paragraphSpacingPixels
          });

          exportWindow = createExportWindow();
          await loadExportHtml(exportWindow, html);
          await renderExportMermaidDiagrams(exportWindow.webContents);
          await exportWindow.webContents.executeJavaScript("document.fonts?.ready", true);
          const pdf = await exportWindow.webContents.printToPDF({
            landscape,
            margins: pageMargins,
            pageSize,
            printBackground: true
          });

          await fs.writeFile(result.filePath, pdf);
          return { canceled: false, filePath: result.filePath };
        } finally {
          if (exportWindow && !exportWindow.isDestroyed()) {
            exportWindow.destroy();
          }
        }
      }
    );
  } catch (error) {
    await showExportError(event, "PDF", error);
    return { canceled: true };
  }
});

ipcMain.handle("sftp:publish", async (event, payload) => {
  const window = BrowserWindow.fromWebContents(event.sender);

  try {
    const result = await publishMarkdownOverSftp(window, payload);
    if (result.canceled) {
      return { ok: false, canceled: true };
    }
    return { ok: true, remotePath: result.remotePath, url: result.url ?? null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[publish] FAILED:", message);
    await showPublishErrorForWindow(window, message);
    return { ok: false, error: message };
  }
});

ipcMain.handle("quickconnect:publish", async (event, payload) => {
  const window = BrowserWindow.fromWebContents(event.sender);

  try {
    const result = await publishMarkdownOverQuickConnect(payload);
    return { ok: true, url: result.url ?? null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[publish] QuickConnect FAILED:", message);
    await showPublishErrorForWindow(window, message);
    return { ok: false, error: message };
  }
});

// The QuickConnect bearer token is a secret, so it is never written to localStorage in plaintext.
// The renderer hands it to the main process, which encrypts it at rest with the OS-provided secure
// storage (Electron safeStorage: DPAPI on Windows, Keychain on macOS, libsecret on Linux) and
// persists the ciphertext in a per-profile map under userData.
function getQuickConnectTokenStorePath() {
  return path.join(app.getPath("userData"), "quickconnect-tokens.json");
}

function quickConnectProfileKey(profileName) {
  return typeof profileName === "string" && profileName.trim() ? profileName.trim() : "default";
}

async function readQuickConnectTokenStore() {
  try {
    const raw = await fs.readFile(getQuickConnectTokenStorePath(), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    // Missing or corrupt store: start from an empty map rather than failing the lookup.
    return {};
  }
}

async function writeQuickConnectTokenStore(store) {
  const filePath = getQuickConnectTokenStorePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(store), "utf8");
}

ipcMain.handle("quickconnect:get-token", async (_event, profileName) => {
  if (!safeStorage.isEncryptionAvailable()) {
    return "";
  }

  const store = await readQuickConnectTokenStore();
  const encoded = store[quickConnectProfileKey(profileName)];
  if (typeof encoded !== "string" || encoded.length === 0) {
    return "";
  }

  try {
    return safeStorage.decryptString(Buffer.from(encoded, "base64"));
  } catch {
    // A token encrypted under a different OS user/key cannot be read back here; treat as absent.
    return "";
  }
});

ipcMain.handle("quickconnect:set-token", async (_event, payload) => {
  const profileKey = quickConnectProfileKey(payload?.profileName);
  const token = typeof payload?.token === "string" ? payload.token : "";
  const encryptionAvailable = safeStorage.isEncryptionAvailable();
  const store = await readQuickConnectTokenStore();

  // An empty token clears any stored entry, regardless of encryption support.
  if (!token) {
    if (Object.prototype.hasOwnProperty.call(store, profileKey)) {
      delete store[profileKey];
      await writeQuickConnectTokenStore(store);
    }
    return { stored: false, encryptionAvailable };
  }

  // Never fall back to plaintext on disk: the whole point is encryption at rest.
  if (!encryptionAvailable) {
    return { stored: false, encryptionAvailable: false };
  }

  store[profileKey] = safeStorage.encryptString(token).toString("base64");
  await writeQuickConnectTokenStore(store);
  return { stored: true, encryptionAvailable: true };
});

// The MCP bearer token is the secret that authenticates AI clients (and the OAuth flow issues it), so
// like the QuickConnect token it is encrypted at rest with Electron safeStorage rather than written
// to localStorage in plaintext. Same per-profile ciphertext map, separate file.
function getMcpBearerTokenStorePath() {
  return path.join(app.getPath("userData"), "mcp-bearer-tokens.json");
}

function mcpBearerProfileKey(profileName) {
  return typeof profileName === "string" && profileName.trim() ? profileName.trim() : "default";
}

async function readMcpBearerTokenStore() {
  try {
    const raw = await fs.readFile(getMcpBearerTokenStorePath(), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeMcpBearerTokenStore(store) {
  const filePath = getMcpBearerTokenStorePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(store), "utf8");
}

ipcMain.handle("mcp:get-bearer-token", async (_event, profileName) => {
  if (!safeStorage.isEncryptionAvailable()) {
    return "";
  }

  const store = await readMcpBearerTokenStore();
  const encoded = store[mcpBearerProfileKey(profileName)];
  if (typeof encoded !== "string" || encoded.length === 0) {
    return "";
  }

  try {
    return safeStorage.decryptString(Buffer.from(encoded, "base64"));
  } catch {
    // A token encrypted under a different OS user/key cannot be read back here; treat as absent.
    return "";
  }
});

ipcMain.handle("mcp:set-bearer-token", async (_event, payload) => {
  const profileKey = mcpBearerProfileKey(payload?.profileName);
  const token = typeof payload?.token === "string" ? payload.token : "";
  const encryptionAvailable = safeStorage.isEncryptionAvailable();
  const store = await readMcpBearerTokenStore();

  if (!token) {
    if (Object.prototype.hasOwnProperty.call(store, profileKey)) {
      delete store[profileKey];
      await writeMcpBearerTokenStore(store);
    }
    return { stored: false, encryptionAvailable };
  }

  // Never fall back to plaintext on disk: the whole point is encryption at rest.
  if (!encryptionAvailable) {
    return { stored: false, encryptionAvailable: false };
  }

  store[profileKey] = safeStorage.encryptString(token).toString("base64");
  await writeMcpBearerTokenStore(store);
  return { stored: true, encryptionAvailable: true };
});

// AI provider API keys are secrets, so — like the MCP bearer and QuickConnect tokens — they are never
// written to localStorage. The renderer hands each key to the main process, which encrypts it at rest
// with Electron safeStorage and persists the ciphertext in a per-(profile, provider) map. Keys are
// read back here only to authenticate an `ai:chat` request and are never returned to the renderer in
// bulk (the setup dialog reads one provider's key at a time to populate its field).
function getAiProviderKeyStorePath() {
  return path.join(app.getPath("userData"), "ai-provider-keys.json");
}

// Mirrors AI_PROVIDER_IDS in src/lib/ai/providers.ts (main runs raw CJS, so it can't import the TS).
const AI_PROVIDER_IDS = ["openai", "azure-openai", "deepseek", "anthropic", "ollama", "lm-studio"];

function aiKeyEntryKey(profileName, providerId) {
  const profile = typeof profileName === "string" && profileName.trim() ? profileName.trim() : "default";
  const provider = AI_PROVIDER_IDS.includes(providerId) ? providerId : "";
  return provider ? `${profile}:${provider}` : "";
}

async function readAiProviderKeyStore() {
  try {
    const raw = await fs.readFile(getAiProviderKeyStorePath(), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    // Missing or corrupt store: start from an empty map rather than failing the lookup.
    return {};
  }
}

async function writeAiProviderKeyStore(store) {
  const filePath = getAiProviderKeyStorePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(store), "utf8");
}

async function readAiProviderKey(profileName, providerId) {
  if (!safeStorage.isEncryptionAvailable()) {
    return "";
  }

  const entryKey = aiKeyEntryKey(profileName, providerId);
  if (!entryKey) {
    return "";
  }

  const store = await readAiProviderKeyStore();
  const encoded = store[entryKey];
  if (typeof encoded !== "string" || encoded.length === 0) {
    return "";
  }

  try {
    return safeStorage.decryptString(Buffer.from(encoded, "base64"));
  } catch {
    // A key encrypted under a different OS user/key cannot be read back here; treat as absent.
    return "";
  }
}

ipcMain.handle("ai:get-key", async (_event, payload) => {
  const profileName = payload && typeof payload === "object" ? payload.profileName : undefined;
  const providerId = payload && typeof payload === "object" ? payload.providerId : undefined;
  return readAiProviderKey(profileName, providerId);
});

ipcMain.handle("ai:set-key", async (_event, payload) => {
  const entryKey = aiKeyEntryKey(payload?.profileName, payload?.providerId);
  const key = typeof payload?.key === "string" ? payload.key : "";
  const encryptionAvailable = safeStorage.isEncryptionAvailable();

  if (!entryKey) {
    return { stored: false, encryptionAvailable };
  }

  const store = await readAiProviderKeyStore();

  // An empty key clears any stored entry, regardless of encryption support.
  if (!key) {
    if (Object.prototype.hasOwnProperty.call(store, entryKey)) {
      delete store[entryKey];
      await writeAiProviderKeyStore(store);
    }
    return { stored: false, encryptionAvailable };
  }

  // Never fall back to plaintext on disk: the whole point is encryption at rest.
  if (!encryptionAvailable) {
    return { stored: false, encryptionAvailable: false };
  }

  store[entryKey] = safeStorage.encryptString(key).toString("base64");
  await writeAiProviderKeyStore(store);
  return { stored: true, encryptionAvailable: true };
});

const AI_CHAT_TIMEOUT_MS = 30000;

// Run a chat completion through the provider abstraction. Network I/O lives here in the main process
// (Node fetch) to avoid CORS and keep API keys out of the renderer; the request shape and response
// parsing are the pure adapter's job (`aiProviders.cjs`), so this handler is thin glue. Used by the
// setup dialog's "Test connection" now, and reusable by future in-app AI features.
ipcMain.handle("ai:chat", async (_event, payload) => {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Invalid AI request." };
  }

  const { profileName, providerId, config, messages, system, temperature, maxTokens } = payload;
  if (!AI_PROVIDER_IDS.includes(providerId)) {
    return { ok: false, error: `Unknown AI provider: ${String(providerId)}` };
  }

  const apiKey = await readAiProviderKey(profileName, providerId);
  const missing = aiProviders.describeMissingConfig({ providerId, config, apiKey });
  if (missing) {
    return { ok: false, error: missing };
  }

  // One full build+fetch+parse round at a given temperature (undefined to omit it).
  async function attempt(effectiveTemperature) {
    let request;
    try {
      request = aiProviders.buildChatHttpRequest({
        providerId,
        config,
        apiKey,
        messages,
        system,
        temperature: effectiveTemperature,
        maxTokens
      });
    } catch (error) {
      return { ok: false, error: `Failed to build the request: ${error?.message ?? error}` };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_CHAT_TIMEOUT_MS);

    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: JSON.stringify(request.body),
        signal: controller.signal
      });

      let json = null;
      try {
        json = await response.json();
      } catch {
        // Some error responses are not JSON (e.g. an HTML gateway page); parseChatResult handles null.
        json = null;
      }

      return aiProviders.parseChatResult({ providerId, status: response.status, json });
    } catch (error) {
      if (error?.name === "AbortError") {
        return { ok: false, error: `Request timed out after ${AI_CHAT_TIMEOUT_MS / 1000}s.` };
      }
      return { ok: false, error: `Network error: ${error?.message ?? error}` };
    } finally {
      clearTimeout(timeout);
    }
  }

  const result = await attempt(temperature);
  // Some OpenAI models (o-series, gpt-5+) reject any explicit temperature and only allow the default;
  // retry once without it so our non-default default temperature doesn't block those models.
  if (temperature !== undefined && aiProviders.isUnsupportedTemperatureError(result)) {
    return attempt(undefined);
  }
  return result;
});

// In-app AI chat — tool surface. Expose the MCP tool catalog and a direct tool-call path so the
// chat panel offers exactly the same tools (and the same write-confirmation gate) as the network
// MCP server, without requiring that server to be enabled.
ipcMain.handle("mcp:list-tools", () => {
  return mcpServer.listTools();
});

ipcMain.handle("mcp:call-tool", async (_event, payload) => {
  const name = payload && typeof payload === "object" ? payload.name : undefined;
  const args = payload && typeof payload === "object" ? payload.args : undefined;
  if (typeof name !== "string" || !name) {
    return { isError: true, content: [{ type: "text", text: "A tool name is required." }] };
  }
  try {
    return await mcpServer.callTool(name, args, { clientLabel: "Nexus AI chat" });
  } catch (error) {
    return {
      isError: true,
      content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }]
    };
  }
});

// In-app AI chat — streaming bridge. ipcMain.handle can't stream, so the renderer sends
// "ai:chat-stream" with a requestId, we forward normalized SSE deltas on "ai:chat-stream-event",
// and "ai:chat-abort" cancels the in-flight fetch via its AbortController. This is one provider turn
// per call; the renderer's agent loop reissues for tool follow-ups.
const AI_CHAT_STREAM_TIMEOUT_MS = 120000;
const aiChatStreamControllers = new Map();

function sendAiChatStreamEvent(sender, requestId, event) {
  if (!sender || sender.isDestroyed()) {
    return;
  }
  sender.send("ai:chat-stream-event", { requestId, event });
}

async function runAiChatStream(sender, requestId, payload) {
  const {
    profileName,
    providerId,
    config,
    messages,
    system,
    tools,
    temperature,
    maxTokens
  } = payload && typeof payload === "object" ? payload : {};

  if (!AI_PROVIDER_IDS.includes(providerId)) {
    sendAiChatStreamEvent(sender, requestId, {
      type: "error",
      error: `Unknown AI provider: ${String(providerId)}`
    });
    return;
  }

  const apiKey = await readAiProviderKey(profileName, providerId);
  const missing = aiProviders.describeMissingConfig({ providerId, config, apiKey });
  if (missing) {
    sendAiChatStreamEvent(sender, requestId, { type: "error", error: missing });
    return;
  }

  let request;
  try {
    request = aiProviders.buildAgentChatHttpRequest({
      providerId,
      config,
      apiKey,
      messages,
      system,
      tools,
      temperature,
      maxTokens
    });
  } catch (error) {
    sendAiChatStreamEvent(sender, requestId, {
      type: "error",
      error: `Failed to build the request: ${error?.message ?? error}`
    });
    return;
  }

  const controller = new AbortController();
  aiChatStreamControllers.set(requestId, controller);
  // A safety timeout so a stalled stream cannot hang the controller map forever; a normal Stop or
  // completion clears it well before this fires.
  const timeout = setTimeout(() => controller.abort(), AI_CHAT_STREAM_TIMEOUT_MS);

  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: controller.signal
    });

    if (!response.ok) {
      let json = null;
      try {
        json = await response.json();
      } catch {
        json = null;
      }
      const parsed = aiProviders.parseAgentChatResult({ providerId, status: response.status, json });
      const errorMessage = parsed.ok ? `Request failed with HTTP ${response.status}` : parsed.error;
      // Some OpenAI models (o-series, gpt-5+) reject an explicit temperature and only allow the
      // default; retry once without it. The recursive call suspends at its first await before
      // registering its controller, so this attempt's finally cleanup runs first (no clobber).
      if (
        temperature !== undefined &&
        aiProviders.isUnsupportedTemperatureError({ ok: false, error: errorMessage })
      ) {
        return runAiChatStream(sender, requestId, { ...payload, temperature: undefined });
      }
      sendAiChatStreamEvent(sender, requestId, {
        type: "error",
        status: response.status,
        error: errorMessage
      });
      return;
    }

    const contentType = response.headers.get("content-type") || "";
    // Fallback: a provider/proxy that ignored stream:true returns one JSON body — parse it once.
    if (!contentType.includes("text/event-stream") || !response.body) {
      let json = null;
      try {
        json = await response.json();
      } catch {
        json = null;
      }
      const parsed = aiProviders.parseAgentChatResult({ providerId, status: response.status, json });
      if (!parsed.ok) {
        sendAiChatStreamEvent(sender, requestId, {
          type: "error",
          status: parsed.status,
          error: parsed.error
        });
        return;
      }
      if (parsed.text) {
        sendAiChatStreamEvent(sender, requestId, { type: "text", text: parsed.text });
      }
      sendAiChatStreamEvent(sender, requestId, { type: "result", result: parsed });
      return;
    }

    const decoder = aiProviders.createSseDecoder();
    const parseEvent = aiProviders.getStreamEventParser(providerId);
    const state = aiProviders.createStreamState();
    const reader = response.body.getReader();
    const textDecoder = new TextDecoder();
    let streamError = null;

    for (;;) {
      if (controller.signal.aborted) {
        break;
      }
      let chunk;
      try {
        chunk = await reader.read();
      } catch (error) {
        if (controller.signal.aborted) {
          break;
        }
        throw error;
      }
      if (chunk.done) {
        break;
      }
      for (const sseEvent of decoder.push(textDecoder.decode(chunk.value, { stream: true }))) {
        if (sseEvent.done || !sseEvent.json) {
          continue;
        }
        for (const normalized of parseEvent(sseEvent.json)) {
          if (normalized.type === "stream_error") {
            streamError = normalized.message;
            continue;
          }
          aiProviders.applyStreamEvent(state, normalized);
          // Forward only the events the UI renders live; the final result carries the rest.
          if (normalized.type === "text" || normalized.type === "tool_call_delta") {
            sendAiChatStreamEvent(sender, requestId, normalized);
          }
        }
      }
    }

    if (controller.signal.aborted) {
      return; // The renderer already tore down its side; stay silent.
    }
    if (streamError) {
      sendAiChatStreamEvent(sender, requestId, { type: "error", error: streamError });
      return;
    }
    sendAiChatStreamEvent(sender, requestId, {
      type: "result",
      result: aiProviders.finalizeStreamState(state)
    });
  } catch (error) {
    if (controller.signal.aborted) {
      return;
    }
    sendAiChatStreamEvent(sender, requestId, {
      type: "error",
      error: `Network error: ${error?.message ?? error}`
    });
  } finally {
    clearTimeout(timeout);
    aiChatStreamControllers.delete(requestId);
  }
}

ipcMain.on("ai:chat-stream", (event, payload) => {
  if (!payload || typeof payload !== "object") {
    return;
  }
  const { requestId, payload: chatPayload } = payload;
  if (typeof requestId !== "string" || !requestId) {
    return;
  }
  void runAiChatStream(event.sender, requestId, chatPayload);
});

ipcMain.on("ai:chat-abort", (_event, payload) => {
  const requestId = payload && typeof payload === "object" ? payload.requestId : undefined;
  if (typeof requestId !== "string") {
    return;
  }
  const controller = aiChatStreamControllers.get(requestId);
  if (controller) {
    controller.abort();
    aiChatStreamControllers.delete(requestId);
  }
});

ipcMain.on("sftp:host-key-decision", (_event, payload) => {
  if (!payload || typeof payload !== "object") {
    return;
  }

  const { requestId, decision } = payload;
  if (typeof requestId !== "string") {
    return;
  }

  const pending = sftpPendingHostKeys.get(requestId);
  if (!pending) {
    debugLog(`[publish] host-key decision for unknown requestId=${requestId} (ignored)`);
    return;
  }

  debugLog(`[publish] host-key decision received: ${decision} (requestId=${requestId})`);
  sftpPendingHostKeys.delete(requestId);
  pending.resolve(decision === "accept");
});

ipcMain.handle("dialog:select-private-key", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const options = {
    title: "Select Private Key",
    properties: ["openFile"]
  };
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options);

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  return { canceled: false, filePath: path.resolve(result.filePaths[0]) };
});

ipcMain.handle("image:select-local", async (_event, payload) => {
  const result = await selectImageFile();
  if (result.canceled) {
    return result;
  }

  // Anchor the inserted reference to the document's folder when it is saved, so the markdown keeps a
  // portable relative path; untitled buffers fall back to an absolute file:// URL inside the helper.
  const documentPath = typeof payload?.documentPath === "string" ? payload.documentPath : "";
  return {
    canceled: false,
    filePath: result.filePath,
    src: imagePaths.toMarkdownImageSource(documentPath, result.filePath)
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

// --- Optional "diagrams as files" sidecar I/O (see src/lib/diagramFiles.ts) ---------------------
// The renderer keeps diagrams as inline base64 while editing, and only externalizes them to sibling
// `.svg` files at save time (inlining them back at load time). These handlers do just the fs + path
// work; all diagram detection/encoding stays in the renderer's tested src/lib helpers. A sibling `.svg`
// write does not trip the per-file `.md` watcher, so no internal-write suppression is needed here.

ipcMain.handle("diagram:read-svg", async (_event, payload) => {
  const documentPath = typeof payload?.documentPath === "string" ? payload.documentPath : "";
  const src = typeof payload?.src === "string" ? payload.src : "";
  const filePath = resolveLocalImageFilePath(documentPath, src);
  if (!filePath || !/\.svg$/i.test(filePath)) {
    return null;
  }
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
});

ipcMain.handle("diagram:write-svg", async (_event, payload) => {
  const documentPath = typeof payload?.documentPath === "string" ? payload.documentPath : "";
  const svgText = typeof payload?.svgText === "string" ? payload.svgText : "";
  const kind = payload?.kind === "isoflow" ? "isoflow" : "drawio";
  if (!documentPath || !svgText) {
    return { error: "no-document" };
  }
  // Content-hash name so an unchanged diagram reuses its file (no churn) and an edit makes a new one.
  const base = path.basename(documentPath).replace(/\.[^.]+$/, "");
  const hash = crypto.createHash("sha256").update(svgText, "utf8").digest("hex").slice(0, 10);
  const name = `${base}.${kind}.${hash}.svg`;
  const absPath = path.join(path.dirname(documentPath), name);
  try {
    await fs.writeFile(absPath, svgText, "utf8");
  } catch (error) {
    return { error: `Failed to write diagram file: ${error?.message ?? error}` };
  }
  return { src: imagePaths.toMarkdownImageSource(documentPath, absPath), name };
});

ipcMain.handle("diagram:cleanup-assets", async (_event, payload) => {
  const documentPath = typeof payload?.documentPath === "string" ? payload.documentPath : "";
  const keep = new Set(Array.isArray(payload?.keepNames) ? payload.keepNames : []);
  if (!documentPath) {
    return { removed: 0 };
  }
  const base = path.basename(documentPath).replace(/\.[^.]+$/, "");
  const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Only ever delete files this feature generated for THIS document — never arbitrary user `.svg`.
  const ownPattern = new RegExp(`^${escapedBase}\\.(?:drawio|isoflow)\\.[0-9a-f]{8,12}\\.svg$`, "i");
  let removed = 0;
  let entries;
  try {
    entries = await fs.readdir(path.dirname(documentPath));
  } catch {
    return { removed: 0 };
  }
  for (const entry of entries) {
    if (ownPattern.test(entry) && !keep.has(entry)) {
      try {
        await fs.unlink(path.join(path.dirname(documentPath), entry));
        removed += 1;
      } catch {
        // best-effort cleanup; ignore files we cannot remove
      }
    }
  }
  return { removed };
});

ipcMain.handle("drawio:edit", (event, payload) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  const initialXml = typeof payload?.xml === "string" ? payload.xml : "";
  return openDrawioEditor(parentWindow, initialXml);
});

ipcMain.handle("isoflow:edit", (event, payload) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  const initialModel = payload && typeof payload === "object" ? payload.model ?? null : null;
  return openIsoflowEditor(parentWindow, initialModel);
});

ipcMain.handle("edit:command", (event, command) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  runEditCommand(window, command);
});

ipcMain.handle("window:minimize", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window && !window.isDestroyed()) {
    window.minimize();
  }
});

ipcMain.handle("window:toggle-maximize", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window.isDestroyed()) {
    return;
  }
  if (window.isMaximized()) {
    window.unmaximize();
  } else {
    window.maximize();
  }
});

ipcMain.handle("window:close", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window && !window.isDestroyed()) {
    window.close();
  }
});

ipcMain.handle("window:is-maximized", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  return Boolean(window && !window.isDestroyed() && window.isMaximized());
});

ipcMain.handle("window:new", () => {
  createWindow();
});

ipcMain.handle("app:quit", () => {
  requestAppQuit();
});

ipcMain.handle("clipboard:write-html", (_event, payload) => {
  const html = typeof payload?.html === "string" ? payload.html : "";
  const text = typeof payload?.text === "string" ? payload.text : "";

  if (!html && !text) {
    return { written: false };
  }

  clipboard.write({ html, text });
  return { written: true };
});

ipcMain.handle("clipboard:copy-html-document", async (event, payload) => {
  debugLog("Copy HTML IPC handler started");
  return copyHtmlFromPayload(BrowserWindow.fromWebContents(event.sender), payload);
});

ipcMain.handle("image:to-data-url", async (_event, source) => {
  if (typeof source !== "string" || source.length === 0) {
    return null;
  }

  if (source.startsWith("data:")) {
    return source;
  }

  try {
    if (source.startsWith("file://")) {
      const filePath = fileURLToPath(source);
      const data = await fs.readFile(filePath);
      const mimeType = getImageMimeType(filePath);
      return `data:${mimeType};base64,${data.toString("base64")}`;
    }

    if (/^https?:\/\//i.test(source)) {
      const response = await fetch(source);
      if (!response.ok) {
        return null;
      }
      const contentType = response.headers.get("content-type") || "application/octet-stream";
      const buffer = Buffer.from(await response.arrayBuffer());
      return `data:${contentType};base64,${buffer.toString("base64")}`;
    }
  } catch {
    return null;
  }

  return null;
});

ipcMain.handle("app:get-profile-name", () => {
  try {
    return os.userInfo().username || "default";
  } catch {
    return "default";
  }
});

ipcMain.handle("app:get-version", () => app.getVersion());

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

ipcMain.handle("mcp:configure", async (_event, config) => {
  if (!config || typeof config !== "object") {
    return { ok: false, error: "invalid-config" };
  }

  const nextEnabled = typeof config.enabled === "boolean" ? config.enabled : false;
  const nextPortCandidate = Number(config.port);
  const nextPort =
    Number.isInteger(nextPortCandidate) && nextPortCandidate >= 1024 && nextPortCandidate <= 65535
      ? nextPortCandidate
      : 39125;
  const nextAuthMode = config.authMode === "none" ? "none" : "bearer";
  const nextToken = typeof config.bearerToken === "string" ? config.bearerToken : "";
  const nextNgrokEnabled = typeof config.ngrokEnabled === "boolean" ? config.ngrokEnabled : false;
  const nextNgrokDomain = typeof config.ngrokDomain === "string" ? config.ngrokDomain.trim() : "";
  const nextNgrokUseCustomPath =
    typeof config.ngrokUseCustomPath === "boolean" ? config.ngrokUseCustomPath : false;
  const nextNgrokPath = typeof config.ngrokPath === "string" ? config.ngrokPath.trim() : "";
  // Use the explicit path only when the user opted in and provided one; otherwise resolve from PATH.
  const nextNgrokCommand = nextNgrokUseCustomPath && nextNgrokPath ? nextNgrokPath : "ngrok";

  const result = await mcpServer.configure({
    enabled: nextEnabled,
    port: nextPort,
    authMode: nextAuthMode,
    bearerToken: nextToken,
    oauthClientStorePath: path.join(app.getPath("userData"), "mcp-oauth-clients.json")
  });

  // Manage the optional ngrok tunnel based on the live server state. A tunnel failure
  // must not affect the local MCP server result.
  const shouldTunnel = result.ok && result.listening && nextNgrokEnabled;
  if (shouldTunnel) {
    await ngrokTunnel.ensureTunnel({
      port: result.port ?? nextPort,
      domain: nextNgrokDomain,
      command: nextNgrokCommand
    });
  } else {
    await ngrokTunnel.stopTunnel();
  }

  const tunnelState = ngrokTunnel.getTunnelState();
  return {
    ...result,
    ngrok: {
      enabled: nextNgrokEnabled,
      connected: tunnelState.connected,
      url: tunnelState.url,
      error: tunnelState.error,
      domainFallback: Boolean(tunnelState.domainFallback)
    }
  };
});

ipcMain.handle("mcp:test-connection", async () => {
  const tunnelState = ngrokTunnel.getTunnelState();
  const ngrokUrl = tunnelState.connected ? tunnelState.url : null;
  return mcpServer.testConnection({ ngrokUrl });
});

function ngrokParamsFromConfig(config) {
  const domain = typeof config?.ngrokDomain === "string" ? config.ngrokDomain.trim() : "";
  const useCustomPath = typeof config?.ngrokUseCustomPath === "boolean" ? config.ngrokUseCustomPath : false;
  const path = typeof config?.ngrokPath === "string" ? config.ngrokPath.trim() : "";
  // Use the explicit path only when the user opted in and provided one; otherwise resolve from PATH.
  const command = useCustomPath && path ? path : "ngrok";
  return { domain, command };
}

function currentNgrokStatus(enabled) {
  const tunnelState = ngrokTunnel.getTunnelState();
  return {
    enabled: Boolean(enabled),
    connected: tunnelState.connected,
    url: tunnelState.url,
    error: tunnelState.error,
    domainFallback: Boolean(tunnelState.domainFallback)
  };
}

ipcMain.handle("mcp:stop-ngrok", async () => {
  await ngrokTunnel.stopTunnel();
  return currentNgrokStatus(false);
});

ipcMain.handle("mcp:restart-ngrok", async (_event, config) => {
  // Stop first so ensureTunnel spawns a fresh agent instead of treating the request as a no-op.
  await ngrokTunnel.stopTunnel();

  const ngrokEnabled = typeof config?.ngrokEnabled === "boolean" ? config.ngrokEnabled : false;
  const info = mcpServer.getListeningInfo();
  if (info.listening && ngrokEnabled) {
    const { domain, command } = ngrokParamsFromConfig(config);
    await ngrokTunnel.ensureTunnel({ port: info.port, domain, command });
  }

  return currentNgrokStatus(ngrokEnabled);
});

ipcMain.on("mcp:register-window", (event, payload) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window.isDestroyed()) {
    return;
  }

  const webContentsId = event.sender.id;
  const windowId =
    typeof payload?.windowId === "string" && payload.windowId.length > 0
      ? payload.windowId
      : `nexus-${webContentsId}`;

  mcpWindowRecords.set(webContentsId, {
    windowId,
    webContentsId,
    browserWindowId: window.id,
    title: typeof payload?.title === "string" ? payload.title : "Untitled",
    filePath: typeof payload?.filePath === "string" ? payload.filePath : null,
    dirty: Boolean(payload?.dirty),
    markdown: typeof payload?.markdown === "string" ? payload.markdown : "",
    exportOptions:
      typeof payload?.exportOptions === "object" && payload.exportOptions !== null
        ? payload.exportOptions
        : {}
  });

  if (window.isFocused()) {
    mcpFocusedWindowId = windowId;
  }
});

ipcMain.on("mcp:update-window-state", (event, payload) => {
  const record = mcpWindowRecords.get(event.sender.id);
  if (!record || !payload || typeof payload !== "object") {
    return;
  }

  if (typeof payload.title === "string") {
    record.title = payload.title;
  }
  if (typeof payload.filePath === "string" || payload.filePath === null) {
    record.filePath = payload.filePath;
  }
  if (typeof payload.dirty === "boolean") {
    record.dirty = payload.dirty;
  }
  if (typeof payload.markdown === "string") {
    record.markdown = payload.markdown;
  }
  if (typeof payload.exportOptions === "object" && payload.exportOptions !== null) {
    record.exportOptions = payload.exportOptions;
  }
});

ipcMain.on("mcp:unregister-window", (event) => {
  const record = mcpWindowRecords.get(event.sender.id);
  if (!record) {
    return;
  }

  mcpWindowRecords.delete(event.sender.id);

  for (const [requestId, pending] of mcpPendingWrites.entries()) {
    if (pending.webContentsId === record.webContentsId) {
      pending.resolve({ applied: false, reason: "window-closed" });
      mcpPendingWrites.delete(requestId);
    }
  }

  rejectPendingMcpSelectionsForWebContents(record.webContentsId);

  if (mcpFocusedWindowId === record.windowId) {
    mcpFocusedWindowId = null;
  }
});

ipcMain.on("mcp:write-decision", (_event, payload) => {
  if (!payload || typeof payload !== "object") {
    return;
  }

  const { requestId, decision } = payload;
  if (typeof requestId !== "string") {
    return;
  }

  const pending = mcpPendingWrites.get(requestId);
  if (!pending) {
    return;
  }

  mcpPendingWrites.delete(requestId);
  if (decision === "approve") {
    pending.resolve({ applied: true });
  } else {
    pending.resolve({ applied: false, reason: "user-rejected" });
  }
});

ipcMain.on("mcp:selection-result", (_event, payload) => {
  if (!payload || typeof payload !== "object") {
    return;
  }

  const { requestId, selection } = payload;
  if (typeof requestId !== "string") {
    return;
  }

  finishMcpSelection(requestId, normalizeSelectionResult(selection));
});

ipcMain.on("menu:set-state", (_event, state) => {
  if (!state || typeof state !== "object") {
    return;
  }

  let changed = false;
  if (Number.isFinite(state.editorZoomPercent)) {
    const nextEditorZoomPercent = Math.round(state.editorZoomPercent);
    if (nextEditorZoomPercent !== menuState.editorZoomPercent) {
      menuState.editorZoomPercent = nextEditorZoomPercent;
      changed = true;
    }
  }

  if (typeof state.showInvisibleCharacters === "boolean" &&
      state.showInvisibleCharacters !== menuState.showInvisibleCharacters) {
    menuState.showInvisibleCharacters = state.showInvisibleCharacters;
    changed = true;
  }

  if (typeof state.spellCheckEnabled === "boolean" &&
      state.spellCheckEnabled !== menuState.spellCheckEnabled) {
    menuState.spellCheckEnabled = state.spellCheckEnabled;
    changed = true;
  }

  if (typeof state.outlineVisible === "boolean" &&
      state.outlineVisible !== menuState.outlineVisible) {
    menuState.outlineVisible = state.outlineVisible;
    changed = true;
  }

  if ((state.pageOrientation === "portrait" || state.pageOrientation === "landscape") &&
      state.pageOrientation !== menuState.pageOrientation) {
    menuState.pageOrientation = state.pageOrientation;
    changed = true;
  }

  if (typeof state.responsiveContentWrappingEnabled === "boolean" &&
      state.responsiveContentWrappingEnabled !== menuState.responsiveContentWrappingEnabled) {
    menuState.responsiveContentWrappingEnabled = state.responsiveContentWrappingEnabled;
    changed = true;
  }

  if (typeof state.paperViewEnabled === "boolean" &&
      state.paperViewEnabled !== menuState.paperViewEnabled) {
    menuState.paperViewEnabled = state.paperViewEnabled;
    changed = true;
  }

  if (typeof state.aiChatVisible === "boolean" &&
      state.aiChatVisible !== menuState.aiChatVisible) {
    menuState.aiChatVisible = state.aiChatVisible;
    changed = true;
  }

  if ((state.editorViewMode === "rich-text" ||
      state.editorViewMode === "source" ||
      state.editorViewMode === "diff") &&
      state.editorViewMode !== menuState.editorViewMode) {
    menuState.editorViewMode = state.editorViewMode;
    changed = true;
  }

  if (changed) {
    buildMenu();
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
  if (process.platform === "darwin" && !app.isPackaged) {
    // Packaged builds already get the padded dock icon from the bundle's nexus.icns
    // (electron-builder applies build.mac.icon at build time), so we only override the
    // dock icon in dev, where the dock would otherwise show Electron's default icon.
    // Note: pass the PNG, not the .icns — nativeImage cannot decode the ICNS container,
    // and passing it to dock.setIcon throws, which used to abort startup before the
    // window was ever created. Keep this in a try/catch so a cosmetic dock-icon failure
    // can never block window creation.
    const dockIconPath = getAppIconPath();
    if (dockIconPath) {
      try {
        app.dock?.setIcon(dockIconPath);
      } catch (error) {
        console.error("Failed to set macOS dock icon:", error);
      }
    }
  }

  // None of the remaining startup steps are essential to actually showing a window, so each is
  // guarded: a failure in recent-files loading, menu building, or initial-file resolution must not
  // black-hole startup. (An unguarded throw here previously left the app running with a dock icon
  // but no window and the default menu — the macOS dock-icon regression.)
  try {
    loadRecentFiles();
  } catch (error) {
    console.error("Failed to load recent files:", error);
  }

  try {
    buildMenu();
  } catch (error) {
    console.error("Failed to build the application menu:", error);
  }

  let argvFilePaths = [];
  try {
    argvFilePaths = await getOpenableFilePaths(process.argv);
  } catch (error) {
    console.error("Failed to resolve files from launch arguments:", error);
  }
  const initialFilePaths = [...argvFilePaths, ...pendingExternalFilePaths];
  pendingExternalFilePaths.length = 0;

  if (initialFilePaths.length > 0) {
    try {
      await openFilesInNewWindows(initialFilePaths);
    } catch (error) {
      console.error("Failed to open initial files:", error);
    }
  }

  // Whatever happened above, guarantee the user ends up with a window.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
})
  .catch((error) => {
    // Last-resort net: the steps above are individually guarded, so reaching here means something
    // unexpected threw. Still try to surface a window so the app is never a dock icon with no UI.
    console.error("Unexpected error during startup:", error);
    if (BrowserWindow.getAllWindows().length === 0) {
      try {
        createWindow();
      } catch (fallbackError) {
        console.error("Failed to create fallback window:", fallbackError);
      }
    }
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

app.on("will-quit", () => {
  rejectAllPendingMcpWrites("app-quit");
  void mcpServer.stop();
  // Kill the ngrok agent synchronously so it cannot outlive the app: the async stopTunnel chain is
  // not guaranteed to run before the process terminates after will-quit.
  ngrokTunnel.killTunnelSync();
});

// Last-resort synchronous teardown for graceful exit paths that bypass will-quit (e.g. an explicit
// process.exit). Cannot run on a hard kill (SIGKILL) or crash, where no JavaScript executes.
process.on("exit", () => {
  ngrokTunnel.killTunnelSync();
});
