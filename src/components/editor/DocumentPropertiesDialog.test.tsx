// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DocumentPropertiesDialog from "./DocumentPropertiesDialog";
import { applyDocumentProperties } from "../../lib/documentProperties";

describe("document properties dialog", () => {
  let host: HTMLDivElement, root: Root;
  let apply: ReturnType<typeof vi.fn>, close: ReturnType<typeof vi.fn>;
  const source = '---\ntitle: Document\ntype: Custom type\ntags: [ops, finance]\nstatus: Custom status\nowner: Alice\nreview_date: 2026-12-31\ncustom: keep\n---\n\n# Body\n';
  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
    apply = vi.fn(); close = vi.fn();
    await act(async () => root.render(<DocumentPropertiesDialog markdown={source} onApply={apply} onClose={close} />));
  });
  afterEach(async () => {
    await act(async () => root.unmount()); host.remove();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });
  const form = () => document.querySelector<HTMLFormElement>("#document-properties")!;
  function input(label: string) { return [...form().querySelectorAll("label")].find(node => node.firstChild?.textContent === label)!.querySelector<HTMLInputElement | HTMLTextAreaElement>("input,textarea")!; }
  async function fill(label: string, value: string) {
    const node = input(label);
    await act(async () => {
      Object.getOwnPropertyDescriptor(node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(node, value);
      node.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  async function submit() { await act(async () => form().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
  it("populates all six properties, retaining custom type/status values", () => {
    expect(input("Title").value).toBe("Document"); expect(input("Type").value).toBe("Custom type");
    expect(input("Tags").value).toBe("ops\nfinance"); expect(input("Status").value).toBe("Custom status");
    expect(input("Owner").value).toBe("Alice"); expect(input("Review date").value).toBe("2026-12-31");
    expect(apply).not.toHaveBeenCalled();
  });
  it("applies only on submission and closes after success", async () => {
    await fill("Title", "New title"); await fill("Tags", "one\ntwo");
    expect(apply).not.toHaveBeenCalled();
    await submit();
    expect(apply).toHaveBeenCalledWith({ title: "New title", type: "Custom type", tags: "one\ntwo", status: "Custom status", owner: "Alice", review_date: "2026-12-31" });
    expect(close).toHaveBeenCalledOnce();
  });
  it("cancels without writing", async () => {
    await fill("Owner", "Changed");
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === "Cancel")!.click());
    expect(close).toHaveBeenCalledOnce(); expect(apply).not.toHaveBeenCalled();
  });
  it("shows date validation and stale-document errors while keeping the form open", async () => {
    apply.mockImplementation(properties => applyDocumentProperties(source, properties));
    await fill("Review date", "2026-02-29"); await submit();
    expect(document.querySelector('[role="alert"]')!.textContent).toContain("calendar date");
    expect(close).not.toHaveBeenCalled();
    apply.mockImplementation(() => { throw new Error("The document changed. Reopen properties."); });
    await fill("Title", "Retain my draft"); await submit();
    expect(document.querySelector('[role="alert"]')!.textContent).toContain("document changed");
    expect(input("Title").value).toBe("Retain my draft"); expect(close).not.toHaveBeenCalled();
  });
  it("offers no Apply button for malformed YAML", async () => {
    await act(async () => root.render(<DocumentPropertiesDialog key="malformed" markdown={"---\ntags: [broken\n---\n# Body"} onApply={apply} onClose={close} />));
    expect(document.querySelector('[role="alert"]')!.textContent).toContain("Invalid YAML");
    expect(form()).toBeNull();
    expect([...document.querySelectorAll("button")].some(node => node.textContent === "Apply")).toBe(false);
  });
});
