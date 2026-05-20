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
const admonitionTypes = new Set(["note", "tip", "danger", "info", "caution"]);
const fileWatchDebounceMs = 350;
const internalWriteSuppressMs = 1500;
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
const defaultExportFontSizePixels = 16;
const minExportFontSizePixels = 12;
const maxExportFontSizePixels = 24;
const defaultExportParagraphSpacingPixels = 16;
const minExportParagraphSpacingPixels = 0;
const maxExportParagraphSpacingPixels = 32;
const defaultPdfPageMarginInches = 1;
const minPdfPageMarginInches = 0.25;
const maxPdfPageMarginInches = 2;
const pdfPixelsPerInch = 96;
const pdfPointsPerInch = 72;
const pdfPageSizeDimensionsInches = new Map([
  ["Letter", { width: 8.5, height: 11 }],
  ["A4", { width: 8.27, height: 11.69 }]
]);
const pdfPageSizes = new Set(pdfPageSizeDimensionsInches.keys());
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

function getPdfPageSize(value) {
  return pdfPageSizes.has(value) ? value : "Letter";
}

function getPdfPageOrientation(value) {
  return pdfPageOrientations.has(value) ? value : "portrait";
}

function formatCssInches(value) {
  return `${Number(value).toFixed(3).replace(/\.?0+$/, "")}in`;
}

function getPdfPageDimensions(value, orientation) {
  const pageSize = getPdfPageSize(value);
  const dimensions = pdfPageSizeDimensionsInches.get(pageSize) ?? pdfPageSizeDimensionsInches.get("Letter");

  if (orientation === "landscape") {
    return {
      width: dimensions.height,
      height: dimensions.width
    };
  }

  return dimensions;
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

function getExportFontCssImportRules(value) {
  const fontFamily = getExportFontFamily(value);
  const cssImports = exportFontCssImportsByFamily.get(fontFamily) ?? [];

  return cssImports
    .map((cssPath) => `@import url("${pathToFileURL(require.resolve(cssPath)).href}");`)
    .join("\n");
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
    top: getPdfPageMargin(margins.top),
    bottom: getPdfPageMargin(margins.bottom),
    left: getPdfPageMargin(margins.left),
    right: getPdfPageMargin(margins.right)
  };
}

function getElectronPdfMargins(value) {
  return getPdfPageMargins(value);
}

function getElectronPdfOptions(options = {}) {
  return {
    pageSize: getPdfPageSize(options.pageSize),
    landscape: getPdfPageOrientation(options.pageOrientation) === "landscape",
    margins: getElectronPdfMargins(options.pageMargins),
    printBackground: true
  };
}

function getPdfPrintStyle(options = {}) {
  const pageOrientation = getPdfPageOrientation(options.pageOrientation);
  const pageDimensions = getPdfPageDimensions(options.pageSize, pageOrientation);
  const pageMargins = getPdfPageMargins(options.pageMargins);

  return `
    @page {
      size: ${formatCssInches(pageDimensions.width)} ${formatCssInches(pageDimensions.height)};
      margin: ${formatCssInches(pageMargins.top)} ${formatCssInches(pageMargins.right)} ${formatCssInches(pageMargins.bottom)} ${formatCssInches(pageMargins.left)};
    }
  `;
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

function buildExportHtmlDocument(title, bodyHtml, options = {}) {
  const escapedTitle = escapeHtmlAttribute(title);
  const fontFamily = getExportFontFamily(options.fontFamily);
  const fontCssImportRules = getExportFontCssImportRules(fontFamily);
  const fontSizePixels = getExportFontSize(options.fontSizePixels);
  const paragraphSpacingPixels = getExportParagraphSpacing(options.paragraphSpacingPixels);
  const pdfPrintStyle = options.pdfPrintStyle ?? "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapedTitle}</title>
  <style>
${fontCssImportRules}
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
      line-height: 1.25;
      margin: 1.6em 0 0.6em;
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

    .nexus-export-mermaid svg {
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
      return `<mark>${this.parser.parseInline(token.tokens)}</mark>`;
    }
  };
}

function getPdfExportWindowSize(options = {}) {
  const pageOrientation = getPdfPageOrientation(options.pageOrientation);
  const dimensions = getPdfPageDimensions(options.pageSize, pageOrientation);

  return {
    width: Math.ceil(dimensions.width * pdfPixelsPerInch),
    height: Math.ceil(dimensions.height * pdfPixelsPerInch)
  };
}

