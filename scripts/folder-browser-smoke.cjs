// Real renderer + preload + folder IPC/filesystem, isolated fixture and in-memory browser storage.
// Trash is simulated inside the fixture; no user folders or real Recycle Bin are changed.
const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const { registerFolderBrowser } = require("../electron/folderBrowserIpc.cjs");
const { createRendererIpc } = require("../electron/rendererIpc.cjs");
const { saveDocumentFile } = require("../electron/documentSave.cjs");
const { readDocumentText } = require("../electron/documentFiles.cjs");
const { pathToFileURL } = require("node:url");
let work, window, integration, state;
let exitCode = 0;
let confirmChoice = "cancel";
let trashChoice = 0;
const documents = new Map();
const trusted = new Map();
const writes = [];
const rendererIpc = createRendererIpc(ipcMain, trusted);
app.on("window-all-closed", () => {});
const deadline = setTimeout(() => { console.error("Folder browser smoke timed out."); app.exit(1); }, 45000);
const pause = () => new Promise(resolve => setTimeout(resolve, 25));
async function evaluate(code) { return window.webContents.executeJavaScript(code); }
async function until(test) {
  const end = Date.now() + 5000;
  while (!(await test())) { if (Date.now() > end) throw new Error(`Timed out: ${test}; state=${JSON.stringify(state)}`); await pause(); }
}
const item = relative => `document.querySelector(${JSON.stringify(`[role="treeitem"][data-path="${relative}"]`)})`;
async function row(relative) { await until(() => evaluate(`${item(relative)} !== null`)); await evaluate(`${item(relative)}.click()`); }
async function toolbar(label) { await evaluate(`document.querySelector(${JSON.stringify(`[aria-label="${label}"]`)}).click()`); }
async function field(index, value) {
  await evaluate(`(() => { const input = document.querySelectorAll('#folder-operation input')[${index}];
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
}
async function submit() {
  await evaluate("document.querySelector('#folder-operation').requestSubmit()");
  await until(() => evaluate("document.querySelector('[role=dialog]') === null"));
}
async function context(relative, label) {
  await until(() => evaluate(`${item(relative)} !== null`));
  await evaluate(`(() => { const node = ${item(relative)}; const rect = node.getBoundingClientRect();
    node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: rect.x + 40, clientY: rect.y + 10 })); })()`);
  await until(() => evaluate(`document.querySelector('[role=menu]') !== null`));
  await evaluate(`(() => { const node = [...document.querySelectorAll('[role=menuitem]')].find(node => node.textContent === ${JSON.stringify(label)});
    if (!node) throw new Error('Missing menu action: ' + ${JSON.stringify(label)}); node.click(); })()`);
}
async function edit(text) {
  if (!await evaluate("document.querySelector('.mdxeditor-source-editor .cm-content') !== null")) {
    await evaluate("document.querySelector('[aria-label=\"Switch to Source\"]').click()");
    await until(() => evaluate("document.querySelector('.mdxeditor-source-editor .cm-content') !== null"));
  }
  window.webContents.focus();
  await evaluate("document.querySelector('.mdxeditor-source-editor .cm-content').focus()");
  window.webContents.selectAll();
  await evaluate("new Promise(resolve => requestAnimationFrame(resolve))");
  window.webContents.insertText(text);
  await until(() => state?.markdown.trim() === text);
}
async function screenshot(name) {
  if (!process.env.NEXUS_FOLDER_SCREENSHOTS) return;
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  const folder = path.resolve(process.env.NEXUS_FOLDER_SCREENSHOTS);
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, `${name}.png`), (await window.webContents.capturePage()).toPNG());
}
app.whenReady().then(async () => {
  work = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-folder-smoke-"));
  const canonical = await fs.realpath(work);
  const original = path.join(canonical, "note.md");
  await fs.writeFile(original, "Folder demo\n\nSaved document.\n");
  await fs.mkdir(path.join(work, "nested"));
  await fs.writeFile(path.join(work, "nested", "child.md"), "# Child\n");
  await fs.writeFile(path.join(work, "image.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  const code = '\ufeff// Architecture reference\r\nexport const nodes = ["api", "db"];\r\n\tconst literal = "![x](./demo.drawio.abc.svg)";\r\n';
  const plain = "# This is literal text\n\t**not formatted**  \n";
  await fs.writeFile(path.join(work, "architecture.ts"), code);
  await fs.writeFile(path.join(work, "notes.txt"), plain);
  await fs.writeFile(path.join(work, "binary.bin"), Buffer.from([0, 1, 2, 3]));
  const responses = {
    "app:get-version": "smoke", "app:get-profile-name": "folder-smoke",
    "file:get-initial-open-file": { canceled: false, filePath: original, markdown: await fs.readFile(original, "utf8") },
    "recent:list": [], "quickconnect:get-token": "", "mcp:get-bearer-token": "", "mcp:configure": {},
    "window:is-maximized": false, "file:watch": {}, "file:unwatch": {},
    "ai:release-conversation": {}, "ai:load-chat-history": { ok: true }, "ai:delete-chat-history": { ok: true }, "ai:save-chat-history": { ok: true }
  };
  for (const [channel, value] of Object.entries(responses)) ipcMain.handle(channel, () => value);
  integration = registerFolderBrowser({
    ipc: rendererIpc,
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [work] }), showMessageBox: async () => ({ response: trashChoice }) },
    shell: { trashItem: target => fs.rename(target, path.join(work, "fixture-trash")), showItemInFolder: () => {} },
    BrowserWindow, readDocument: async filePath => ({ canceled: false, filePath, markdown: await readDocumentText(filePath) }),
    documents, watcher: { stop: () => {} }, addRecent: () => {}, removeRecent: () => {}
  });
  ipcMain.handle("dialog:confirmSaveChanges", () => confirmChoice);
  ipcMain.handle("image:resolve-preview", (_event, payload) => payload.imageSource);
  ipcMain.handle("file:choose-save-path", () => ({ filePath: path.join(canonical, "recovered.md") }));
  rendererIpc.handle("file:save", async (event, payload) => {
    const finish = integration.beginSave(event.sender.id, payload.filePath);
    try { await saveDocumentFile(payload.filePath, payload.markdown); } finally { finish(); }
    writes.push(payload);
    return { filePath: payload.filePath };
  });
  ipcMain.on("mcp:register-window", (event, next) => documents.set(event.sender.id, next));
  ipcMain.on("mcp:update-window-state", (event, next) => {
    if (!integration.acceptState(event.sender.id, next.filePath)) return;
    state = next; documents.set(event.sender.id, next);
  });
  window = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: {
    preload: path.join(__dirname, "..", "electron", "preload.cjs"), sandbox: true,
    contextIsolation: true, nodeIntegration: false, partition: `folder-smoke-${Date.now()}`
  } });
  const html = path.join(__dirname, "..", "dist", "index.html");
  trusted.set(window.webContents, pathToFileURL(html).href);
  window.webContents.on("console-message", event => { if (event.level === "error") console.error(event.message); });
  await window.loadFile(html);
  await until(() => state?.filePath === original);
  window.webContents.send("menu:action", "openFolder");
  await until(() => evaluate("document.querySelector('.nexus-files') !== null"));
  await row("nested");
  await until(() => evaluate(`${item("nested/child.md")} !== null`));
  await screenshot("folder-browser");
  // Unsaved-change cancellation on sidebar opens, and successful switching after discard.
  await edit("Keep this unsaved text");
  await row("nested/child.md"); await pause();
  assert.equal(state.filePath, original); assert.equal(state.markdown.trim(), "Keep this unsaved text");
  confirmChoice = "discard";
  await row("nested/child.md"); await until(() => state?.filePath.endsWith("child.md"));
  await row("note.md"); await until(() => state?.filePath === original);
  // Rename and move preserve the dirty buffer, then Save commits at the new path.
  await edit("Text preserved through rename and move");
  await context("note.md", "Rename…");
  await field(0, "renamed.md"); await submit();
  await until(() => state?.filePath === path.join(canonical, "renamed.md"));
  assert(state.dirty); assert.equal(state.markdown.trim(), "Text preserved through rename and move");
  await context("renamed.md", "Move to…");
  await field(1, "nested"); await submit();
  await until(() => state?.filePath === path.join(canonical, "nested", "renamed.md"));
  window.webContents.send("menu:action", "save");
  await until(() => !state?.dirty);
  assert.equal((await fs.readFile(state.filePath, "utf8")).trim(), "Text preserved through rename and move");
  await assert.rejects(fs.stat(original));
  await assert.rejects(fs.stat(path.join(canonical, "renamed.md")));
  await context("nested/renamed.md", "Duplicate…"); await submit();
  await until(() => evaluate(`${item("nested/renamed copy.md")} !== null`));
  assert.equal(await fs.readFile(path.join(canonical, "nested", "renamed copy.md"), "utf8"), await fs.readFile(state.filePath, "utf8"));
  // New files and folders use the selected folder, and new documents open normally.
  await row("nested"); // Collapse and select it.
  await toolbar("New folder"); await field(0, "drafts"); await submit();
  assert((await fs.stat(path.join(work, "nested", "drafts"))).isDirectory());
  await toolbar("New Markdown file"); await field(0, "new.md"); await submit();
  await until(() => state?.filePath === path.join(canonical, "nested", "drafts", "new.md"));
  // Trash cancellation preserves file; confirmation detaches the buffer for Save As recovery.
  await edit("Recover this deleted document");
  const trashLabel = `Move to ${process.platform === "win32" ? "Recycle Bin" : "Trash"}…`;
  await context("nested/drafts/new.md", trashLabel); await pause();
  assert.equal(state.filePath, path.join(canonical, "nested", "drafts", "new.md"));
  trashChoice = 1;
  await context("nested/drafts/new.md", trashLabel);
  await until(() => state?.filePath === null);
  assert(state.dirty); assert.equal(state.markdown.trim(), "Recover this deleted document");
  window.webContents.send("menu:action", "save"); await until(() => state?.filePath === path.join(canonical, "recovered.md") && !state.dirty);
  assert.equal((await fs.readFile(state.filePath, "utf8")).trim(), "Recover this deleted document");
  await screenshot("folder-recovery");
  // The same sidebar stays visible in source mode. Closing it keeps the current document.
  if (!await evaluate("document.querySelector('.mdxeditor-source-editor') !== null")) await evaluate("document.querySelector('[aria-label=\"Switch to Source\"]').click()");
  await until(() => evaluate("document.querySelector('.mdxeditor-source-editor') !== null"));
  assert(await evaluate("document.querySelector('.nexus-files') !== null"));
  await screenshot("folder-source");
  // Reference code uses dedicated CodeMirror and bypasses every Markdown/diagram transform.
  await row("architecture.ts");
  await until(() => state?.filePath === path.join(canonical, "architecture.ts"));
  await until(() => evaluate("document.querySelector('.nexus-code-file .cm-content') !== null"));
  assert.equal(state.markdown, code); assert.equal(state.dirty, false);
  assert(await evaluate("document.querySelector('[aria-label=\"Code language\"]').selectedOptions[0].textContent.includes('TypeScript')"));
  const count = writes.length;
  window.webContents.send("menu:action", "save");
  await until(() => writes.length === count + 1);
  assert.deepEqual(await fs.readFile(path.join(work, "architecture.ts")), Buffer.from(code, "utf8"));
  await screenshot("folder-code");
  window.webContents.send("menu:action", "find");
  await until(() => evaluate("document.querySelector('.nexus-code-file .cm-search') !== null"));
  await evaluate("document.querySelector('.nexus-code-file .cm-content').focus()");
  window.webContents.selectAll(); await evaluate("new Promise(resolve => requestAnimationFrame(resolve))");
  window.webContents.insertText("export const count = 2;");
  await until(() => state?.markdown === "export const count = 2;" && state.dirty);
  confirmChoice = "cancel";
  await row("notes.txt"); await pause();
  assert.equal(state.filePath, path.join(canonical, "architecture.ts"));
  window.webContents.send("menu:action", "save"); await until(() => !state?.dirty);
  assert.equal(await fs.readFile(state.filePath, "utf8"), "export const count = 2;");
  window.webContents.send("menu:action", "comparePreviousVersion");
  await until(() => evaluate("document.querySelector('.nexus-code-file .nexus-change-review') !== null"));
  await evaluate("[...document.querySelectorAll('button')].find(button => button.textContent === 'Back to editor').click()");
  await row("notes.txt"); await until(() => state?.filePath === path.join(canonical, "notes.txt"));
  assert.equal(state.markdown, plain); assert.equal(state.dirty, false);
  assert(await evaluate("document.querySelector('.nexus-code-file') !== null"));
  assert(await evaluate("document.querySelector('h1') === null"));
  await evaluate("document.querySelector('.nexus-files-filter input').click()");
  await row("binary.bin");
  await until(() => evaluate("document.querySelector('.nexus-files [role=alert]')?.textContent.includes('binary')"));
  assert.equal(state.markdown, plain); assert.equal(state.filePath, path.join(canonical, "notes.txt"));
  // Return to Markdown with its original editor mode and a clean normalized baseline.
  await row("nested/child.md");
  await until(() => state?.filePath === path.join(canonical, "nested", "child.md") && !state.dirty);
  await until(() => evaluate("document.querySelector('.mdxeditor-source-editor') !== null && document.querySelector('.nexus-code-file') === null"));
  await toolbar("Close folder");
  await until(() => evaluate("document.querySelector('.nexus-files') === null"));
  assert.equal(state.filePath, path.join(canonical, "nested", "child.md"));
  console.log("Folder/code smoke passed: tree, protected open, dirty-buffer moves, save, duplicate/create, trash recovery, raw code/BOM/CRLF save, text editing, code review/search, plain text, binary rejection, Markdown round trip, and close.");
}).catch(error => { console.error(error); exitCode = 1; }).finally(async () => {
  clearTimeout(deadline);
  if (window && !window.isDestroyed()) { integration?.close(window.webContents.id); window.destroy(); }
  if (work) {
    assert.equal(path.dirname(work), path.resolve(os.tmpdir()));
    assert(path.basename(work).startsWith("nexus-folder-smoke-"));
    await fs.rm(work, { recursive: true, force: true });
  }
  app.exit(exitCode);
});
