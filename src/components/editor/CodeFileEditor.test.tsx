// @vitest-environment jsdom
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { undo } from "@codemirror/commands";
import { syntaxTree } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
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
  function render(value: string, options: { filename?: string; diffRequest?: number; findRequest?: number; replaceRequest?: number } = {}) {
    root.render(<CodeFileEditor ref={editor} value={value} filename={options.filename ?? "note.txt"} onChange={changed} {...options} />);
  }
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
  it("opens native CodeMirror search/replace and reviews raw code without Markdown image folding", async () => {
    const value = 'const image = "![x](data:image/png;base64,' + "A".repeat(80) + ')";';
    await act(async () => render(value, { findRequest: 1, replaceRequest: 1 }));
    expect(host.querySelector('.cm-search')).toBeTruthy();
    await act(async () => render(value, { diffRequest: 1 }));
    expect(host.querySelector('.nexus-change-review')).toBeTruthy();
    expect(host.querySelector('.nexus-image-data-toggle')).toBeNull();
    const views = [...host.querySelectorAll<HTMLElement>('.cm-mergeView .cm-editor')].map(node => EditorView.findFromDOM(node)!);
    expect(views[1].state.sliceDoc()).toBe(value);
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === "Back to editor")!.click());
    expect(editor.current!.getValue()).toBe(value);
  });
});
