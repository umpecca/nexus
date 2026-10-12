// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FolderChange, FolderEntry, FolderMutation } from "../../electron";
import FolderSidebar from "./FolderSidebar";
import { loadWorkspaceHome, saveWorkspaceHome, workspaceStorageKey } from "../../lib/workspaceHome";

describe("folder sidebar", () => {
  let host: HTMLDivElement;
  let renderer: Root;
  let changed: (event: FolderChange) => void;
  let list: ReturnType<typeof vi.fn>;
  let mutate: ReturnType<typeof vi.fn>;
  let opened: ReturnType<typeof vi.fn>;
  let entries: Record<string, FolderEntry[]>;
  const root = { id: "root", path: "C:/docs", name: "docs" };
  const onRootChange = vi.fn();
  const onClose = vi.fn();
  const item = (name: string, path = name, kind: FolderEntry["kind"] = "file", openable = true): FolderEntry => ({ name, path, kind, openable });
  beforeEach(async () => {
    localStorage.clear();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    entries = { "": [item("nested", "nested", "folder", false), item("asset.png", "asset.png", "file", false), item("note.md")], nested: [item("child.md", "nested/child.md")] };
    list = vi.fn(async ({ path }) => entries[path] ?? []);
    mutate = vi.fn(async (payload: FolderMutation) => ({ canceled: false, path: payload.action === "newFile" ? payload.name : null }));
    opened = vi.fn(async () => {});
    window.nexus = { platform: "win32", listFolder: list, mutateFolder: mutate, onFolderChange: (callback: (event: FolderChange) => void) => { changed = callback; return vi.fn(); } } as unknown as Window["nexus"];
    host = document.createElement("div"); document.body.append(host); renderer = createRoot(host);
    await act(async () => { renderer.render(<FolderSidebar root={root} filePath="C:/docs/note.md" onOpen={opened} onClose={onClose} onRootChange={onRootChange} />); });
  });
  afterEach(async () => {
    await act(async () => { renderer.unmount(); }); host.remove(); delete window.nexus;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    vi.clearAllMocks();
  });
  function row(path: string) { return [...host.querySelectorAll<HTMLButtonElement>('[role="treeitem"]')].find(node => node.dataset.path === path)!; }
  async function clickRow(path: string) { await act(async () => row(path).click()); }
  async function toolbar(label: string) { await act(async () => host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click()); }
  async function key(path: string, value: string, ctrlKey = false) {
    await act(async () => { row(path).focus(); row(path).dispatchEvent(new KeyboardEvent("keydown", { key: value, ctrlKey, bubbles: true })); });
  }
  it("loads the root only and opens documents while lazy loading folders", async () => {
    expect(list).toHaveBeenCalledTimes(1);
    expect(row("asset.png")).toBeUndefined();
    expect(row("note.md").classList.contains("is-active")).toBe(true);
    await clickRow("nested");
    expect(list).toHaveBeenLastCalledWith({ rootId: "root", path: "nested" });
    expect(row("nested/child.md")).toBeTruthy();
    await clickRow("nested/child.md");
    expect(opened).toHaveBeenCalledWith("nested/child.md");
    await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    expect(row("asset.png")).toBeTruthy();
    await clickRow("asset.png");
    expect(opened).toHaveBeenCalledTimes(2);
  });
  it("uses one tree tab stop with arrow navigation, collapse, and keyboard renaming", async () => {
    await key("", "ArrowDown");
    expect(document.activeElement).toBe(row("nested"));
    await key("nested", "ArrowRight");
    await key("nested", "ArrowRight");
    expect(document.activeElement).toBe(row("nested/child.md"));
    await key("nested/child.md", "ArrowLeft");
    expect(document.activeElement).toBe(row("nested"));
    await key("nested", "ArrowLeft");
    expect(row("nested/child.md")).toBeUndefined();
    expect(host.querySelectorAll('[role="treeitem"][tabindex="0"]')).toHaveLength(1);
    await key("note.md", "F2");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Rename");
  });
  it("copy and cut/paste choose the selected folder; copying beside the source uses a new name", async () => {
    await key("note.md", "c", true);
    await key("", "v", true);
    expect(mutate).toHaveBeenLastCalledWith({ rootId: "root", action: "copy", path: "note.md", name: "note copy.md", destination: "" });
    await key("note.md", "x", true);
    await key("nested", "v", true);
    expect(mutate).toHaveBeenLastCalledWith({ rootId: "root", action: "move", path: "note.md", name: "note.md", destination: "nested" });
  });
  it("creates Markdown documents and opens the result through the App's protected opening flow", async () => {
    await toolbar("New Markdown file");
    const form = document.querySelector<HTMLFormElement>("#folder-operation")!;
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ rootId: "root", action: "newFile", name: "Untitled.md", destination: "" }));
    expect(opened).toHaveBeenCalledWith("Untitled.md");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("shows operation and open errors without removing the document or clipboard", async () => {
    opened.mockRejectedValueOnce(new Error("Could not read document"));
    await clickRow("note.md");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Could not read document");
    mutate.mockRejectedValueOnce(new Error("Destination already exists"));
    await key("note.md", "x", true); await key("nested", "v", true);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Destination already exists");
    expect(row("note.md").classList.contains("is-cut")).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('[aria-label="Paste into selected folder"]')!.disabled).toBe(false);
  });

  it("keeps newly created folders selected even before their directory refresh finishes", async () => {
    await clickRow("nested");
    mutate.mockResolvedValueOnce({ canceled: false, path: "nested/New folder" });
    await toolbar("New folder");
    await act(async () => document.querySelector<HTMLFormElement>("#folder-operation")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await toolbar("New Markdown file");
    await act(async () => document.querySelector<HTMLFormElement>("#folder-operation")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(mutate).toHaveBeenLastCalledWith(expect.objectContaining({ action: "newFile", destination: "nested/New folder" }));
  });
  it("refreshes loaded directories on matching events and ignores retired roots", async () => {
    await clickRow("nested"); list.mockClear();
    await act(async () => changed({ rootId: "retired", path: null }));
    expect(list).not.toHaveBeenCalled();
    entries.nested.push(item("new.md", "nested/new.md"));
    await act(async () => changed({ rootId: root.id, path: "nested" }));
    expect(row("nested/new.md")).toBeTruthy();
    await act(async () => changed({ rootId: root.id, path: null, root: null }));
    expect(onRootChange).toHaveBeenCalledWith(null);
  });
  it("resizes with the keyboard and closing delegates to App without touching the document", async () => {
    const resize = host.querySelector('[role="separator"]')!;
    await act(async () => resize.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(resize.getAttribute("aria-valuenow")).toBe("276");
    await toolbar("Close folder"); expect(onClose).toHaveBeenCalled();
    expect(opened).not.toHaveBeenCalled(); expect(mutate).not.toHaveBeenCalled();
  });
  it("shows an actionable home empty state, opens README ahead of index, and records only the actual active file", async () => {
    expect(host.querySelector<HTMLButtonElement>('[aria-label="Open workspace home"]')!.disabled).toBe(true);
    expect(host.textContent).toContain("Create README.md");
    entries[""].push(item("index.md"), item("README.md"));
    await act(async () => changed({ rootId: root.id, path: "" }));
    await toolbar("Open workspace home");
    expect(opened).toHaveBeenLastCalledWith("README.md");
    // A request can be cancelled by App; recents follow filePath rather than clicks.
    expect(loadWorkspaceHome(workspaceStorageKey(root.path)).recent).toEqual(["note.md"]);
    await act(async () => renderer.render(<FolderSidebar root={root} filePath="C:/docs/README.md" onOpen={opened} onClose={onClose} onRootChange={onRootChange} />));
    expect(loadWorkspaceHome(workspaceStorageKey(root.path)).recent).toEqual(["README.md", "note.md"]);
  });
  it("persists pins, supports removal, and restores a named view's folders and visibility", async () => {
    await toolbar("Pin current document");
    expect(loadWorkspaceHome(workspaceStorageKey(root.path)).pinned).toEqual(["note.md"]);
    await toolbar("Unpin note.md");
    expect(loadWorkspaceHome(workspaceStorageKey(root.path)).pinned).toEqual([]);
    const workspace = loadWorkspaceHome(workspaceStorageKey(root.path));
    saveWorkspaceHome(workspaceStorageKey(root.path), { ...workspace, views: [{ name: "References", expanded: ["nested"], showOther: true }] });
    await act(async () => window.dispatchEvent(new StorageEvent("storage", { key: workspaceStorageKey(root.path) })));
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === "References")!.click());
    expect(row("nested/child.md")).toBeTruthy(); expect(row("asset.png")).toBeTruthy();
    await toolbar("Delete view References");
    expect(loadWorkspaceHome(workspaceStorageKey(root.path)).views).toEqual([]);
  });
  it("saves and replaces views by name and preserves folder preferences when reopening", async () => {
    await clickRow("nested");
    await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    async function saveView() {
      await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === "Save current view…")!.click());
      const input = document.querySelector<HTMLInputElement>("#workspace-view input")!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "References");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => document.querySelector<HTMLFormElement>("#workspace-view")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    }
    await saveView();
    expect(loadWorkspaceHome(workspaceStorageKey(root.path)).views).toEqual([{ name: "References", expanded: ["nested"], showOther: true }]);
    await clickRow("nested");
    await saveView();
    expect(loadWorkspaceHome(workspaceStorageKey(root.path)).views).toEqual([{ name: "References", expanded: [], showOther: true }]);
    await toolbar("Pin current document");
    await act(async () => renderer.render(<FolderSidebar key="reopened" root={{ ...root, id: "new-grant" }} onOpen={opened} onClose={onClose} onRootChange={onRootChange} />));
    expect(host.querySelector('[aria-label="Unpin note.md"]')).toBeTruthy();
    expect(host.textContent).toContain("References");
    await act(async () => renderer.render(<FolderSidebar key="another-folder" root={{ id: "other", path: "C:/other", name: "other" }} onOpen={opened} onClose={onClose} onRootChange={onRootChange} />));
    expect(host.querySelector('[aria-label="Unpin note.md"]')).toBeNull();
    expect(host.textContent).not.toContain("References");
  });
  it("updates pinned/recent/home references on folder relocations and offers removal for missing files", async () => {
    const key = workspaceStorageKey(root.path);
    saveWorkspaceHome(key, { home: "nested/index.md", pinned: ["nested/child.md"], recent: ["nested/child.md"], views: [] });
    await act(async () => window.dispatchEvent(new StorageEvent("storage", { key })));
    entries.moved = entries.nested.map(entry => ({ ...entry, path: entry.path.replace("nested/", "moved/") }));
    await act(async () => changed({ rootId: root.id, path: null, relocation: { source: "C:/docs/nested", destination: "C:/docs/moved" } }));
    expect(loadWorkspaceHome(key)).toEqual({ home: "moved/index.md", pinned: ["moved/child.md"], recent: ["moved/child.md"], views: [] });
    await act(async () => changed({ rootId: root.id, path: null, relocation: { source: "C:/docs/moved", destination: null } }));
    expect(loadWorkspaceHome(key)).toEqual({ home: null, pinned: [], recent: [], views: [] });
    await toolbar("Pin current document"); entries[""] = entries[""].filter(entry => entry.path !== "note.md");
    await act(async () => changed({ rootId: root.id, path: "" }));
    const shortcut = host.querySelector<HTMLButtonElement>('.nexus-workspace-shortcut .nexus-file-row')!;
    expect(shortcut.disabled).toBe(true);
    await toolbar("Unpin note.md");
    expect(loadWorkspaceHome(key).pinned).toEqual([]);
  });
  it("migrates preferences when the opened root moves without copying them across profiles", async () => {
    await toolbar("Pin current document");
    const nextRoot = { ...root, path: "C:/moved-docs", name: "moved-docs" };
    await act(async () => renderer.render(<FolderSidebar root={nextRoot} filePath="C:/moved-docs/note.md" onOpen={opened} onClose={onClose} onRootChange={onRootChange} />));
    expect(loadWorkspaceHome(workspaceStorageKey(nextRoot.path)).pinned).toEqual(["note.md"]);
    await act(async () => renderer.render(<FolderSidebar root={nextRoot} profileName="another-profile" onOpen={opened} onClose={onClose} onRootChange={onRootChange} />));
    expect(host.querySelector('[aria-label="Unpin note.md"]')).toBeNull();
    expect(loadWorkspaceHome(workspaceStorageKey(nextRoot.path, "another-profile")).pinned).toEqual([]);
  });
});
