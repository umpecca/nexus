// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FolderChange, FolderEntry, FolderMutation } from "../../electron";
import FolderSidebar from "./FolderSidebar";

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
});
