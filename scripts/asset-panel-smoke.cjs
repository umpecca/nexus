// Real renderer/preload and asset IPC; native pickers operate only on disposable fixture files.
const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const { createRendererIpc } = require("../electron/rendererIpc.cjs");
const { registerAssetHandlers, localPath } = require("../electron/documentAssets.cjs");
let window, root, state, filePath, original, choose, releasePicker;
let exitCode = 0;
const deadline = setTimeout(() => { console.error("Asset panel smoke timed out."); app.exit(1); }, 45000);
app.on("window-all-closed", () => {});
const evaluate = async code => {
  try { return await window.webContents.executeJavaScript(code); }
  catch (error) { throw new Error(`Renderer evaluation failed: ${code}`, { cause: error }); }
};
async function until(condition) {
  const end = Date.now() + 6000;
  while (!await condition()) { if (Date.now() > end) throw new Error(`Timed out: ${condition}`); await new Promise(resolve => setTimeout(resolve, 25)); }
}
const wait = code => until(() => evaluate(code));
async function click(text, row) {
  await wait(`(() => {
    const root = ${row === undefined ? "document" : `document.querySelectorAll('.nexus-asset-row')[${row}]`};
    return !!root && [...root.querySelectorAll('button')].some(button => (button.textContent === ${JSON.stringify(text)} || button.getAttribute('aria-label') === ${JSON.stringify(text)}) && !button.disabled);
  })()`);
  await evaluate(`(() => {
    const root = ${row === undefined ? "document" : `document.querySelectorAll('.nexus-asset-row')[${row}]`};
    const button = [...root.querySelectorAll('button')].find(button => button.textContent === ${JSON.stringify(text)} || button.getAttribute('aria-label') === ${JSON.stringify(text)});
    if (!button || button.disabled) throw new Error('Unavailable button: ' + ${JSON.stringify(text)});
    button.click();
  })()`);
}
async function source() {
  if (!await evaluate("!!document.querySelector('.mdxeditor-source-editor .cm-content')")) {
    await evaluate(`document.querySelector('[aria-label="Switch to Source"]').click()`);
    await wait("!!document.querySelector('.mdxeditor-source-editor .cm-content')");
  }
}
async function key(keyCode) {
  await evaluate("document.querySelector('.mdxeditor-source-editor .cm-content').focus()");
  window.webContents.sendInputEvent({ type: "keyDown", keyCode, modifiers: ["control"] });
  window.webContents.sendInputEvent({ type: "keyUp", keyCode, modifiers: ["control"] });
}
async function screenshot(name) {
  if (!process.env.NEXUS_ASSET_SCREENSHOTS) return;
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  const folder = path.resolve(process.env.NEXUS_ASSET_SCREENSHOTS);
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, `${name}.png`), (await window.webContents.capturePage()).toPNG());
}
app.whenReady().then(async () => {
  root = await fs.mkdtemp(path.join(app.getPath("temp"), "nexus-asset-smoke-"));
  filePath = path.join(root, "notes.md");
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" fill="#eff6ff"/><rect x="25" y="85" width="35" height="50" rx="4" fill="#2563eb"/><rect x="75" y="60" width="35" height="75" rx="4" fill="#0d9488"/><rect x="125" y="25" width="35" height="110" rx="4" fill="#7c3aed"/><circle cx="202" cy="48" r="22" fill="#f59e0b"/></svg>';
  const image = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  await fs.writeFile(path.join(root, "linked.svg"), svg);
  original = `# Knowledge base assets\n\nInspect image sizes without leaving the document.\n\n![Embedded chart](${image.replace("data:", "data\\:")})\n\n![Linked chart](./linked.svg)\n\n![Missing diagram](./missing.svg)\n`;
  await fs.writeFile(filePath, original);
  const trusted = new Map();
  const rendererIpc = createRendererIpc(ipcMain, trusted);
  choose = path.join(root, "extracted chart.svg");
  registerAssetHandlers({ rendererIpc, BrowserWindow, dialog: {
    showSaveDialog: async () => choose ? { canceled: false, filePath: choose } : { canceled: true },
    showOpenDialog: async () => {
      if (choose === "pending") await new Promise(resolve => { releasePicker = resolve; });
      return choose ? { canceled: false, filePaths: [choose] } : { canceled: true, filePaths: [] };
    }
  } });
  const responses = {
    "app:get-version": "smoke", "app:get-profile-name": "asset-smoke", "file:get-initial-open-file": { filePath, markdown: original },
    "recent:list": [], "quickconnect:get-token": "", "mcp:get-bearer-token": "", "mcp:configure": {}, "window:is-maximized": false,
    "file:watch": {}, "file:unwatch": {}, "diagram:read-svg": null, "ai:release-conversation": {}, "ai:load-chat-history": { ok: true },
    "ai:delete-chat-history": { ok: true }, "ai:save-chat-history": { ok: true }
  };
  for (const [channel, result] of Object.entries(responses)) rendererIpc.handle(channel, () => result);
  rendererIpc.handle("file:save", async (_event, { markdown }) => { await fs.writeFile(filePath, markdown); return { filePath }; });
  rendererIpc.handle("image:resolve-preview", (_event, { documentPath, imageSource }) => {
    const file = localPath(documentPath, imageSource);
    return file ? pathToFileURL(file).href : imageSource;
  });
  rendererIpc.on("mcp:update-window-state", (_event, next) => { state = next; });
  window = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: {
    preload: path.join(__dirname, "..", "electron", "preload.cjs"), sandbox: true, contextIsolation: true, nodeIntegration: false, partition: `asset-smoke-${Date.now()}`
  } });
  const url = pathToFileURL(path.join(__dirname, "..", "dist", "index.html")).href;
  window.webContents.on("console-message", event => { if (event.level === "error") console.error(event.message); });
  trusted.set(window.webContents, url);
  await window.loadURL(url);
  await wait("!!document.querySelector('.mdxeditor-root-contenteditable')");
  await until(() => state?.markdown.includes("Missing diagram"));
  assert.equal(await evaluate("!!document.querySelector('.nexus-asset-panel')"), false);
  await click("Assets");
  await wait("document.querySelectorAll('.nexus-asset-row').length === 3");
  await wait("document.querySelector('.nexus-asset-row img')?.naturalWidth === 240");
  await wait("document.querySelectorAll('.nexus-asset-row')[2].textContent.includes('missing')");
  const layout = await evaluate(`(() => {
    const panel = document.querySelector('.nexus-asset-panel').getBoundingClientRect();
    return { width: panel.width, right: panel.right, height: panel.height, viewport: innerWidth };
  })()`);
  assert(layout.width >= 250 && layout.right <= layout.viewport && layout.height >= 400, JSON.stringify(layout));
  assert.equal(state.dirty, false);
  await screenshot("asset-panel-rich");
  await source();
  const baseline = state.markdown;
  choose = null;
  await click("Extract to file…", 0);
  await wait("!document.querySelector('.nexus-asset-row button').disabled");
  assert.equal(state.markdown, baseline);
  choose = path.join(root, "extracted chart.svg");
  await click("Extract to file…", 0);
  await until(() => state?.markdown.includes("./extracted%20chart.svg"));
  assert.equal(await fs.readFile(choose, "utf8"), svg);
  assert(state.dirty);
  assert.equal(await fs.readFile(filePath, "utf8"), original);
  await key("Z");
  await until(() => state?.markdown === baseline);
  await key("Y");
  await until(() => state?.markdown.includes("./extracted%20chart.svg"));
  await wait("document.querySelectorAll('.nexus-asset-row')[0].textContent.includes('Embed image')");
  await click("Embed image", 0);
  await until(() => state?.markdown === baseline);
  await wait("document.querySelectorAll('.nexus-asset-row')[0].textContent.includes('Extract to file')");
  choose = path.join(root, "linked.svg");
  await click("Locate file…", 2);
  await until(() => !state?.markdown.includes("./missing.svg"));
  await wait("document.querySelectorAll('.nexus-asset-row').length === 2");
  await wait("!document.querySelector('.nexus-asset-row button').disabled");
  assert(state.markdown.includes("![Missing diagram](./linked.svg)"));
  await screenshot("asset-panel-source");
  // A late picker must not overwrite edits made in the meantime.
  choose = "pending";
  await click("Replace…", 0);
  await until(() => typeof releasePicker === "function");
  await evaluate("document.querySelector('.mdxeditor-source-editor .cm-content').focus()");
  window.webContents.insertText("New writing ");
  await until(() => state.markdown.includes("New writing"));
  const whilePicking = state.markdown;
  choose = path.join(root, "linked.svg"); releasePicker();
  await wait("document.querySelector('.nexus-asset-panel [role=alert]')?.textContent.includes('changed')");
  assert.equal(state.markdown, whilePicking);
  window.webContents.send("menu:action", "save");
  await until(() => state.dirty === false);
  assert.equal(await fs.readFile(filePath, "utf8"), whilePicking);
  window.webContents.send("menu:action", "comparePreviousVersion");
  await wait("!!document.querySelector('.nexus-change-review')");
  assert.equal(await evaluate("!!document.querySelector('.nexus-asset-panel')"), true);
  await click("Refresh assets");
  await wait("[...document.querySelectorAll('.nexus-asset-row')].every(row => row.querySelector('.nexus-asset-meta').textContent.includes('240 × 160 px'))");
  await screenshot("asset-panel-diff");
  // Explicit asset actions update the active document from diff and rich-text views too.
  await click("Embed image", 1);
  await until(() => !state.markdown.includes("./linked.svg"));
  await evaluate(`document.querySelector('[aria-label="Switch to Rich text"]').click()`);
  await wait("!!document.querySelector('.mdxeditor-root-contenteditable') && !document.querySelector('.nexus-change-review')");
  const replacement = path.join(root, "replacement.svg");
  await fs.writeFile(replacement, svg.replace('width="240"', 'width="320"'));
  choose = replacement;
  await click("Replace…", 0);
  await wait("document.querySelector('.nexus-asset-row img')?.naturalWidth === 320");
  assert(state.dirty);
  await screenshot("asset-panel-rich-replaced");
  choose = path.join(root, "rich extracted.svg");
  await click("Extract to file…", 0);
  await until(() => state.markdown.includes("./rich%20extracted.svg"));
  await wait("[...document.querySelectorAll('.mdxeditor-root-contenteditable img')].some(img => img.src.endsWith('/rich%20extracted.svg') && img.naturalWidth === 320)");
  console.log("Asset panel smoke passed: cached previews/dimensions, cancellation, extraction, portable paths, source undo/redo, embedding, missing-file repair, stale picker protection, save, and actions in rich/source/diff views.");
}).catch(error => { console.error(error); exitCode = 1; }).finally(async () => {
  clearTimeout(deadline);
  if (window && !window.isDestroyed()) window.destroy();
  if (root) {
    assert.equal(path.dirname(root), path.resolve(app.getPath("temp")));
    assert.match(path.basename(root), /^nexus-asset-smoke-/);
    await fs.rm(root, { recursive: true, force: true });
  }
  app.exit(exitCode);
});
