const path = require("node:path");
const fs = require("node:fs/promises");
const { existsSync, watch } = require("node:fs");
const os = require("node:os");
const { pathToFileURL, fileURLToPath } = require("node:url");
const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain } = require("electron");
const htmlToDocx = require("@turbodocx/html-to-docx");

const mcpServer = require("./mcp-server.cjs");

const isDev = Boolean(process.env.NEXUS_DEV_SERVER_URL);
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

function mcpGetDocument(windowId) {
  const record = windowId
    ? findMcpWindowByWindowId(windowId)
    : findMcpFocusedWindow();

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

function rejectAllPendingMcpWrites(reason) {
  for (const pending of mcpPendingWrites.values()) {
    pending.resolve({ applied: false, reason });
  }
  mcpPendingWrites.clear();
}

mcpServer.setHost({
  listWindows: mcpListWindows,
  getDocument: mcpGetDocument,
  rejectAllPendingWrites: rejectAllPendingMcpWrites,
  requestReplaceDocument: ({ windowId, markdown, clientLabel }) => {
    return new Promise((resolve) => {
      const record = windowId ? findMcpWindowByWindowId(windowId) : findMcpFocusedWindow();
      if (!record) {
        resolve({ applied: false, reason: "no-window" });
        return;
      }

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
          markdown,
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
});

const openableFileExtensions = new Set([".md", ".markdown", ".mdx", ".txt"]);
const admonitionTypes = new Set(["note", "tip", "danger", "info", "caution"]);
const fileWatchDebounceMs = 350;
const internalWriteSuppressMs = 1500;
const exportProgressPaintDelayMs = 80;
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

    h1:first-child, h2:first-child, h3:first-child {
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
      border: 1px solid #cbd5e1;
      border-left-width: 5px;
      border-radius: 8px;
      background: #f8fafc;
      margin: 1.2em 0;
      padding: 0.85em 1em;
    }

    .nexus-export-admonition-title {
      font-weight: 700;
      margin-bottom: 0.45em;
    }

    .nexus-export-admonition-content > :last-child {
      margin-bottom: 0;
    }

    .nexus-export-admonition-note {
      border-left-color: #3b82f6;
    }

    .nexus-export-admonition-tip {
      border-left-color: #16a34a;
      background: #f0fdf4;
    }

    .nexus-export-admonition-info {
      border-left-color: #0891b2;
      background: #ecfeff;
    }

    .nexus-export-admonition-caution {
      border-left-color: #f59e0b;
      background: #fffbeb;
    }

    .nexus-export-admonition-danger {
      border-left-color: #dc2626;
      background: #fff5f5;
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

function createExportProgressWindow(parentWindow, title, message) {
  const hasParent = parentWindow && !parentWindow.isDestroyed();
  const progressWindow = new BrowserWindow({
    parent: hasParent ? parentWindow : undefined,
    modal: Boolean(hasParent),
    show: false,
    width: 380,
    height: 170,
    resizable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    fullscreenable: false,
    title,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const html = `<!doctype html>
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
      box-sizing: border-box;
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      padding: 24px;
      background: #ffffff;
    }

    main {
      width: 100%;
      display: grid;
      gap: 14px;
      justify-items: center;
      text-align: center;
    }

    .spinner {
      width: 28px;
      height: 28px;
      border: 3px solid #d1d5db;
      border-top-color: #2563eb;
      border-radius: 999px;
      animation: spin 0.8s linear infinite;
    }

    h1 {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
      line-height: 1.3;
    }

    p {
      margin: 0;
      max-width: 30ch;
      color: #4b5563;
      font-size: 13px;
      line-height: 1.45;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  </style>
</head>
<body>
  <main>
    <div class="spinner" aria-hidden="true"></div>
    <h1>${escapeHtmlText(title)}</h1>
    <p>${escapeHtmlText(message)}</p>
  </main>
</body>
</html>`;

  void progressWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  progressWindow.once("ready-to-show", () => {
    if (!progressWindow.isDestroyed()) {
      progressWindow.show();
    }
  });

  return progressWindow;
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

async function withExportProgressWindow(parentWindow, title, message, task) {
  const progressWindow = createExportProgressWindow(parentWindow, title, message);

  try {
    await delay(exportProgressPaintDelayMs);
    return await task();
  } finally {
    if (!progressWindow.isDestroyed()) {
      progressWindow.destroy();
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
    fontFamily: options.fontFamily,
    fontSizePixels: options.fontSizePixels,
    inlineFontAssets: true,
    inlineLocalImages: true,
    paragraphSpacingPixels: options.paragraphSpacingPixels
  });

  try {
    return await renderMermaidInExportHtml(html, {
      diagramsAsImages: true,
      loadFromTemporaryFile: true
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Export HTML kept rendered Markdown HTML after Mermaid render failure: ${message}`);
    return html;
  }
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
  const markdownWithAdmonitions = await renderMarkdownAdmonitions(
    sourceMarkdown,
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

    return await withExportProgressWindow(
      window,
      "Exporting HTML",
      "Rendering diagrams and writing the HTML file. Please wait.",
      async () => {
        const html = await renderBaselineExportHtml(markdown, currentPath, options);

        await fs.writeFile(result.filePath, html, "utf8");
        console.log(`Export HTML wrote baseline rendered HTML file: ${result.filePath}`);

        const renderedHtml = await tryEnhanceExportHtmlWithMermaidPngs(
          html,
          "Export HTML kept baseline file after Mermaid PNG enhancement failure"
        );
        if (renderedHtml !== html) {
          await fs.writeFile(result.filePath, renderedHtml, "utf8");
          console.log(`Export HTML wrote Mermaid PNG-enhanced HTML file: ${result.filePath}`);
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

    return await withExportProgressWindow(
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
        console.log(`Export Word wrote DOCX file with ${wordFontFamily} font: ${result.filePath}`);

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
    return await withExportProgressWindow(
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
        console.log("Copy HTML wrote rendered document HTML to clipboard");

        return { copied: true };
      }
    );
  } catch (error) {
    await showExportErrorForWindow(window, "HTML", error);
    return { copied: false };
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
      sandbox: true,
      spellcheck: true
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

    const record = mcpWindowRecords.get(webContentsId);
    if (record) {
      mcpWindowRecords.delete(webContentsId);
      for (const [requestId, pending] of mcpPendingWrites.entries()) {
        if (pending.webContentsId === webContentsId) {
          pending.resolve({ applied: false, reason: "window-closed" });
          mcpPendingWrites.delete(requestId);
        }
      }
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

const menuState = {
  editorZoomPercent: 100,
  showInvisibleCharacters: false
};

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
            console.log("Export as HTML menu item clicked");
            const window =
              browserWindow && !browserWindow.isDestroyed()
                ? browserWindow
                : BrowserWindow.getFocusedWindow();
            const record = window ? mcpWindowRecords.get(window.webContents.id) : null;

            if (record) {
              console.log("Export as HTML menu item using main-process document snapshot");
              void exportHtmlFromPayload(window, {
                currentPath: record.filePath,
                markdown: record.markdown ?? "",
                options: {}
              });
              return;
            }

            console.log("Export as HTML menu item forwarding to renderer");
            sendMenuAction("exportHtml");
          }
        },
        {
          label: "Export to Word",
          click: (_menuItem, browserWindow) => {
            console.log("Export to Word menu item clicked");
            const window =
              browserWindow && !browserWindow.isDestroyed()
                ? browserWindow
                : BrowserWindow.getFocusedWindow();
            const record = window ? mcpWindowRecords.get(window.webContents.id) : null;

            if (record) {
              console.log("Export to Word menu item using main-process document snapshot");
              void exportWordFromPayload(window, {
                currentPath: record.filePath,
                markdown: record.markdown ?? "",
                options: record.exportOptions?.word ?? {}
              });
              return;
            }

            console.log("Export to Word menu item forwarding to renderer");
            sendMenuAction("exportWord");
          }
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
          label: "Find",
          accelerator: "CmdOrCtrl+F",
          click: () => sendMenuAction("find")
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
  console.log("Export HTML IPC handler started");
  return exportHtmlFromPayload(BrowserWindow.fromWebContents(event.sender), payload);
});

ipcMain.handle("file:export-word", async (event, payload) => {
  console.log("Export Word IPC handler started");
  return exportWordFromPayload(BrowserWindow.fromWebContents(event.sender), payload);
});

ipcMain.handle("file:export-pdf", async (event, payload) => {
  const { currentPath, markdown, options } = payload ?? {};
  const pageSize = getPdfPageSize(options?.pageSize);
  const pageMargins = getPdfPageMargins(options?.pageMargins);
  const landscape = getPdfPageOrientation(options?.pageOrientation) === "landscape";
  let exportWindow;

  try {
    const html = await renderMarkdownExportHtml(markdown, currentPath, {
      excludeFrontmatter: true,
      fontFamily: options?.fontFamily,
      fontSizePixels: options?.fontSizePixels,
      paragraphSpacingPixels: options?.paragraphSpacingPixels
    });
    const result = await dialog.showSaveDialog({
      title: "Export PDF",
      defaultPath: getDefaultExportPath(currentPath, "pdf"),
      filters: pdfFilters
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

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
  console.log("Copy HTML IPC handler started");
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

  return mcpServer.configure({
    enabled: nextEnabled,
    port: nextPort,
    authMode: nextAuthMode,
    bearerToken: nextToken
  });
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

app.on("will-quit", () => {
  rejectAllPendingMcpWrites("app-quit");
  void mcpServer.stop();
});
