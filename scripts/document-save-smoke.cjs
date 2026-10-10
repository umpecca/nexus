// Real editor/preload integration; hidden window, in-memory storage, synthetic IPC writes only.
const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");

let work;
let window;
let exitCode = 0;
let editorState;
let closeDecision;
let confirmChoice = "save";
const writes = [];
app.on("window-all-closed", () => {});
const deadline = setTimeout(() => { console.error("Document save smoke test timed out."); app.exit(1); }, 30000);

async function until(condition) {
  const timeout = Date.now() + 5000;
  while (!condition()) {
    if (Date.now() > timeout) throw new Error(`Timed out waiting for editor state: ${JSON.stringify(editorState)}`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

async function edit(text) {
  window.webContents.focus();
  await window.webContents.executeJavaScript(`(() => {
    const editor = document.querySelector('.mdxeditor [contenteditable="true"]');
    if (!editor) throw new Error("Editor is unavailable");
    editor.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection.removeAllRanges();
    selection.addRange(range);
  })()`);
  window.webContents.insertText(text);
  await until(() => editorState?.markdown.trim() === text);
}

function menu(action) { window.webContents.send("menu:action", action); }
function recordWrite(kind, payload) {
  return new Promise((resolve, reject) => { writes.push({ kind, payload, resolve, reject }); });
}

app.whenReady().then(async () => {
  work = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-document-save-"));
  const originalPath = path.join(work, "original.md");
  const newPath = path.join(work, "renamed.md");
  const responses = {
    "app:get-version": "smoke", "app:get-profile-name": "smoke",
    "file:get-initial-open-file": { canceled: false, filePath: originalPath, markdown: "baseline" },
    "recent:list": [], "quickconnect:get-token": "", "mcp:get-bearer-token": "",
    "mcp:configure": {}, "window:is-maximized": false, "file:watch": {}, "file:unwatch": {},
    "ai:release-conversation": {}, "ai:load-chat-history": { ok: true },
    "ai:delete-chat-history": { ok: true }, "ai:save-chat-history": { ok: true }
  };
  for (const [channel, response] of Object.entries(responses)) ipcMain.handle(channel, () => response);
  ipcMain.handle("file:save", (_event, payload) => recordWrite("save", payload));
  ipcMain.handle("file:choose-save-path", () => ({ filePath: newPath }));
  ipcMain.handle("dialog:confirmSaveChanges", () => confirmChoice);
  ipcMain.handle("app:resolve-close-request", (_event, decision) => { closeDecision = decision; });
  ipcMain.on("mcp:update-window-state", (_event, state) => { editorState = state; });
  window = new BrowserWindow({ show: false, webPreferences: {
    preload: path.join(__dirname, "..", "electron", "preload.cjs"),
    sandbox: true, contextIsolation: true, nodeIntegration: false,
    partition: path.basename(work)
  } });
  await window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  await until(() => editorState?.markdown.trim() === "baseline" && !editorState.dirty);

  await edit("first edit");
  menu("save");
  await until(() => writes.length === 1);
  assert.equal(writes[0].payload.markdown.trim(), "first edit");
  await edit("newer edit");
  writes[0].resolve({ filePath: originalPath });
  // Wait until the save completion renders; this flushes IPC and subsequent React work.
  await window.webContents.executeJavaScript('new Promise(resolve => setTimeout(resolve, 100))');
  assert.equal(editorState.markdown.trim(), "newer edit");
  assert.equal(editorState.dirty, true);
  assert.equal(await window.webContents.executeJavaScript('document.querySelector(".mdxeditor [contenteditable=true]").textContent.trim()'), "newer edit");
  menu("save");
  await until(() => writes.length === 2);
  assert.equal(writes[1].payload.markdown.trim(), "newer edit");
  writes[1].resolve({ filePath: originalPath });
  await until(() => !editorState.dirty);

  // Save As followed by Save must use its new path and the latest buffer.
  await edit("before rename");
  menu("saveAs");
  await until(() => writes.length === 3);
  await edit("during rename");
  menu("save");
  writes[2].resolve({ filePath: newPath });
  await until(() => writes.length === 4);
  assert.equal(writes[3].payload.filePath, newPath);
  assert.equal(writes[3].payload.markdown.trim(), "during rename");
  writes[3].resolve({ filePath: newPath });
  await until(() => !editorState.dirty && editorState.filePath === newPath);

  // Saving for close cannot discard text entered during the write.
  await edit("close snapshot");
  window.webContents.send("app:request-close");
  await until(() => writes.length === 5);
  await edit("keep this open");
  writes[4].resolve({ filePath: newPath });
  await until(() => closeDecision !== undefined);
  assert.equal(closeDecision, false);
  assert.equal(editorState.markdown.trim(), "keep this open");
  assert.equal(editorState.dirty, true);

  // A failed write keeps text dirty and displays a visible error, then allows retry.
  menu("save");
  await until(() => writes.length === 6);
  writes[5].reject(new Error("Synthetic disk failure"));
  const errorShown = await window.webContents.executeJavaScript(`new Promise(resolve => {
    const check = () => {
      const dialog = document.querySelector('[role="dialog"]');
      if (dialog?.textContent.includes("Synthetic disk failure")) {
        [...dialog.querySelectorAll("button")].find(button => button.textContent === "OK").click();
        resolve(true);
      } else setTimeout(check, 20);
    }; check();
  })`);
  assert.equal(errorShown, true);
  assert.equal(editorState.dirty, true);
  assert.equal(editorState.markdown.trim(), "keep this open");
  menu("save");
  await until(() => writes.length === 7);
  writes[6].resolve({ filePath: newPath });
  await until(() => !editorState.dirty);

  // Late completion after New cannot overwrite the new untitled document's metadata.
  await edit("old document");
  menu("save");
  await until(() => writes.length === 8);
  confirmChoice = "discard";
  menu("new");
  await until(() => editorState.filePath === null && editorState.markdown === "");
  writes[7].resolve({ filePath: newPath });
  await window.webContents.executeJavaScript('new Promise(resolve => setTimeout(resolve, 100))');
  assert.equal(editorState.filePath, null);
  assert.equal(editorState.markdown, "");
  assert.equal(editorState.dirty, false);
  console.log("Document save smoke passed: live edits, dirty state, queued Save As, close guard, failure/retry, and stale completion.");
}).catch(error => { console.error(error); exitCode = 1; }).finally(async () => {
  clearTimeout(deadline);
  if (window && !window.isDestroyed()) window.destroy();
  if (work && path.dirname(path.resolve(work)) === path.resolve(os.tmpdir()) &&
      path.basename(work).startsWith("nexus-document-save-")) {
    await fs.rm(work, { recursive: true, force: true });
  }
  app.exit(exitCode);
});
