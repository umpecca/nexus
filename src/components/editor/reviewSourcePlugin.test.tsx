// @vitest-environment jsdom
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MDXEditor, headingsPlugin, toolbarPlugin, viewMode$, type MDXEditorMethods } from "@mdxeditor/editor";
import { usePublisher } from "@mdxeditor/gurx";
import { EditorView } from "@codemirror/view";
import { undo } from "@codemirror/commands";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reviewSourcePlugin } from "./reviewSourcePlugin";
import { sourceImageFoldingExtension } from "./sourceImageFolding";

Object.defineProperties(Range.prototype, {
  getClientRects: { configurable: true, value: () => [] },
  getBoundingClientRect: { configurable: true, value: () => new DOMRect() }
});

function ModeControls() {
  const setMode = usePublisher(viewMode$);
  return <>{(["rich-text", "source", "diff"] as const).map((mode) =>
    <button key={mode} onClick={() => setMode(mode)}>{mode}</button>)}</>;
}

describe("editor source/review integration", () => {
  let root: Root;
  let host: HTMLDivElement;
  const editor = createRef<MDXEditorMethods>();
  const sourceExtensions = [sourceImageFoldingExtension()];
  const reviewExtensions: [] = [];
  const onChange = vi.fn();
  let comparison: string;

  function render() {
    root.render(<MDXEditor ref={editor} markdown="# Heading\n\nOriginal" onChange={onChange}
      plugins={[headingsPlugin(), reviewSourcePlugin({
        diffMarkdown: comparison, viewMode: "rich-text", sourceExtensions, reviewExtensions
      }), toolbarPlugin({ toolbarContents: ModeControls })]} />);
  }
  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    comparison = "# Heading\n\nPrevious";
    onChange.mockClear();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => { render(); });
  });
  afterEach(async () => {
    await act(async () => { root.unmount(); });
    host.remove();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });
  async function mode(label: string) {
    const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === label)!;
    await act(async () => { button.click(); });
  }
  function sourceView() {
    return EditorView.findFromDOM(host.querySelector<HTMLElement>(".mdxeditor-source-editor .cm-editor")!)!;
  }

  it("keeps source edits and undo history, then reviews the latest text through a mode round trip", async () => {
    await mode("source");
    const source = sourceView();
    await act(async () => {
      source.dispatch({ changes: { from: source.state.doc.length, insert: " edited" } });
    });
    expect(sourceView()).toBe(source);
    expect(editor.current!.getMarkdown()).toContain("Original edited");
    await act(async () => { undo(source); });
    expect(editor.current!.getMarkdown()).not.toContain(" edited");
    await act(async () => {
      source.dispatch({ changes: { from: source.state.doc.length, insert: " final" } });
    });
    await mode("diff");
    const panes = [...host.querySelectorAll<HTMLElement>(".mdxeditor-diff-editor .cm-editor")]
      .map((element) => EditorView.findFromDOM(element)!);
    expect(panes.map((view) => view.state.doc.toString())).toEqual([comparison, editor.current!.getMarkdown()]);
    expect(panes[1].state.doc.toString()).toContain("Original final");
    await mode("rich-text");
    expect(editor.current!.getMarkdown()).toContain("Original final");
    await mode("source");
    expect(sourceView().state.doc.toString()).toContain("Original final");
  });

  it("updates an open comparison and current document after external changes", async () => {
    await mode("diff");
    comparison = "# Heading\n\nNew baseline";
    await act(async () => { render(); });
    await act(async () => { editor.current!.setMarkdown("# Heading\n\nReloaded"); });
    const panes = [...host.querySelectorAll<HTMLElement>(".cm-editor")]
      .map((element) => EditorView.findFromDOM(element)!.state.doc.toString());
    expect(panes).toEqual([comparison, "# Heading\n\nReloaded"]);
    await mode("source");
    await act(async () => { editor.current!.setMarkdown("# Heading\n\nExternal source update"); });
    expect(sourceView().state.doc.toString()).toContain("External source update");
  });

  it("does not publish document changes when a source image fold is toggled", async () => {
    await mode("source");
    await act(async () => { editor.current!.setMarkdown("![Image](data:image/png;base64,aGVsbG8=)"); });
    const before = editor.current!.getMarkdown();
    onChange.mockClear();
    await act(async () => { host.querySelector<HTMLButtonElement>(".nexus-image-data-toggle")!.click(); });
    expect(editor.current!.getMarkdown()).toBe(before);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("offers source bulk controls without publishing edits or dirtying the document", async () => {
    await mode("source");
    const image = "![Image](data:image/png;base64,aGVsbG8=)";
    await act(async () => { editor.current!.setMarkdown(`${image}\n\n${image}`); });
    const before = editor.current!.getMarkdown();
    onChange.mockClear();
    await mode("Expand all");
    expect(host.querySelectorAll('.nexus-image-data-toggle[aria-expanded="true"]')).toHaveLength(2);
    await mode("Collapse all");
    expect(host.querySelectorAll('.nexus-image-data-toggle[aria-expanded="false"]')).toHaveLength(2);
    expect(editor.current!.getMarkdown()).toBe(before);
    expect(onChange).not.toHaveBeenCalled();
  });
});
