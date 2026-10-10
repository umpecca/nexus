// Actual renderer/preload in a hidden window with synthetic IPC and in-memory settings only.
const { app, BrowserWindow, ipcMain } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

let window;
let state;
let decision;
let exitCode = 0;
// Use the serializer's escaped colon so rich-text import does not normalize the fixture.
const thumbnailSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" fill="#eff6ff"/><rect x="25" y="85" width="35" height="50" rx="4" fill="#2563eb"/><rect x="75" y="60" width="35" height="75" rx="4" fill="#0d9488"/><rect x="125" y="25" width="35" height="110" rx="4" fill="#7c3aed"/><circle cx="202" cy="48" r="22" fill="#f59e0b"/></svg>';
const image = `![Image](data\\:image/svg+xml;base64,${Buffer.from(thumbnailSvg).toString("base64")})`;
const original = ["# Review demo", "", "Opening paragraph.", "", image, "",
  ...Array.from({ length: 90 }, (_, i) => `Unchanged paragraph ${i}.`), "", "Ending paragraph."].join("\n");
const changed = original.replace("Opening paragraph.", "Improved opening paragraph.")
  .replace("Ending paragraph.", "Improved ending paragraph.");
const filePath = path.join(app.getPath("temp"), "nexus-review-smoke.md");
const deadline = setTimeout(() => { console.error("Change review smoke timed out."); app.exit(1); }, 30000);
app.on("window-all-closed", () => {});

async function evaluate(code) {
  try { return await window.webContents.executeJavaScript(code); }
  catch (error) { throw new Error(`Renderer evaluation failed: ${code}`, { cause: error }); }
}
async function waitFor(code) {
  const end = Date.now() + 5000;
  while (!await evaluate(code)) {
    if (Date.now() > end) throw new Error(`Timed out: ${code}`);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}
async function click(label, scope = "document") {
  await evaluate(`(() => {
    const button = [...${scope}.querySelectorAll('button')].find(button => button.textContent === ${JSON.stringify(label)});
    if (!button) throw new Error('Button unavailable: ' + ${JSON.stringify(label)});
    button.click();
  })()`);
}
async function screenshot(name) {
  if (!process.env.NEXUS_REVIEW_SCREENSHOTS) return;
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  const folder = path.resolve(process.env.NEXUS_REVIEW_SCREENSHOTS);
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, `${name}.png`), (await window.webContents.capturePage()).toPNG());
}
async function checkViewer(scope, name) {
  await waitFor(`${scope}.querySelector('.nexus-change-review') !== null`);
  await click("Next change", scope);
  await waitFor(`${scope}.querySelector('[role=status]').textContent.startsWith('Change 1 of')`);
  await click("Next change", scope);
  await waitFor(`${scope}.querySelector('[role=status]').textContent.startsWith('Change 2 of')`);
  // Real Chromium scrolling and bounded layout, which jsdom cannot verify.
  try {
    await waitFor(`${scope}.querySelector('.cm-mergeView').scrollTop > 0`);
  } catch (error) {
    await screenshot("scroll-failure");
    console.log(await evaluate(`[...${scope}.querySelectorAll('.cm-scroller')].map(node => ({
      height: node.clientHeight, scrollHeight: node.scrollHeight, top: node.scrollTop,
      parent: node.parentElement.className, css: getComputedStyle(node).overflow
    }))`));
    console.log(await evaluate(`(() => {
      let node = ${scope}.querySelector('.cm-scroller'); const result = [];
      while (node && node !== document.body) {
        result.push({ class: node.className, height: node.clientHeight, scrollHeight: node.scrollHeight,
          top: node.scrollTop, overflow: getComputedStyle(node).overflow, cssHeight: getComputedStyle(node).height });
        node = node.parentElement;
      } return result;
    })()`));
    throw error;
  }
  const layout = await evaluate(`(() => {
    const review = ${scope}.querySelector('.nexus-change-review').getBoundingClientRect();
    const viewport = ${scope}.querySelector('.cm-mergeView').getBoundingClientRect();
    return { height: review.height, width: review.width, viewportHeight: viewport.height };
  })()`);
  assert(layout.height > 150 && layout.width > 400, JSON.stringify(layout));
  assert(layout.viewportHeight > 100 && layout.viewportHeight < layout.height, JSON.stringify(layout));
  await evaluate(`${scope}.querySelector('input[type=checkbox]').click()`);
  await waitFor(`${scope}.querySelector('.cm-collapsedLines') !== null`);
  await click("Previous change", scope);
  await waitFor(`${scope}.querySelector('[role=status]').textContent.startsWith('Change 1 of')`);
  await waitFor(`${scope}.querySelectorAll('.nexus-image-data-toggle').length === 2`);
  await evaluate(`${scope}.querySelector('.nexus-image-data-toggle').click()`);
  assert.equal(await evaluate(`${scope}.querySelectorAll('.nexus-image-data-toggle[aria-expanded=true]').length`), 1);
  await evaluate(`${scope}.querySelector('.nexus-image-data-toggle').click()`);
  await click("Expand all", scope);
  assert.equal(await evaluate(`${scope}.querySelectorAll('.nexus-image-data-toggle[aria-expanded=true]').length`), 2);
  await click("Collapse all", scope);
  assert.equal(await evaluate(`${scope}.querySelectorAll('.nexus-image-data-toggle[aria-expanded=false]').length`), 2);
  await checkPreview(scope, name);
}

