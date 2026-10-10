// @vitest-environment jsdom
import { EditorSelection, EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { MergeView } from "@codemirror/merge";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hasFoldableImageData, setAllImageDataExpanded, sourceImageFoldingExtension } from "./sourceImageFolding";

const payload = "aGVsbG8=";
const url = `data:image/png;base64,${payload}`;
const image = `![Sample](${url} "caption")`;
const views: { destroy(): void }[] = [];

function createView(doc = image, readOnly = false) {
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      extensions: [sourceImageFoldingExtension(), markdown(), EditorState.readOnly.of(readOnly)]
    })
  });
  views.push(view);
  return view;
}

function button(view: EditorView) {
  return view.dom.querySelector<HTMLButtonElement>(".nexus-image-data-toggle")!;
}

afterEach(() => {
  views.splice(0).forEach((view) => view.destroy());
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe("inline image folding", () => {
  it.each([false, true])("defaults to collapsed and toggles without changing source (readOnly=%s)", (readOnly) => {
    const view = createView(image, readOnly);
    expect(button(view).getAttribute("aria-expanded")).toBe("false");
    expect(view.contentDOM.textContent).toContain("![Sample](data:image/png;base64,");
    expect(view.contentDOM.textContent).toContain(' "caption")');
    expect(view.contentDOM.textContent).not.toContain(payload);
    button(view).click();
    expect(button(view).getAttribute("aria-expanded")).toBe("true");
    expect(view.contentDOM.textContent).toContain(payload);
    button(view).click();
    expect(view.contentDOM.textContent).not.toContain(payload);
    expect(view.state.doc.toString()).toBe(image);
  });

  it("handles multiple Markdown, HTML, SVG, and referenced images independently", () => {
    const doc = [
      image,
      `<img data-src="${url}" src='${url}' width="80">`,
      "![Diagram](<data:image/svg+xml;charset=utf-8;base64,PHN2Zz4=>)",
      "![Reference][asset]",
      `[asset]: ${url}`
    ].join("\n\n");
    const view = createView(doc);
    const buttons = view.dom.querySelectorAll<HTMLButtonElement>(".nexus-image-data-toggle");
    expect(buttons).toHaveLength(4);
    buttons[0].click();
    expect(view.dom.querySelectorAll('[aria-expanded="true"]')).toHaveLength(1);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("leaves code examples, non-image links, unused definitions, and external images visible", () => {
    const doc = [
      `\`${image}\``,
      `\n\`\`\`md\n${image}\n<img src="${url}">\n\`\`\``,
      `[Link](${url})`,
      `[unused]: ${url}`,
      "![Remote](https://example.com/image.png)",
      "![Local](image.png)",
      "![SVG](data:image/svg+xml,%3Csvg%3E)",
      `<a href="${url}">link</a>`,
      `<img data-src="${url}">`
    ].join("\n\n");
    const view = createView(doc);
    expect(button(view)).toBeNull();
    expect(view.contentDOM.textContent).toContain(payload);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("keeps original offsets and folds destinations rather than matching text in alt labels", () => {
    const doc = `![${url}](data:image/png;base64,QUJDREVGRw==) then ${image}`;
    const view = createView(doc);
    expect(view.dom.querySelectorAll(".nexus-image-data-toggle")).toHaveLength(2);
    expect(view.contentDOM.textContent).toContain(`![${url}](data:image/png;base64,`);
    expect(view.contentDOM.textContent).not.toContain("QUJDREVGRw==");
    view.dom.querySelectorAll<HTMLButtonElement>(".nexus-image-data-toggle").forEach((item) => item.click());
    expect(view.contentDOM.textContent).toContain("QUJDREVGRw==");
    expect(view.contentDOM.textContent).toContain("then ![Sample](data:image/png;base64,");
    expect(view.contentDOM.textContent).toContain(`${payload} "caption")`);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("folds MDXEditor's escaped data URL syntax while preserving its original bytes", () => {
    const doc = image.replace("data:", "data\\:");
    const view = createView(doc);
    expect(button(view).getAttribute("aria-expanded")).toBe("false");
    expect(view.contentDOM.textContent).toContain("data\\:image/png;base64,");
    expect(view.contentDOM.textContent).not.toContain(payload);
    button(view).click();
    expect(view.contentDOM.textContent).toContain(payload);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("preserves expanded state across surrounding and payload edits and collapses newly inserted images", () => {
    const view = createView();
    button(view).click();
    view.dispatch({ changes: { from: 0, insert: "Before\n\n" } });
    expect(button(view).getAttribute("aria-expanded")).toBe("true");
    const from = view.state.doc.toString().indexOf(payload);
    view.dispatch({ changes: { from: from + 2, to: from + 3, insert: "X" } });
    expect(button(view).getAttribute("aria-expanded")).toBe("true");
    view.dispatch({ changes: { from: view.state.doc.length, insert: `\n\n${image}` } });
    expect(view.dom.querySelectorAll('.nexus-image-data-toggle[aria-expanded="false"]')).toHaveLength(1);
    expect(view.state.doc.toString()).toContain("aGXsbG8=");
  });

  it("reveals a search match or caret inside hidden data, but keeps select-all collapsed", () => {
    const view = createView();
    view.dispatch({ selection: EditorSelection.range(0, image.length) });
    expect(button(view).getAttribute("aria-expanded")).toBe("false");
    expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe(image);
    const from = image.indexOf(payload);
    view.dispatch({ selection: EditorSelection.range(from + 1, from + 4) });
    expect(button(view).getAttribute("aria-expanded")).toBe("true");
    button(view).click();
    expect(button(view).getAttribute("aria-expanded")).toBe("false");
    view.dispatch({ selection: { anchor: from + 2 } });
    expect(button(view).getAttribute("aria-expanded")).toBe("true");
  });

  it("starts replacement documents collapsed and removes folds when images are deleted", () => {
    const view = createView();
    button(view).click();
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: `New\n\n${image}` } });
    expect(button(view).getAttribute("aria-expanded")).toBe("false");
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "Plain text" } });
    expect(button(view)).toBeNull();
    expect(view.contentDOM.textContent).toBe("Plain text");
  });

  it("folds a large image payload without replacing the underlying data", () => {
    const data = "A".repeat(300_000);
    const doc = `![Large](data:image/png;base64,${data})`;
    const view = createView(doc);
    expect(view.contentDOM.textContent!.length).toBeLessThan(150);
    expect(button(view).textContent).toContain("293.0K characters");
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("keeps image changes in the diff while allowing both panes to expand independently", () => {
    const changed = image.replace(payload, "d29ybGQ=");
    const merge = new MergeView({
      parent: document.body,
      a: { doc: image, extensions: [sourceImageFoldingExtension(), EditorState.readOnly.of(true)] },
      b: { doc: changed, extensions: [sourceImageFoldingExtension()] }
    });
    views.push(merge);
    expect(button(merge.a).getAttribute("aria-expanded")).toBe("false");
    expect(button(merge.b).getAttribute("aria-expanded")).toBe("false");
    expect(merge.chunks.length).toBeGreaterThan(0);
    button(merge.a).click();
    expect(merge.a.contentDOM.textContent).toContain(payload);
    expect(merge.b.contentDOM.textContent).not.toContain("d29ybGQ=");
    expect(merge.a.state.doc.toString()).toBe(image);
    expect(merge.b.state.doc.toString()).toBe(changed);
    expect(merge.chunks.length).toBeGreaterThan(0);
  });

  it.each([image, image.replace("data:", "data\\:"), `<img src="${url}">`, `![ref][asset]\n\n[asset]: ${url}`])(
    "previews detected image data on hover without expanding it: %s", (doc) => {
      const view = createView(doc);
      expect(view.dom.querySelector(".nexus-image-preview img")).toBeNull();
      const widget = view.dom.querySelector<HTMLElement>(".nexus-image-data-widget")!;
      widget.dispatchEvent(new MouseEvent("mouseenter"));
      const thumbnail = widget.querySelector<HTMLImageElement>(".nexus-image-preview img")!;
      expect(thumbnail.getAttribute("src")).toBe(url);
      expect(button(view).getAttribute("aria-expanded")).toBe("false");
      expect(view.state.doc.toString()).toBe(doc);
      Object.defineProperties(thumbnail, { naturalWidth: { value: 640 }, naturalHeight: { value: 480 } });
      thumbnail.dispatchEvent(new Event("load"));
      expect(widget.querySelector('.nexus-image-preview-status')!.textContent).toBe("640 × 480");
    }
  );

  it("pins a clicked preview through mouse leave and dismisses it with Escape without editing", () => {
    const view = createView();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const widget = view.dom.querySelector<HTMLElement>(".nexus-image-data-widget")!;
    const preview = widget.querySelector<HTMLButtonElement>(".nexus-image-preview-button")!;
    preview.click();
    widget.dispatchEvent(new MouseEvent("mouseleave"));
    vi.advanceTimersByTime(200);
    expect(widget.querySelector(".nexus-image-preview")).toBeTruthy();
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    preview.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(widget.querySelector(".nexus-image-preview")).toBeNull();
    expect(button(view).getAttribute("aria-expanded")).toBe("false");
    expect(view.state.doc.toString()).toBe(image);
  });

  it("offers previews on keyboard focus and removes a transient preview after leaving", () => {
    const view = createView();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const widget = view.dom.querySelector<HTMLElement>(".nexus-image-data-widget")!;
    const preview = widget.querySelector<HTMLButtonElement>(".nexus-image-preview-button")!;
    preview.focus();
    expect(widget.querySelector(".nexus-image-preview")).toBeTruthy();
    preview.blur();
    widget.dispatchEvent(new MouseEvent("mouseleave"));
    vi.advanceTimersByTime(200);
    expect(widget.querySelector(".nexus-image-preview")).toBeNull();
  });

  it("shows unavailable data safely and supports explicit close and outside-click dismissal", () => {
    const view = createView();
    const preview = view.dom.querySelector<HTMLButtonElement>(".nexus-image-preview-button")!;
    preview.click();
    const thumbnail = view.dom.querySelector<HTMLImageElement>(".nexus-image-preview img")!;
    thumbnail.dispatchEvent(new Event("error"));
    expect(thumbnail.hidden).toBe(true);
    expect(view.dom.querySelector(".nexus-image-preview-status")!.textContent).toBe("Preview unavailable");
    view.dom.querySelector<HTMLButtonElement>('[aria-label="Close image preview"]')!.click();
    expect(view.dom.querySelector(".nexus-image-preview")).toBeNull();
    preview.click();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(view.dom.querySelector(".nexus-image-preview")).toBeNull();
    expect(view.state.doc.toString()).toBe(image);
  });

  it("cleans up previews on scrolling, edits, folding, and view destruction", () => {
    const view = createView();
    const preview = () => view.dom.querySelector<HTMLButtonElement>(".nexus-image-preview-button")!;
    preview().click();
    view.scrollDOM.dispatchEvent(new Event("scroll"));
    expect(view.dom.querySelector(".nexus-image-preview")).toBeNull();
    preview().click();
    const from = image.indexOf(payload);
    view.dispatch({ changes: { from, to: from + 1, insert: "B" } });
    expect(view.dom.querySelector(".nexus-image-preview")).toBeNull();
    preview().click();
    expect(view.dom.querySelector<HTMLImageElement>(".nexus-image-preview img")!.getAttribute("src"))
      .toBe(url.replace(payload, "BGVsbG8="));
    button(view).click();
    expect(view.dom.querySelector(".nexus-image-preview")).toBeNull();
    preview().click();
    view.destroy();
    views.pop();
    expect(document.querySelector(".nexus-image-preview")).toBeNull();
  });

  it.each([false, true])("expands and collapses all data without document edits (readOnly=%s)", (readOnly) => {
    const doc = `${image}\n\n${image}\n\n\`${image}\``;
    const view = createView(doc, readOnly);
    expect(hasFoldableImageData(view)).toBe(true);
    setAllImageDataExpanded(view, true);
    expect(view.dom.querySelectorAll('.nexus-image-data-toggle[aria-expanded="true"]')).toHaveLength(2);
    const from = doc.indexOf(payload);
    view.dispatch({ selection: { anchor: from + 2 } });
    setAllImageDataExpanded(view, false);
    expect(view.dom.querySelectorAll('.nexus-image-data-toggle[aria-expanded="false"]')).toHaveLength(2);
    expect(view.state.doc.toString()).toBe(doc);
    setAllImageDataExpanded(view, true);
    view.dispatch({ changes: { from: view.state.doc.length, insert: `\n\n${image}` } });
    expect(view.dom.querySelectorAll('.nexus-image-data-toggle[aria-expanded="false"]')).toHaveLength(1);
    expect(view.dom.querySelectorAll('.nexus-image-data-toggle[aria-expanded="true"]')).toHaveLength(2);
  });
});
