import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFolderBrowser, containsPath, validateName } from "./folderBrowser.cjs";

describe("folder browser filesystem", () => {
  let fixture: string;
  let root: { id: string; path: string };
  let browser: ReturnType<typeof createFolderBrowser>;
  const change = vi.fn();
  const mutation = vi.fn();
  const trash = vi.fn();
  beforeEach(async () => {
    fixture = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-folder-test-"));
    const folder = path.join(fixture, "docs");
    await fs.mkdir(folder);
    await fs.mkdir(path.join(folder, "nested"));
    await fs.writeFile(path.join(folder, "note.md"), "# Original\n");
    await fs.writeFile(path.join(folder, "nested", "child.mdx"), "# Child\n");
    await fs.writeFile(path.join(folder, "image.png"), "asset bytes");
    change.mockReset(); mutation.mockReset(); trash.mockReset();
    // Simulate trash by moving into a fixture-only location, never use the user's real Trash in tests.
    trash.mockImplementation(async target => fs.rename(target, path.join(fixture, "trashed")));
    browser = createFolderBrowser({ trash, onChange: change, onMutation: mutation });
    root = await browser.open(1, folder);
  });
  afterEach(async () => {
    browser.close(1); browser.close(2);
    expect(path.dirname(fixture)).toBe(path.resolve(os.tmpdir()));
    expect(path.basename(fixture)).toMatch(/^nexus-folder-test-/);
    await fs.rm(fixture, { recursive: true, force: true });
  });
  const payload = (action: string, relative: string, extras = {}) => ({ rootId: root.id, path: relative, action, ...extras });

  it("lists only immediate entries, sorts folders first, and recognizes Markdown/text", async () => {
    expect(await browser.list(1, { rootId: root.id, path: "" })).toEqual([
      { name: "nested", path: "nested", kind: "folder", openable: false },
      { name: "image.png", path: "image.png", kind: "file", openable: false },
      { name: "note.md", path: "note.md", kind: "file", openable: true }
    ]);
    expect(await browser.documentPath(1, { rootId: root.id, path: "nested/child.mdx" })).toBe(path.join(root.path, "nested", "child.mdx"));
    expect(await browser.documentPath(1, { rootId: root.id, path: "image.png" })).toBe(path.join(root.path, "image.png"));
    await expect(browser.documentPath(1, { rootId: root.id, path: "nested" })).rejects.toThrow();
  });
  it("rejects ungranted roots, traversal, absolute paths, Windows drive-relative paths, and root mutations", async () => {
    for (const relative of ["../outside", "nested/../../outside", "nested\\..\\note.md", path.resolve(fixture), "C:note.md"]) {
      await expect(browser.getPath(1, { rootId: root.id, path: relative })).rejects.toThrow();
    }
    await expect(browser.list(2, { rootId: root.id, path: "" })).rejects.toThrow("no longer open");
    await expect(browser.mutate(1, payload("trash", ""))).rejects.toThrow("itself cannot");
    expect(containsPath(root.path, `${root.path}-outside`)).toBe(false);
    expect(containsPath(root.path, path.join(root.path, "nested"))).toBe(true);
  });
  it.each(["../name", "a/b", "a\\b", "CON.md", "nul", "a:", "a.", " trailing", "", "a\0b"])("rejects invalid new names: %s", name => {
    expect(() => validateName(name)).toThrow();
  });
  it("creates documents/folders and leaves collisions intact", async () => {
    await browser.mutate(1, payload("newFolder", "", { name: "new" }));
    await browser.mutate(1, payload("newFile", "new", { name: "fresh.md" }));
    expect(await fs.readFile(path.join(root.path, "new", "fresh.md"), "utf8")).toBe("");
    await expect(browser.mutate(1, payload("newFile", "", { name: "note.md" }))).rejects.toThrow("already exists");
    expect(await fs.readFile(path.join(root.path, "note.md"), "utf8")).toBe("# Original\n");
    await expect(browser.mutate(1, payload("newFile", "", { name: "program.exe" }))).rejects.toThrow("New documents");
  });
  it("copies recursively including assets without changing originals", async () => {
    await fs.writeFile(path.join(root.path, "nested", "asset.svg"), "<svg/>");
    await browser.mutate(1, payload("copy", "nested", { destination: "", name: "duplicate" }));
    expect(await fs.readFile(path.join(root.path, "duplicate", "child.mdx"), "utf8")).toBe("# Child\n");
    expect(await fs.readFile(path.join(root.path, "duplicate", "asset.svg"), "utf8")).toBe("<svg/>");
    await expect(browser.mutate(1, payload("copy", "note.md", { destination: "", name: "note.md" }))).rejects.toThrow("already exists");
    await expect(browser.mutate(1, payload("copy", "nested", { destination: "nested", name: "child" }))).rejects.toThrow("into itself");
    expect((await fs.readdir(root.path)).some(name => name.startsWith(".nexus-copy-"))).toBe(false);
  });
  it("moves and renames items and broadcasts their absolute paths", async () => {
    await browser.mutate(1, payload("rename", "note.md", { name: "renamed.md" }));
    await browser.mutate(1, payload("move", "renamed.md", { name: "renamed.md", destination: "nested" }));
    expect(await fs.readFile(path.join(root.path, "nested", "renamed.md"), "utf8")).toBe("# Original\n");
    expect(mutation).toHaveBeenLastCalledWith({ action: "move", source: path.join(root.path, "renamed.md"), destination: path.join(root.path, "nested", "renamed.md") });
    await expect(browser.mutate(1, payload("move", "nested", { name: "recursive", destination: "nested" }))).rejects.toThrow("into itself");
  });
  it("trash requires confirmation and leaves the source alone when canceled or trash fails", async () => {
    const confirm = vi.fn(async () => false);
    expect(await browser.mutate(1, payload("trash", "note.md"), confirm)).toEqual({ canceled: true });
    expect(trash).not.toHaveBeenCalled();
    trash.mockRejectedValueOnce(new Error("Trash unavailable"));
    await expect(browser.mutate(1, payload("trash", "note.md"))).rejects.toThrow("Trash unavailable");
    expect(await fs.readFile(path.join(root.path, "note.md"), "utf8")).toBe("# Original\n");
    await browser.mutate(1, payload("trash", "note.md"));
    expect(await fs.readFile(path.join(fixture, "trashed"), "utf8")).toBe("# Original\n");
  });
  it("blocks moves during saves and saves during a pending confirmed operation", async () => {
    const finish = browser.beginSave();
    await expect(browser.mutate(1, payload("rename", "note.md", { name: "new.md" }))).rejects.toThrow("save to finish");
    finish();
    let confirm!: (choice: boolean) => void;
    const pending = browser.mutate(1, payload("trash", "note.md"), () => new Promise(resolve => { confirm = resolve; }));
    await vi.waitFor(() => expect(confirm).toBeTypeOf("function"));
    expect(() => browser.beginSave()).toThrow("folder operation");
    confirm(false); await pending;
    browser.beginSave()();
  });
  it("uses directory watches to detect external entry changes and closes grants", async () => {
    await browser.list(1, { rootId: root.id, path: "" });
    await fs.writeFile(path.join(root.path, "external.md"), "external");
    await vi.waitFor(() => expect(change).toHaveBeenCalledWith(1, { rootId: root.id, path: "" }));
    browser.close(1);
    await expect(browser.list(1, { rootId: root.id, path: "" })).rejects.toThrow("no longer open");
  });
  it("invalidates old sessions and remaps another window's nested root on move", async () => {
    const nested = await browser.open(2, path.join(root.path, "nested"));
    await browser.mutate(1, payload("rename", "nested", { name: "moved" }));
    expect(change).toHaveBeenCalledWith(2, expect.objectContaining({ rootId: nested.id, path: null, root: { ...nested, path: path.join(root.path, "moved"), name: "moved" },
      relocation: { source: path.join(root.path, "nested"), destination: path.join(root.path, "moved") } }));
    expect((await browser.list(2, { rootId: nested.id, path: "" }))[0].name).toBe("child.mdx");
    await browser.open(1, root.path);
    await expect(browser.list(1, { rootId: root.id, path: "" })).rejects.toThrow("no longer open");
  });
  it("rejects junction traversal and removes staged copies after nested-link failures", async () => {
    await fs.symlink(fixture, path.join(root.path, "nested", "linked"), process.platform === "win32" ? "junction" : "dir");
    await expect(browser.getPath(1, { rootId: root.id, path: "nested/linked" })).rejects.toThrow("Linked files");
    await expect(browser.mutate(1, payload("copy", "nested", { destination: "", name: "bad-copy" }))).rejects.toThrow("linked files");
    expect(await fs.readdir(root.path)).not.toContain("bad-copy");
    expect((await fs.readdir(root.path)).some(name => name.startsWith(".nexus-copy-"))).toBe(false);
  });
});
