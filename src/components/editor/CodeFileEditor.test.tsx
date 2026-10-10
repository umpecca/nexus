// @vitest-environment jsdom
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { undo } from "@codemirror/commands";
import { syntaxTree } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { getSearchQuery, searchPanelOpen } from "@codemirror/search";
import CodeFileEditor, { type CodeFileEditorHandle } from "./CodeFileEditor";

Object.defineProperties(Range.prototype, {
  getClientRects: { configurable: true, value: () => [] },
  getBoundingClientRect: { configurable: true, value: () => new DOMRect() }
});
describe("code and plain text editor", () => {
  let root: Root;
  let host: HTMLDivElement;
  const editor = createRef<CodeFileEditorHandle>();
  const changed = vi.fn();
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div"); document.body.append(host); root = createRoot(host); changed.mockClear();
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT; });
  function render(value: string, options: { filename?: string; diffRequest?: number; findRequest?: number; replaceRequest?: number; zoom?: number } = {}) {
    root.render(<CodeFileEditor ref={editor} value={value} filename={options.filename ?? "note.txt"} onChange={changed} {...options} />);
  }
  async function input(label: string, value: string) {
    await act(async () => {
      const field = host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  async function click(label: string) { await act(async () => host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click()); }
  async function key(key: string, ctrlKey = false, shiftKey = false) {
    await act(async () => editor.current!.getView()!.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey, shiftKey, bubbles: true, cancelable: true })));
  }
  function count() { return host.querySelector(".nexus-find-count")?.textContent; }
  it.each(["\ufeff# Literal\n\t**text**  \n", "first\r\n\tsecond\r\n", "first\nsecond\r\n", "first\rsecond\r"])("keeps raw text intact on load and edits: %j", async value => {
    await act(async () => render(value));
    expect(editor.current!.getValue()).toBe(value); expect(changed).not.toHaveBeenCalled();
    const view = editor.current!.getView()!;
    await act(async () => view.dispatch({ changes: { from: view.state.doc.length, insert: "literal" } }));
    expect(changed).toHaveBeenLastCalledWith(`${value}literal`);
    await act(async () => { undo(view); });
    expect(editor.current!.getValue()).toBe(value);
  });
  it("loads automatic syntax support for code and allows a plain text override", async () => {
    await act(async () => render("const answer: number = 42;", { filename: "schema.ts" }));
    await vi.waitFor(() => expect(syntaxTree(editor.current!.getView()!.state).topNode.name).toBe("Script"));
    expect(host.querySelector<HTMLSelectElement>('select')!.selectedOptions[0].textContent).toContain("TypeScript");
    await act(async () => { const select = host.querySelector('select')!; select.value = "plain"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(syntaxTree(editor.current!.getView()!.state).topNode.name).not.toBe("Script");
    expect(editor.current!.getValue()).toBe("const answer: number = 42;");
  });
  it("preserves history across wrapping and path/theme changes", async () => {
    await act(async () => render("original"));
    const view = editor.current!.getView()!;
    await act(async () => view.dispatch({ changes: { from: 0, to: 8, insert: "updated" } }));
    await act(async () => render("updated", { filename: "renamed.txt" }));
    await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    expect(editor.current!.getView()).toBe(view);
    await act(async () => { undo(view); });
    expect(editor.current!.getValue()).toBe("original");
  });
  it("synchronizes external replacements with changed newline conventions without double CRs", async () => {
    await act(async () => render("one\ntwo\n"));
    await act(async () => render("new\r\ntext\r\n"));
    expect(editor.current!.getValue()).toBe("new\r\ntext\r\n");
    expect(changed).not.toHaveBeenCalled();
  });
  it("preserves the buffer, selection, and undo history when zooming in and out", async () => {
    await act(async () => render("first\nsecond"));
    const view = editor.current!.getView()!;
    await act(async () => view.dispatch({ changes: { from: view.state.doc.length, insert: " edited" }, selection: { anchor: 2 } }));
    changed.mockClear();
    for (const zoom of [150, 70, 100]) {
      await act(async () => render("first\nsecond edited", { zoom }));
      expect(editor.current!.getView()).toBe(view);
      expect(view.state.selection.main.anchor).toBe(2);
      expect(editor.current!.getValue()).toBe("first\nsecond edited");
    }
    expect(changed).not.toHaveBeenCalled();
    await act(async () => { undo(view); });
    expect(editor.current!.getValue()).toBe("first\nsecond");
  });
  it("opens Nexus search/replace and reviews raw code without Markdown image folding", async () => {
    const value = 'const image = "![x](data:image/png;base64,' + "A".repeat(80) + ')";';
    await act(async () => render(value, { findRequest: 1, replaceRequest: 1 }));
    expect(host.querySelector('.nexus-find-panel')).toBeTruthy();
    expect(host.querySelector('[aria-label="Replace with"]')).toBeTruthy();
    expect(host.querySelector('.cm-search')).toBeNull();
    await act(async () => render(value, { diffRequest: 1 }));
    expect(host.querySelector('.nexus-change-review')).toBeTruthy();
    expect(host.querySelector('.nexus-image-data-toggle')).toBeNull();
    const views = [...host.querySelectorAll<HTMLElement>('.cm-mergeView .cm-editor')].map(node => EditorView.findFromDOM(node)!);
    expect(views[1].state.sliceDoc()).toBe(value);
    await act(async () => render(value, { diffRequest: 1, zoom: 150 }));
    expect([...host.querySelectorAll<HTMLElement>('.cm-mergeView .cm-editor')].map(node => EditorView.findFromDOM(node)!)).toEqual(views);
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === "Back to editor")!.click());
    expect(editor.current!.getValue()).toBe(value);
  });
  it("finds literal text, navigates and replaces one/all while preserving CRLF and undo", async () => {
    const value = "\ufeff[x]\\n\r\n[X]\\n\r\nother";
    await act(async () => render(value, { findRequest: 1 }));
    expect(host.querySelector('[aria-label="Replace with"]')).toBeNull();
    await input("Find text", "[x]\\n");
    const view = editor.current!.getView()!;
    expect(count()).toBe("1 of 2");
    expect(view.state.selection.main.from).toBe(1);
    expect(changed).not.toHaveBeenCalled();
    await click("Next match"); expect(count()).toBe("2 of 2");
    await click("Next match"); expect(count()).toBe("1 of 2");
    await click("Previous match"); expect(count()).toBe("2 of 2");
    await click("Next match");
    await act(async () => render(value, { findRequest: 1, replaceRequest: 1 }));
    await input("Replace with", "$&\\n");
    await click("Replace match");
    expect(editor.current!.getValue()).toBe("\ufeff$&\\n\r\n[X]\\n\r\nother");
    expect(count()).toBe("1 of 1");
    await click("Replace all matches");
    expect(editor.current!.getValue()).toBe("\ufeff$&\\n\r\n$&\\n\r\nother");
    expect(count()).toBe("0 of 0");
    await act(async () => { undo(view); });
    expect(editor.current!.getValue()).toBe("\ufeff$&\\n\r\n[X]\\n\r\nother");
    await act(async () => { undo(view); });
    expect(editor.current!.getValue()).toBe(value);
    expect(count()).toBe("1 of 2");
  });
  it("uses Nexus controls for keyboard and toolbar requests, and clears search on Escape", async () => {
    await act(async () => render("alpha alpha"));
    await key("f", true);
    expect(host.querySelector('.nexus-find-panel')).toBeTruthy();
    expect(host.querySelector('.cm-search')).toBeNull();
    await input("Find text", "alpha");
    await key("F3"); expect(count()).toBe("2 of 2");
    await key("F3", false, true); expect(count()).toBe("1 of 2");
    await key("h", true);
    expect(host.querySelector('[aria-label="Replace with"]')).toBeTruthy();
    await key("Escape");
    expect(host.querySelector('.nexus-find-panel')).toBeNull();
    expect(searchPanelOpen(editor.current!.getView()!.state)).toBe(false);
    expect(getSearchQuery(editor.current!.getView()!.state).search).toBe("");
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Find / Replace")!.click());
    expect(host.querySelector<HTMLInputElement>('[aria-label="Find text"]')!.value).toBe("");
    expect(host.querySelector('[aria-label="Replace with"]')).toBeTruthy();
    await input("Find text", "missing");
    expect(count()).toBe("0 of 0");
    expect(host.querySelector<HTMLButtonElement>('[aria-label="Replace match"]')!.disabled).toBe(true);
    await click("Close find");
    expect(host.querySelector('.nexus-find-panel')).toBeNull();
  });
  it("updates counts after edits and opens Find from the comparison view", async () => {
    await act(async () => render("alpha alpha", { findRequest: 1 }));
    await input("Find text", "alpha");
    await act(async () => render("alpha beta", { findRequest: 1 }));
    expect(count()).toBe("1 of 1");
    await act(async () => render("alpha beta", { findRequest: 1, diffRequest: 1 }));
    expect(host.querySelector('.nexus-find-panel')).toBeNull();
    await act(async () => host.querySelector<HTMLElement>('.cm-mergeView .cm-content')!.dispatchEvent(new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true, cancelable: true })));
    expect(host.querySelector('.nexus-change-review')).toBeNull();
    expect(host.querySelector('.nexus-find-panel')).toBeTruthy();
    expect(host.querySelector('.cm-search')).toBeNull();
    await act(async () => render("alpha beta", { findRequest: 1, diffRequest: 2 }));
    await act(async () => render("alpha beta", { findRequest: 2, diffRequest: 2 }));
    expect(host.querySelector('.nexus-change-review')).toBeNull();
    expect(host.querySelector('.nexus-find-panel')).toBeTruthy();
  });
});