function createExportWindow(options = {}) {
  const visible = options.visible === true;
  const windowSize = getPdfExportWindowSize(options.pdfOptions);

  return new BrowserWindow({
    width: windowSize.width,
    height: windowSize.height,
    minWidth: windowSize.width,
    minHeight: windowSize.height,
    x: visible ? -32000 : undefined,
    y: visible ? -32000 : undefined,
    show: visible,
    focusable: !visible,
    skipTaskbar: visible,
    useContentSize: true,
    backgroundColor: "#ffffff",
    paintWhenInitiallyHidden: true,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: false
    }
  });
}

async function loadExportHtml(exportWindow, html) {
  const tempDirectory = await fs.mkdtemp(path.join(app.getPath("temp"), "nexus-export-"));
  const tempHtmlPath = path.join(tempDirectory, "export.html");

  try {
    await fs.writeFile(tempHtmlPath, html, "utf8");
    await exportWindow.loadFile(tempHtmlPath);
  } catch (error) {
    await fs.rm(tempDirectory, { recursive: true, force: true });
    throw error;
  }

  return async () => {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  };
}

async function renderExportMermaidDiagrams(webContents) {
  const mermaidScriptUrl = pathToFileURL(require.resolve("mermaid/dist/mermaid.min.js")).href;

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
            diagram.innerHTML = result.svg;
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

async function waitForExportDocumentReady(webContents) {
  await webContents.executeJavaScript(
    `
      (async () => {
        await document.fonts?.ready;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      })();
    `,
    true
  );
}

async function serializeRenderedExportHtml(webContents) {
  const html = await webContents.executeJavaScript("document.documentElement.outerHTML", true);
  return `<!doctype html>\n${html}`;
}

async function printExportHtmlToPdf(html, printOptions, options = {}) {
  let exportWindow;
  let cleanupExportHtml;

  try {
    exportWindow = createExportWindow(options);
    cleanupExportHtml = await loadExportHtml(exportWindow, html);
    if (options.visible) {
      exportWindow.blur();
    }
    await renderExportMermaidDiagrams(exportWindow.webContents);
    await waitForExportDocumentReady(exportWindow.webContents);

    return exportWindow.webContents.printToPDF(printOptions);
  } finally {
    if (cleanupExportHtml) {
      await cleanupExportHtml();
    }

    if (exportWindow && !exportWindow.isDestroyed()) {
      exportWindow.destroy();
    }
  }
}

function sanitizeFallbackPdfText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "?")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

