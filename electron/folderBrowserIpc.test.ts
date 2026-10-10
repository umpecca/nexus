import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerFolderBrowser } from "./folderBrowserIpc.cjs";

describe("folder IPC and open documents", () => {
  let directory: string;
  let root: { id: string; path: string };
  let integration: ReturnType<typeof registerFolderBrowser>;
  let records: Map<number, { filePath: string | null; title: string; markdown: string; dirty: boolean }>;
  let handlers: Map<string, (...args: unknown[]) => Promise<unknown>>;
  let windows: { webContents: { id: number; send: ReturnType<typeof vi.fn> } }[];
  let dialog: { showOpenDialog: ReturnType<typeof vi.fn>; showMessageBox: ReturnType<typeof vi.fn> };
  let stop: ReturnType<typeof vi.fn>;
  let read: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-folder-ipc-"));
    await fs.mkdir(path.join(directory, "docs"));
    await fs.writeFile(path.join(directory, "docs", "note.md"), "saved text");
    await fs.writeFile(path.join(directory, "other.md"), "other");
    records = new Map([
      [1, { filePath: path.join(directory, "docs", "note.md"), title: "note.md", markdown: "unsaved edits", dirty: true }],
      [2, { filePath: path.join(directory, "docs", "note.md"), title: "note.md", markdown: "saved text", dirty: false }],
      [3, { filePath: path.join(directory, "other.md"), title: "other.md", markdown: "other", dirty: false }]
    ]);
    windows = [1, 2, 3].map(id => ({ webContents: { id, send: vi.fn() } }));
    handlers = new Map();
    dialog = { showOpenDialog: vi.fn(async () => ({ filePaths: [directory], canceled: false })), showMessageBox: vi.fn(async () => ({ response: 1 })) };
    stop = vi.fn();
    read = vi.fn(async filePath => ({ filePath, markdown: await fs.readFile(filePath, "utf8"), canceled: false }));
    integration = registerFolderBrowser({
      ipc: { handle: (channel, handler) => handlers.set(channel, handler) }, dialog,
      shell: { trashItem: async target => fs.rename(target, path.join(directory, "fixture-trash")), showItemInFolder: vi.fn() },
      BrowserWindow: { getAllWindows: () => windows, fromWebContents: sender => windows.find(window => window.webContents.id === sender.id) },
      readDocument: read, documents: records, watcher: { stop }, addRecent: vi.fn(), removeRecent: vi.fn()
    });
    root = await call("folder:open") as typeof root;
  });
  afterEach(async () => {
    for (const id of [1, 2, 3]) integration.close(id);
    expect(path.dirname(directory)).toBe(path.resolve(os.tmpdir()));
    expect(path.basename(directory)).toMatch(/^nexus-folder-ipc-/);
    await fs.rm(directory, { recursive: true, force: true });
  });
  function call(channel: string, payload?: unknown, owner = 1) {
    return handlers.get(channel)!({ sender: { id: owner } }, payload);
  }
  it("opens through the granted root and rejects reads in another window", async () => {
    expect(await call("folder:read", { rootId: root.id, path: "docs/note.md" })).toMatchObject({ markdown: "saved text" });
    await expect(call("folder:read", { rootId: root.id, path: "docs/note.md" }, 2)).rejects.toThrow("no longer open");
    await expect(call("folder:read", { rootId: root.id, path: "../outside.md" })).rejects.toThrow();
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("remaps every affected window on directory moves, preserving dirty text and blocking stale saves until acknowledged", async () => {
    await call("folder:mutate", { rootId: root.id, path: "docs", action: "rename", name: "renamed" });
    for (const id of [1, 2]) {
      expect(records.get(id)?.filePath).toBe(path.join(root.path, "renamed", "note.md"));
      expect(stop).toHaveBeenCalledWith(id);
      expect(windows[id - 1].webContents.send).toHaveBeenCalledWith("file:relocated", { oldPath: path.join(directory, "docs", "note.md"), nextPath: path.join(root.path, "renamed", "note.md") });
    }
    expect(records.get(1)?.markdown).toBe("unsaved edits");
    expect(records.get(1)?.dirty).toBe(true);
    expect(stop).not.toHaveBeenCalledWith(3);
    const old = path.join(directory, "docs", "note.md");
    expect(() => integration.beginSave(1, old)).toThrow("document has moved");
    expect(integration.acceptState(1, old)).toBe(false);
    expect(integration.acceptState(1, records.get(1)?.filePath)).toBe(true);
    integration.beginSave(1, path.join(directory, "renamed", "note.md"))();
  });
  it("remaps documents opened through an alias to the moved canonical path", async () => {
    await fs.symlink(path.join(directory, "docs"), path.join(directory, "alias"), process.platform === "win32" ? "junction" : "dir");
    records.get(2)!.filePath = path.join(directory, "alias", "note.md");
    await call("folder:mutate", { rootId: root.id, path: "docs", action: "rename", name: "renamed" });
    expect(records.get(2)?.filePath).toBe(path.join(root.path, "renamed", "note.md"));
    expect(records.get(2)?.markdown).toBe("saved text");
  });
  it("canceled trash does not affect buffers; confirmed trash detaches open documents with recoverable text", async () => {
    dialog.showMessageBox.mockResolvedValueOnce({ response: 0 });
    const target = { rootId: root.id, path: "docs/note.md", action: "trash" };
    expect(await call("folder:mutate", target)).toEqual({ canceled: true });
    expect(records.get(1)?.filePath).toBe(path.join(directory, "docs", "note.md"));
    await call("folder:mutate", target);
    expect(records.get(1)).toMatchObject({ filePath: null, dirty: true, markdown: "unsaved edits" });
    expect(records.get(2)).toMatchObject({ filePath: null, dirty: true, markdown: "saved text" });
    expect(await fs.readFile(path.join(directory, "fixture-trash"), "utf8")).toBe("saved text");
  });
  it("blocks file operations during writes and closes sessions without affecting other windows", async () => {
    const finish = integration.beginSave(2, path.join(directory, "docs", "note.md"));
    await expect(call("folder:mutate", { rootId: root.id, path: "docs", action: "rename", name: "renamed" })).rejects.toThrow("save to finish");
    finish();
    await call("folder:close");
    await expect(call("folder:list", { rootId: root.id, path: "" })).rejects.toThrow("no longer open");
    expect(records.get(2)?.filePath).toBe(path.join(directory, "docs", "note.md"));
  });
});
