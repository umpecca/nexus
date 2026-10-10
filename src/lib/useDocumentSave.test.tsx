// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDocumentSave, type DocumentSaveSnapshot } from "./useDocumentSave";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("document save queue", () => {
  let root: Root;
  let container: HTMLDivElement;
  let state: DocumentSaveSnapshot;
  let previousVersion: string | undefined;
  let saver: ReturnType<typeof useDocumentSave>;
  let bridge: {
    saveMarkdownFile: ReturnType<typeof vi.fn<NonNullable<Window["nexus"]>["saveMarkdownFile"]>>;
    chooseMarkdownSavePath: ReturnType<typeof vi.fn<NonNullable<Window["nexus"]>["chooseMarkdownSavePath"]>>;
  };
  let prepare: ReturnType<typeof vi.fn<(markdown: string, path: string) => Promise<{ markdown: string; diagramNames?: string[] }>>>;
  let onError: ReturnType<typeof vi.fn>;
  let onSaved: ReturnType<typeof vi.fn>;

  function Harness({ available = true }: { available?: boolean }) {
    saver = useDocumentSave({
      getSnapshot: () => ({ ...state }),
      bridge: available ? bridge : undefined,
      prepareMarkdownForDisk: prepare,
      onSaved,
      onError
    });
    return null;
  }

  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    state = { documentId: 1, markdown: "edit one", filePath: "original.md", lastSavedMarkdown: "baseline" };
    previousVersion = undefined;
    bridge = {
      saveMarkdownFile: vi.fn(async (filePath) => ({ filePath })),
      chooseMarkdownSavePath: vi.fn(async () => ({ filePath: "chosen.md" }))
    };
    prepare = vi.fn(async (markdown) => ({ markdown }));
    onError = vi.fn();
    onSaved = vi.fn((snapshot: DocumentSaveSnapshot, filePath: string) => {
      previousVersion = snapshot.filePath ? snapshot.lastSavedMarkdown : undefined;
      state.lastSavedMarkdown = snapshot.markdown;
      state.filePath = filePath;
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => { root.render(<Harness />); });
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("retains edits made while writing and records only the saved snapshot", async () => {
    const write = deferred<{ filePath: string }>();
    bridge.saveMarkdownFile.mockReturnValueOnce(write.promise);
    const pending = saver.saveDocument();
    await vi.waitFor(() => expect(bridge.saveMarkdownFile).toHaveBeenCalledWith("original.md", "edit one", undefined));
    state.markdown = "edit two";
    write.resolve({ filePath: "original.md" });
    expect(await pending).toBe(true);
    expect(state.markdown).toBe("edit two");
    expect(state.lastSavedMarkdown).toBe("edit one");
    expect(previousVersion).toBe("baseline");
  });

  it("serializes saves and takes fresh text and baseline for each queued write", async () => {
    const write = deferred<{ filePath: string }>();
    bridge.saveMarkdownFile.mockReturnValueOnce(write.promise);
    const first = saver.saveDocument();
    await vi.waitFor(() => expect(bridge.saveMarkdownFile).toHaveBeenCalledTimes(1));
    state.markdown = "edit two";
    const second = saver.saveDocument();
    await Promise.resolve();
    expect(bridge.saveMarkdownFile).toHaveBeenCalledTimes(1);
    write.resolve({ filePath: "original.md" });
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(bridge.saveMarkdownFile.mock.calls).toEqual([
      ["original.md", "edit one", undefined], ["original.md", "edit two", undefined]
    ]);
    expect(state.lastSavedMarkdown).toBe("edit two");
    expect(previousVersion).toBe("edit one");
  });

  it("queues Save after Save As against its newly chosen path", async () => {
    const dialog = deferred<{ filePath: string }>();
    bridge.chooseMarkdownSavePath.mockReturnValueOnce(dialog.promise);
    const first = saver.saveDocumentAs();
    await vi.waitFor(() => expect(bridge.chooseMarkdownSavePath).toHaveBeenCalledTimes(1));
    state.markdown = "newer edit";
    const second = saver.saveDocument();
    dialog.resolve({ filePath: "new.md" });
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(bridge.saveMarkdownFile).toHaveBeenCalledWith("new.md", "newer edit", undefined);
    expect(state.filePath).toBe("new.md");
    expect(previousVersion).toBe("edit one");
  });

  it("an untitled first save keeps new edits dirty and avoids a second path dialog", async () => {
    state.filePath = undefined;
    state.lastSavedMarkdown = "";
    const dialog = deferred<{ filePath: string }>();
    bridge.chooseMarkdownSavePath.mockReturnValueOnce(dialog.promise);
    const first = saver.saveDocument();
    await vi.waitFor(() => expect(bridge.chooseMarkdownSavePath).toHaveBeenCalledWith(undefined));
    state.markdown = "edit two";
    dialog.resolve({ filePath: "first.md" });
    expect(await first).toBe(true);
    expect(state.markdown).toBe("edit two");
    expect(state.lastSavedMarkdown).toBe("edit one");
    expect(previousVersion).toBeUndefined();
    expect(await saver.saveDocument()).toBe(true);
    expect(bridge.chooseMarkdownSavePath).toHaveBeenCalledTimes(1);
    expect(bridge.saveMarkdownFile).toHaveBeenCalledWith("first.md", "edit two", undefined);
  });

  it.each([false, true])("cancellation leaves the document unchanged (untitled=%s)", async (untitled) => {
    if (untitled) state.filePath = undefined;
    const before = { ...state };
    bridge.chooseMarkdownSavePath.mockResolvedValueOnce({ canceled: true });
    expect(await (untitled ? saver.saveDocument() : saver.saveDocumentAs())).toBe(false);
    expect(state).toEqual(before);
    expect(onSaved).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports failed writes and permits queued retry without changing the baseline", async () => {
    const write = deferred<{ filePath: string }>();
    bridge.saveMarkdownFile.mockReturnValueOnce(write.promise);
    const first = saver.saveDocument();
    await vi.waitFor(() => expect(bridge.saveMarkdownFile).toHaveBeenCalledTimes(1));
    state.markdown = "retry text";
    const retry = saver.saveDocument();
    write.reject(new Error("Disk is full"));
    expect(await first).toBe(false);
    expect(onError).toHaveBeenCalledWith("Disk is full");
    expect(await retry).toBe(true);
    expect(previousVersion).toBe("baseline");
    expect(state.lastSavedMarkdown).toBe("retry text");
  });

  it("does not record a successful save if diagram preparation fails", async () => {
    prepare.mockRejectedValueOnce(new Error("Sidecar failed"));
    expect(await saver.saveDocument()).toBe(false);
    expect(onSaved).not.toHaveBeenCalled();
    expect(bridge.saveMarkdownFile).not.toHaveBeenCalled();
    expect(state.lastSavedMarkdown).toBe("baseline");
    expect(onError).toHaveBeenCalledWith("Sidecar failed");
  });

  it("does not adopt a new path when the Save As commit fails", async () => {
    prepare.mockResolvedValueOnce({ markdown: "externalized", diagramNames: [] });
    bridge.saveMarkdownFile.mockRejectedValueOnce(new Error("Rewrite failed"));
    expect(await saver.saveDocumentAs()).toBe(false);
    expect(state.filePath).toBe("original.md");
    expect(state.lastSavedMarkdown).toBe("baseline");
    expect(onSaved).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("Rewrite failed");
  });

  it("Save As prepares for the chosen path before its single final commit", async () => {
    const preparation = deferred<{ markdown: string; diagramNames: string[] }>();
    prepare.mockReturnValueOnce(preparation.promise);
    const pending = saver.saveDocumentAs();
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledWith("edit one", "chosen.md"));
    expect(bridge.saveMarkdownFile).not.toHaveBeenCalled();
    preparation.resolve({ markdown: "final disk text", diagramNames: ["asset.svg"] });
    expect(await pending).toBe(true);
    expect(bridge.saveMarkdownFile).toHaveBeenCalledTimes(1);
    expect(bridge.saveMarkdownFile).toHaveBeenCalledWith("chosen.md", "final disk text", ["asset.svg"]);
  });

  it("Save As preparation failure leaves the chosen destination unwritten", async () => {
    prepare.mockRejectedValueOnce(new Error("Preparation failed"));
    expect(await saver.saveDocumentAs()).toBe(false);
    expect(bridge.saveMarkdownFile).not.toHaveBeenCalled();
    expect(state.filePath).toBe("original.md");
    expect(state.lastSavedMarkdown).toBe("baseline");
  });

  it("saves diagram disk text but establishes the inline editor snapshot as baseline", async () => {
    prepare.mockResolvedValueOnce({ markdown: "sidecar reference", diagramNames: ["diagram.svg"] });
    expect(await saver.saveDocumentAs()).toBe(true);
    expect(bridge.saveMarkdownFile).toHaveBeenCalledWith("chosen.md", "sidecar reference", ["diagram.svg"]);
    expect(state.lastSavedMarkdown).toBe("edit one");
  });

  it("ignores a late save and queued requests after replacing the document, even at the same path", async () => {
    const write = deferred<{ filePath: string }>();
    bridge.saveMarkdownFile.mockReturnValueOnce(write.promise);
    const first = saver.saveDocument();
    await vi.waitFor(() => expect(bridge.saveMarkdownFile).toHaveBeenCalledTimes(1));
    const queued = saver.saveDocumentAs();
    state = { documentId: 2, markdown: "reloaded", filePath: "original.md", lastSavedMarkdown: "reloaded" };
    write.resolve({ filePath: "original.md" });
    expect(await first).toBe(false);
    expect(await queued).toBe(false);
    expect(onSaved).not.toHaveBeenCalled();
    expect(bridge.chooseMarkdownSavePath).not.toHaveBeenCalled();
    expect(state.lastSavedMarkdown).toBe("reloaded");
    expect(await saver.saveDocument()).toBe(true);
  });

  it("blocks close/replacement when edits arrive during save-before-close", async () => {
    const write = deferred<{ filePath: string }>();
    bridge.saveMarkdownFile.mockReturnValueOnce(write.promise);
    const canClose = saver.saveAndConfirmClean();
    await vi.waitFor(() => expect(bridge.saveMarkdownFile).toHaveBeenCalledTimes(1));
    state.markdown = "keep this edit";
    write.resolve({ filePath: "original.md" });
    expect(await canClose).toBe(false);
    expect(state.markdown).toBe("keep this edit");
    expect(await saver.saveAndConfirmClean()).toBe(true);
  });

  it("cancels a prepared save when a folder move changes the document path", async () => {
    const prepared = deferred<{ markdown: string }>();
    prepare.mockReturnValueOnce(prepared.promise);
    const pending = saver.saveDocument();
    await vi.waitFor(() => expect(prepare).toHaveBeenCalled());
    state.documentId++;
    state.filePath = "moved.md";
    prepared.resolve({ markdown: "disk snapshot" });
    expect(await pending).toBe(false);
    expect(bridge.saveMarkdownFile).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(await saver.saveDocument()).toBe(true);
    expect(bridge.saveMarkdownFile).toHaveBeenCalledWith("moved.md", "edit one", undefined);
  });

  it("does not show an old document's failed save on a replacement document", async () => {
    const write = deferred<{ filePath: string }>();
    bridge.saveMarkdownFile.mockReturnValueOnce(write.promise);
    const pending = saver.saveDocument();
    await vi.waitFor(() => expect(bridge.saveMarkdownFile).toHaveBeenCalledTimes(1));
    state.documentId += 1;
    write.reject(new Error("Old document failed"));
    expect(await pending).toBe(false);
    expect(onError).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("blocks close on save failure or cancellation", async () => {
    bridge.saveMarkdownFile.mockRejectedValueOnce(new Error("Denied"));
    expect(await saver.saveAndConfirmClean()).toBe(false);
    state.filePath = undefined;
    bridge.chooseMarkdownSavePath.mockResolvedValueOnce({ canceled: true });
    expect(await saver.saveAndConfirmClean()).toBe(false);
  });

  it("does not report success without a save bridge", async () => {
    await act(async () => { root.render(<Harness available={false} />); });
    expect(await saver.saveDocument()).toBe(false);
    expect(onError).toHaveBeenCalledWith("Saving is unavailable in this window.");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("treats code line endings as significant and asks for a text-file Save As path", async () => {
    state.exactText = true;
    state.filePath = undefined;
    state.markdown = "first\r\nsecond\r\n";
    const write = deferred<{ filePath: string }>();
    bridge.saveMarkdownFile.mockReturnValueOnce(write.promise);
    const pending = saver.saveAndConfirmClean();
    await vi.waitFor(() => expect(bridge.saveMarkdownFile).toHaveBeenCalled());
    expect(bridge.chooseMarkdownSavePath).toHaveBeenCalledWith(undefined, "text");
    state.markdown = "first\nsecond\n";
    write.resolve({ filePath: "chosen.md" });
    expect(await pending).toBe(false);
  });
});