function escapeFallbackPdfText(value) {
  return sanitizeFallbackPdfText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function simplifyFallbackMarkdownLine(line) {
  let text = sanitizeFallbackPdfText(line).trimEnd();

  if (/^ {0,3}#{1,6}\s+/.test(text)) {
    text = text.replace(/^ {0,3}#{1,6}\s+/, "").toUpperCase();
  }

  text = text
    .replace(/^ {0,3}>\s?/, "> ")
    .replace(/^ {0,3}[-*+]\s+/, "- ")
    .replace(/^ {0,3}!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, source) => {
      const label = String(alt || source || "image").trim();
      return `[Image: ${label}]`;
    })
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/[*_~`]/g, "")
    .replace(/==([^=]+)==/g, "$1");

  return text;
}

function getFallbackPdfLines(markdown, currentPath, printError) {
  const lines = [
    getDocumentTitleForExport(currentPath),
    "",
    "Nexus generated this text-first PDF because Electron's native PDF printer failed.",
    `Original print error: ${printError instanceof Error ? printError.message : String(printError)}`,
    ""
  ];
  const source = stripMarkdownFrontmatter(markdown);
  let isInFence = false;

  for (const rawLine of source.split(/\r?\n/)) {
    if (isFenceBoundary(rawLine)) {
      isInFence = !isInFence;
      lines.push(isInFence ? "Code block:" : "");
      continue;
    }

    lines.push(simplifyFallbackMarkdownLine(rawLine));
  }

  return lines;
}

function wrapFallbackPdfLine(line, maxCharacters) {
  const text = sanitizeFallbackPdfText(line);
  if (text.trim().length === 0) {
    return [""];
  }

  const indentMatch = text.match(/^\s*/);
  const indent = indentMatch ? indentMatch[0] : "";
  const words = text.trim().split(/\s+/);
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    if (word.length > maxCharacters) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = "";
      }

      for (let index = 0; index < word.length; index += maxCharacters) {
        lines.push(word.slice(index, index + maxCharacters));
      }
      continue;
    }

    const candidate = currentLine ? `${currentLine} ${word}` : `${indent}${word}`;
    if (candidate.length > maxCharacters && currentLine) {
      lines.push(currentLine);
      currentLine = `${indent}${word}`;
    } else {
      currentLine = candidate;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function buildFallbackPdfDocument(pageContents, pageWidthPoints, pageHeightPoints) {
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  const objects = [];
  const pageObjectIds = [];
  const fontObjectId = 3 + pageContents.length * 2;

  for (let index = 0; index < pageContents.length; index += 1) {
    pageObjectIds.push(3 + index * 2);
  }

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageContents.length} >>`;

  for (const [index, content] of pageContents.entries()) {
    const pageObjectId = pageObjectIds[index];
    const contentObjectId = pageObjectId + 1;
    objects[pageObjectId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidthPoints.toFixed(2)} ${pageHeightPoints.toFixed(2)}] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`;
    objects[contentObjectId] =
      `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`;
  }

  objects[fontObjectId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(pdf, "latin1");
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += "0000000000 65535 f \n";

  for (let id = 1; id < objects.length; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

function renderMarkdownFallbackPdf(markdown, currentPath, options = {}, printError) {
  const pageOrientation = getPdfPageOrientation(options.pageOrientation);
  const dimensions = getPdfPageDimensions(options.pageSize, pageOrientation);
  const margins = getPdfPageMargins(options.pageMargins);
  const pageWidthPoints = dimensions.width * pdfPointsPerInch;
  const pageHeightPoints = dimensions.height * pdfPointsPerInch;
  const leftMarginPoints = margins.left * pdfPointsPerInch;
  const topMarginPoints = margins.top * pdfPointsPerInch;
  const bottomMarginPoints = margins.bottom * pdfPointsPerInch;
  const contentWidthPoints = pageWidthPoints - leftMarginPoints - margins.right * pdfPointsPerInch;
  const fontSizePoints = getExportFontSize(options.fontSizePixels) * 0.75;
  const lineHeightPoints = Math.max(fontSizePoints * 1.35, fontSizePoints + 4);
  const maxCharacters = Math.max(24, Math.floor(contentWidthPoints / (fontSizePoints * 0.52)));
  const pageContents = [];
  let contentLines = [];
  let y = pageHeightPoints - topMarginPoints;

  function startNewPage() {
    if (contentLines.length > 0) {
      pageContents.push(contentLines.join("\n"));
    }

    contentLines = [];
    y = pageHeightPoints - topMarginPoints;
  }

  for (const line of getFallbackPdfLines(markdown, currentPath, printError)) {
    for (const wrappedLine of wrapFallbackPdfLine(line, maxCharacters)) {
      if (y < bottomMarginPoints + lineHeightPoints) {
        startNewPage();
      }

      if (wrappedLine.length > 0) {
        contentLines.push(
          `BT /F1 ${fontSizePoints.toFixed(2)} Tf 1 0 0 1 ${leftMarginPoints.toFixed(2)} ${y.toFixed(2)} Tm (${escapeFallbackPdfText(wrappedLine)}) Tj ET`
        );
      }

      y -= lineHeightPoints;
    }
  }

  startNewPage();

  if (pageContents.length === 0) {
    pageContents.push("");
  }

  return buildFallbackPdfDocument(pageContents, pageWidthPoints, pageHeightPoints);
}

async function renderMermaidInExportHtml(html) {
  if (!hasExportMermaidPlaceholder(html)) {
    return html;
  }

  let exportWindow;
  let cleanupExportHtml;

  try {
    exportWindow = createExportWindow();
    cleanupExportHtml = await loadExportHtml(exportWindow, html);
    await renderExportMermaidDiagrams(exportWindow.webContents);
    return serializeRenderedExportHtml(exportWindow.webContents);
  } finally {
    if (cleanupExportHtml) {
      await cleanupExportHtml();
    }

    if (exportWindow && !exportWindow.isDestroyed()) {
      exportWindow.destroy();
    }
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

  renderer.code = (token) => {
    if (!isMermaidFence(getCodeTokenLanguage(token))) {
      return defaultCodeRenderer(token);
    }

    return [
      '<figure class="nexus-export-mermaid">',
      `<pre class="nexus-export-mermaid-source">${escapeHtmlText(token.text)}</pre>`,
      "</figure>"
    ].join("");
  };

  const marked = new Marked({
    async: true,
    breaks: false,
    extensions: [createMarkedHighlightExtension()],
    gfm: true,
    renderer
  });
  const sourceMarkdown = options.excludeFrontmatter
    ? stripMarkdownFrontmatter(markdown)
    : markdown ?? "";
  const markdownWithAdmonitions = await renderMarkdownAdmonitions(sourceMarkdown, (content) =>
    marked.parse(content)
  );
  const bodyHtml = await marked.parse(markdownWithAdmonitions);
  return buildExportHtmlDocument(getDocumentTitleForExport(currentPath), bodyHtml, {
    fontFamily: options.fontFamily,
    fontSizePixels: options.fontSizePixels,
    paragraphSpacingPixels: options.paragraphSpacingPixels,
    pdfPrintStyle: options.pdfPrintStyle
  });
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

async function renderMarkdownPdf(markdown, currentPath, options = {}) {
  const html = await renderMarkdownExportHtml(markdown, currentPath, {
    excludeFrontmatter: true,
    fontFamily: options?.fontFamily,
    fontSizePixels: options?.fontSizePixels,
    paragraphSpacingPixels: options?.paragraphSpacingPixels,
    pdfPrintStyle: getPdfPrintStyle(options)
  });

  try {
    return await printExportHtmlToPdf(html, {
      preferCSSPageSize: true,
      printBackground: true
    }, {
      pdfOptions: options
    });
  } catch (error) {
    console.warn("CSS-sized hidden PDF generation failed; retrying with Electron page options.", error);
  }

  const fallbackHtml = await renderMarkdownExportHtml(markdown, currentPath, {
    excludeFrontmatter: true,
    fontFamily: options?.fontFamily,
    fontSizePixels: options?.fontSizePixels,
    paragraphSpacingPixels: options?.paragraphSpacingPixels
  });

  try {
    return await printExportHtmlToPdf(fallbackHtml, getElectronPdfOptions(options), {
      pdfOptions: options
    });
  } catch (error) {
    console.warn("Configured hidden PDF generation failed; retrying with default print options.", error);
  }

  try {
    return await printExportHtmlToPdf(fallbackHtml, { printBackground: true }, {
      pdfOptions: options
    });
  } catch (error) {
    console.warn("Default hidden PDF generation failed; retrying in an off-screen export window.", error);
  }

  try {
    return await printExportHtmlToPdf(fallbackHtml, { printBackground: true }, {
      pdfOptions: options,
      visible: true
    });
  } catch (error) {
    console.warn("Off-screen PDF generation failed; using text-first fallback PDF renderer.", error);
    return renderMarkdownFallbackPdf(markdown, currentPath, options, error);
  }
}

async function showPdfSaveDialog(currentPath) {
  const result = await dialog.showSaveDialog({
    title: "Export PDF",
    defaultPath: getDefaultExportPath(currentPath, "pdf"),
    filters: pdfFilters
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  return { canceled: false, filePath: result.filePath };
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

  window.on("closed", () => {
    stopFileWatcher(webContentsId);
    pendingInitialFiles.delete(webContentsId);
    closeStates.delete(window);

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
  const { currentPath, markdown, options } = payload ?? {};

  try {
    const html = await renderMarkdownExportHtml(markdown, currentPath, {
      fontFamily: options?.fontFamily,
      fontSizePixels: options?.fontSizePixels,
      paragraphSpacingPixels: options?.paragraphSpacingPixels
    });
    const result = await dialog.showSaveDialog({
      title: "Export HTML",
      defaultPath: getDefaultExportPath(currentPath, "html"),
      filters: htmlFilters
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    const renderedHtml = await renderMermaidInExportHtml(html);
    await fs.writeFile(result.filePath, renderedHtml, "utf8");
    return { canceled: false, filePath: result.filePath };
  } catch (error) {
    await showExportError(event, "HTML", error);
    return { canceled: true };
  }
});

ipcMain.handle("file:export-pdf", async (event, payload) => {
  const { currentPath, markdown, options } = payload ?? {};

  try {
    const result = await showPdfSaveDialog(currentPath);

    if (result.canceled) {
      return { canceled: true };
    }

    const pdf = await renderMarkdownPdf(markdown, currentPath, options);
    await fs.writeFile(result.filePath, pdf);
    return { canceled: false, filePath: result.filePath };
  } catch (error) {
    await showExportError(event, "PDF", error);
    return { canceled: true };
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
