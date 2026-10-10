const path = require("node:path");
const fs = require("node:fs/promises");
const { createFolderBrowser, containsPath } = require("./folderBrowser.cjs");

function registerFolderBrowser({ ipc, dialog, shell, BrowserWindow, readDocument, documents, watcher, addRecent, removeRecent }) {
  const relocations = new Map();
  let affected = [];
  const windowFor = owner => BrowserWindow.getAllWindows().find(window => window.webContents.id === owner);
  const browser = createFolderBrowser({
    trash: target => shell.trashItem(target),
    onChange: (owner, event) => windowFor(owner)?.webContents.send("folder:changed", event),
    beforeMutation: async ({ action, source }) => {
      affected = [];
      if (!["move", "rename", "trash"].includes(action)) return;
      affected = (await Promise.all(Array.from(documents, async ([owner, record]) => {
        if (!record.filePath) return null;
        const oldPath = record.filePath;
        const canonical = await fs.realpath(oldPath).catch(() => oldPath);
        return containsPath(source, canonical) ? { owner, record, oldPath, canonical } : null;
      }))).filter(Boolean);
    },
    onMutation: ({ action, source, destination }) => {
      if (!["move", "rename", "trash"].includes(action)) return;
      for (const [owner, record] of documents) {
        const prior = affected.find(item => item.owner === owner && item.oldPath === record.filePath);
        const canonical = prior?.canonical ?? record.filePath;
        if (!canonical || !containsPath(source, canonical)) continue;
        const oldPath = record.filePath;
        const nextPath = destination ? path.join(destination, path.relative(source, canonical)) : null;
        watcher.stop(owner);
        record.filePath = nextPath;
        record.title = nextPath ? path.basename(nextPath) : "Untitled";
        if (!nextPath) record.dirty = true;
        relocations.set(owner, { oldPath, nextPath });
        removeRecent(oldPath);
        if (nextPath) addRecent(nextPath);
        windowFor(owner)?.webContents.send("file:relocated", { oldPath, nextPath });
      }
    }
  });
  ipc.handle("folder:open", async event => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const options = { title: "Open Folder", properties: ["openDirectory"] };
    const choice = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    if (choice.canceled || !choice.filePaths.length) return null;
    return browser.open(event.sender.id, choice.filePaths[0]);
  });
  ipc.handle("folder:close", event => browser.close(event.sender.id));
  ipc.handle("folder:list", (event, payload) => browser.list(event.sender.id, payload));
  ipc.handle("folder:read", async (event, payload) => readDocument(await browser.documentPath(event.sender.id, payload)));
  ipc.handle("folder:mutate", (event, payload) => browser.mutate(event.sender.id, payload, async target => {
    const options = {
      type: "warning", title: "Move to Trash", message: `Move “${path.basename(target)}” to ${process.platform === "win32" ? "the Recycle Bin" : "Trash"}?`,
      detail: "This includes any files inside the folder. Open documents will keep their text as unsaved documents.",
      buttons: ["Cancel", "Move to Trash"], defaultId: 0, cancelId: 0, noLink: true
    };
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = window ? await dialog.showMessageBox(window, options) : await dialog.showMessageBox(options);
    return result.response === 1;
  }));
  ipc.handle("folder:reveal", async (event, payload) => { shell.showItemInFolder(await browser.getPath(event.sender.id, payload)); });
  return {
    close(owner) { browser.close(owner); relocations.delete(owner); },
    beginSave(owner, filePath) {
      const pending = relocations.get(owner);
      if (pending && containsPath(pending.oldPath, filePath)) throw new Error("This document has moved. Wait for its new path before saving.");
      return browser.beginSave();
    },
    acceptState(owner, filePath) {
      const pending = relocations.get(owner);
      if (!pending) return true;
      if (filePath === pending.oldPath) return false;
      relocations.delete(owner);
      return true;
    }
  };
}
module.exports = { registerFolderBrowser };