async function checkPreview(scope, name) {
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  const coordinates = await evaluate(`(() => {
    const rect = ${scope}.querySelector('.nexus-image-preview-button').getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
  })()`);
  window.webContents.sendInputEvent({ type: "mouseMove", ...coordinates });
  try {
    await waitFor(`${scope}.querySelector('.nexus-image-preview:popover-open img')?.naturalWidth === 240`);
  } catch (error) {
    await screenshot(`${name}-preview-failure`);
    console.log(coordinates, await evaluate(`(() => {
      const preview = ${scope}.querySelector('.nexus-image-preview');
      const image = preview?.querySelector('img');
      return { preview: preview?.outerHTML, width: image?.naturalWidth,
        hit: document.elementFromPoint(${coordinates.x}, ${coordinates.y})?.outerHTML };
    })()`));
    throw error;
  }
  assert.equal(await evaluate(`${scope}.querySelector('.nexus-image-data-toggle').getAttribute('aria-expanded')`), "false");
  await evaluate(`${scope}.querySelector('.nexus-image-preview-button').click()`);
  const position = await evaluate(`(() => {
    const rect = ${scope}.querySelector('.nexus-image-preview').getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
      viewportWidth: innerWidth, viewportHeight: innerHeight };
  })()`);
  assert(position.left >= 0 && position.top >= 0 && position.right <= position.viewportWidth &&
    position.bottom <= position.viewportHeight, JSON.stringify(position));
  await screenshot(`${name}-image-preview`);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`);
  await waitFor(`${scope}.querySelector('.nexus-image-preview') === null`);
}

app.whenReady().then(async () => {
  const responses = {
    "app:get-version": "smoke", "app:get-profile-name": "review-smoke",
    "file:get-initial-open-file": { filePath, markdown: original },
    "recent:list": [], "quickconnect:get-token": "", "mcp:get-bearer-token": "",
    "mcp:configure": {}, "window:is-maximized": false, "file:watch": {}, "file:unwatch": {},
    "ai:release-conversation": {}, "ai:load-chat-history": { ok: true },
    "ai:delete-chat-history": { ok: true }, "ai:save-chat-history": { ok: true }
  };
  for (const [channel, result] of Object.entries(responses)) ipcMain.handle(channel, () => result);
  ipcMain.handle("file:save", () => ({ filePath }));
  ipcMain.handle("image:resolve-preview", (_event, payload) => payload.imageSource);
  ipcMain.handle("ai:chat", () => ({ ok: true, text: changed }));
  ipcMain.on("mcp:update-window-state", (_event, next) => { state = next; });
  ipcMain.on("mcp:write-decision", (_event, next) => { decision = next; });
  window = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: {
    preload: path.join(__dirname, "..", "electron", "preload.cjs"),
    sandbox: true, contextIsolation: true, nodeIntegration: false,
    partition: `review-smoke-${Date.now()}`
  } });
  window.webContents.on("console-message", (event) => {
    if (event.level === "error") console.error(event.message);
  });
  await window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  await waitFor("document.querySelector('.mdxeditor-root-contenteditable') !== null");
  await evaluate(`localStorage.setItem('nexus:settings:v1:review-smoke', JSON.stringify({
    themePreference: 'light', ai: { defaultProviderId: 'openai', providers: { openai: { enabled: true } } }
  }))`);
  await window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  await waitFor("document.querySelector('.mdxeditor-root-contenteditable') !== null");
  // MCP proposal: verify review-only controls and explicit rejection.
  window.webContents.send("mcp:confirm-write", { requestId: "reject-test", clientLabel: "Smoke client", markdown: changed });
  const dialog = "document.querySelector('[role=dialog]')";
  await waitFor(`${dialog} !== null`);
  await checkViewer(dialog, "mcp");
  assert.equal(decision, undefined);
  assert.equal(state.markdown, original);
  await screenshot("mcp-review");
  await click("Reject", dialog);
  await waitFor(`${dialog} === null`);
  assert.equal(decision.decision, "reject");

  // AI uses the same viewer; a synthetic response stays inside the real proposal boundary.
  window.webContents.send("menu:action", "contentOrganization");
  await waitFor(`${dialog} !== null && ${dialog}.textContent.includes('Replace document')`);
  await checkViewer(dialog, "ai");
  await screenshot("ai-review");
  await click("Discard", dialog);
  await waitFor(`${dialog} === null`);
  assert.equal(state.markdown, original);

  // Accept MCP, save synthetically, then compare with the pre-save version in the editor.
  window.webContents.send("mcp:confirm-write", { requestId: "approve-test", clientLabel: "Smoke client", markdown: changed });
  await waitFor(`${dialog} !== null`);
  await click("Approve replacement", dialog);
  await waitFor(`${dialog} === null`);
  window.webContents.send("menu:action", "save");
  await waitFor("document.querySelector('.status-bar-unsaved') === null");
  // The save resolves asynchronously before Compare with Previous Version becomes available.
  while (state?.dirty) await new Promise(resolve => setTimeout(resolve, 25));
  window.webContents.send("menu:action", "comparePreviousVersion");
  await checkViewer("document.querySelector('.mdxeditor-diff-editor')", "editor");
  await screenshot("editor-review");
  const snapshot = state.markdown;
  await evaluate(`document.querySelector('[aria-label="Switch to Source"]').click()`);
  await waitFor("document.querySelector('.mdxeditor-source-editor .cm-content[contenteditable=true]') !== null");
  assert.equal(state.markdown, snapshot);
  await click("Expand all", "document.querySelector('.nexus-source-view')");
  assert.equal(await evaluate("document.querySelectorAll('.nexus-image-data-toggle[aria-expanded=true]').length"), 1);
  await click("Collapse all", "document.querySelector('.nexus-source-view')");
  await checkPreview("document.querySelector('.nexus-source-view')", "source");
  assert.equal(state.markdown, snapshot);
  await screenshot("source-after-review");
  window.webContents.focus();
  await evaluate(`(() => {
    const content = document.querySelector('.mdxeditor-source-editor .cm-content');
    content.focus();
    const range = document.createRange();
    range.selectNodeContents(content); range.collapse(false);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
  })()`);
  window.webContents.sendInputEvent({ type: "keyDown", keyCode: "End", modifiers: ["control"] });
  window.webContents.sendInputEvent({ type: "keyUp", keyCode: "End", modifiers: ["control"] });
  window.webContents.insertText(" smoke source edit");
  const editDeadline = Date.now() + 5000;
  while (!state?.markdown.includes(" smoke source edit")) {
    if (Date.now() > editDeadline) throw new Error("Source keyboard input did not reach the document");
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert(state.dirty);
  console.log("Change review smoke passed: MCP/AI/editor viewer, source, thumbnail hover/click/dismissal, bulk folding, approval, scrolling, layout, and editing.");
}).catch(error => { console.error(error); exitCode = 1; }).finally(() => {
  clearTimeout(deadline);
  if (window && !window.isDestroyed()) window.destroy();
  app.exit(exitCode);
});
