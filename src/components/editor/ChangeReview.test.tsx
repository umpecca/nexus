// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { getChunks } from "@codemirror/merge";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChangeReview from "./ChangeReview";
import AiEditPreviewDialog from "../ai/AiEditPreviewDialog";
import McpWriteConfirmDialog from "../mcp/McpWriteConfirmDialog";

// jsdom has no text layout API; CodeMirror measures text during scroll navigation.
Object.defineProperties(Range.prototype, {
  getClientRects: { configurable: true, value: () => [] },
  getBoundingClientRect: { configurable: true, value: () => new DOMRect() }
});

describe("shared change review", () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => { root.unmount(); });
    host.remove();
    vi.unstubAllGlobals();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  function views() {
    return [...document.querySelectorAll<HTMLElement>(".cm-editor")].map((dom) => EditorView.findFromDOM(dom)!);
  }
  async function click(label: string) {
    const button = [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((item) => item.textContent === label)!;
    expect(button).toBeTruthy();
    await act(async () => { button.click(); });
  }

  it("highlights changes, navigates both panes, and wraps through separated changes", async () => {
    const middle = Array.from({ length: 16 }, (_, i) => `unchanged ${i}`).join("\n");
    await act(async () => {
      root.render(<ChangeReview original={`old\n${middle}\nremoved`} proposed={`new\n${middle}\nadded`} />);
    });
    const [a, b] = views();
    const chunks = getChunks(a.state)!.chunks;
    expect(chunks).toHaveLength(2);
    expect(document.querySelectorAll(".cm-changedLine").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".cm-changedText").length).toBeGreaterThan(0);
    await click("Next change");
    expect(document.querySelector('[role="status"]')!.textContent).toBe("Change 1 of 2");
    await click("Next change");
    expect(a.state.selection.main.head).toBe(chunks[1].fromA);
    expect(b.state.selection.main.head).toBe(chunks[1].fromB);
    await click("Next change");
    expect(document.querySelector('[role="status"]')!.textContent).toBe("Change 1 of 2");
    await click("Previous change");
    expect(document.querySelector('[role="status"]')!.textContent).toBe("Change 2 of 2");
  });

  it.each([
    ["", "inserted"], ["deleted", ""], ["same\n", "same\nnew"], ["same\nold", "same\n"]
  ])("navigates insertion/deletion at document boundaries: %j → %j", async (original, proposed) => {
    await act(async () => { root.render(<ChangeReview original={original} proposed={proposed} />); });
    await click("Previous change");
    const [a, b] = views();
    expect(a.state.selection.main.head).toBeLessThanOrEqual(a.state.doc.length);
    expect(b.state.selection.main.head).toBeLessThanOrEqual(b.state.doc.length);
    expect(document.querySelector('[role="status"]')!.textContent).toBe("Change 1 of 1");
  });

  it("collapses unchanged sections, reveals a block, and restores the full view without changing inputs", async () => {
    const original = Array.from({ length: 60 }, (_, i) => `Line ${i}`).join("\n");
    const proposed = original.replace("Line 30", "Changed 30");
    await act(async () => { root.render(<ChangeReview original={original} proposed={proposed} />); });
    const checkbox = document.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    await act(async () => { checkbox.click(); });
    expect(checkbox.checked).toBe(true);
    const collapsed = document.querySelector<HTMLElement>(".cm-collapsedLines")!;
    expect(collapsed).toBeTruthy();
    await click("Next change");
    expect(document.querySelector('[role="status"]')!.textContent).toBe("Change 1 of 1");
    await act(async () => { collapsed.click(); });
    await act(async () => { checkbox.click(); });
    expect(document.querySelector(".cm-collapsedLines")).toBeNull();
    expect(views().map((view) => view.state.doc.toString())).toEqual([original, proposed]);
  });

  it("handles identical documents, resets navigation on replacement, and retains the collapse preference", async () => {
    await act(async () => { root.render(<ChangeReview original="same" proposed="changed" />); });
    await click("Next change");
    await act(async () => { document.querySelector<HTMLInputElement>("input")!.click(); });
    await act(async () => { root.render(<ChangeReview original="identical" proposed="identical" />); });
    expect(document.querySelector('[role="status"]')!.textContent).toBe("No changes");
    expect([...document.querySelectorAll<HTMLButtonElement>("button")]
      .filter((button) => button.textContent?.endsWith("change")).every((button) => button.disabled)).toBe(true);
    expect(document.querySelector<HTMLInputElement>("input")!.checked).toBe(true);
    await act(async () => { root.render(<ChangeReview original="before" proposed="after" />); });
    expect(document.querySelector('[role="status"]')!.textContent).toBe("1 change");
  });

  it("folds large changed image data independently, keeping both documents read-only and exact", async () => {
    const original = `![Image](data:image/png;base64,${"A".repeat(100_000)})`;
    const proposed = `![Image](data:image/png;base64,${"B".repeat(100_000)})`;
    await act(async () => { root.render(<ChangeReview original={original} proposed={proposed} />); });
    const [a, b] = views();
    expect(document.querySelector('[role="status"]')!.textContent).toBe("1 change");
    expect(a.contentDOM.textContent!.length).toBeLessThan(160);
    expect(b.contentDOM.textContent!.length).toBeLessThan(160);
    await act(async () => { a.dom.querySelector<HTMLButtonElement>(".nexus-image-data-toggle")!.click(); });
    expect(a.contentDOM.textContent).toContain("A".repeat(100));
    expect(b.contentDOM.textContent).not.toContain("B".repeat(100));
    expect(a.state.facet(EditorState.readOnly)).toBe(true);
    expect(b.state.facet(EditorState.readOnly)).toBe(true);
    expect(a.contentDOM.getAttribute("contenteditable")).toBe("false");
    expect(b.contentDOM.getAttribute("contenteditable")).toBe("false");
    expect([a.state.doc.toString(), b.state.doc.toString()]).toEqual([original, proposed]);
  });

  it("AI review copies the full folded proposal and resolves only through its existing actions", async () => {
    const proposed = "![Image](data:image/png;base64,aGVsbG8=)";
    const onAccept = vi.fn();
    const onReject = vi.fn();
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    await act(async () => {
      root.render(<AiEditPreviewDialog open target="selection" actionLabel="Rewrite"
        originalText="old" proposedText={proposed} onAccept={onAccept} onReject={onReject} />);
    });
    expect(document.querySelector(".nexus-change-review")).toBeTruthy();
    await click("Next change");
    await act(async () => { document.querySelector<HTMLInputElement>("input")!.click(); });
    expect(onAccept).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled();
    await click("Copy proposed");
    expect(writeText).toHaveBeenCalledWith(proposed);
    await click("Replace selection");
    expect(onAccept).toHaveBeenCalledTimes(1);
    await click("Discard");
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it("MCP review shares the viewer and leaves write approval explicit", async () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    await act(async () => {
      root.render(<McpWriteConfirmDialog open clientLabel="Test client" currentMarkdown="old"
        proposedMarkdown="new" onApprove={onApprove} onReject={onReject} />);
    });
    expect(document.querySelector(".nexus-change-review")).toBeTruthy();
    await click("Next change");
    expect(onApprove).not.toHaveBeenCalled();
    await click("Approve replacement");
    expect(onApprove).toHaveBeenCalledTimes(1);
    await click("Reject");
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it("bulk folding affects both panes, including images in hidden unchanged blocks", async () => {
    const image = "![Image](data:image/png;base64,aGVsbG8=)";
    const middle = `${"unchanged\n".repeat(12)}${image}\n${"unchanged\n".repeat(12)}`;
    const original = `old\n${image}\n${middle}`;
    const proposed = `new\n${image}\n${middle}`;
    await act(async () => { root.render(<ChangeReview original={original} proposed={proposed} />); });
    await act(async () => { document.querySelector<HTMLInputElement>("input")!.click(); });
    expect(document.querySelector(".cm-collapsedLines")).toBeTruthy();
    await click("Expand all");
    await act(async () => { document.querySelector<HTMLInputElement>("input")!.click(); });
    expect(document.querySelectorAll('.nexus-image-data-toggle[aria-expanded="true"]')).toHaveLength(4);
    await click("Collapse all");
    expect(document.querySelectorAll('.nexus-image-data-toggle[aria-expanded="false"]')).toHaveLength(4);
    expect(views().map((view) => view.state.doc.toString())).toEqual([original, proposed]);
  });

  it("Escape dismisses an image preview without rejecting its review dialog", async () => {
    const onReject = vi.fn();
    const image = "![Image](data:image/png;base64,aGVsbG8=)";
    await act(async () => {
      root.render(<McpWriteConfirmDialog open clientLabel="Test client" currentMarkdown={image}
        proposedMarkdown={`New\n\n${image}`} onApprove={vi.fn()} onReject={onReject} />);
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>(".nexus-image-preview-button")!.click();
    });
    expect(document.querySelector(".nexus-image-preview")).toBeTruthy();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    expect(document.querySelector(".nexus-image-preview")).toBeNull();
    expect(onReject).not.toHaveBeenCalled();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    expect(onReject).toHaveBeenCalledTimes(1);
  });
});
