// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AssetPanel from "./AssetPanel";

describe("asset panel", () => {
  let host: HTMLDivElement, renderer: Root;
  let inspect: ReturnType<typeof vi.fn>, action: ReturnType<typeof vi.fn>;
  const markdown = '![Photo](data:image/png;base64,AAAA)\n\n![Lost](missing.png)';
  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div"); document.body.append(host); renderer = createRoot(host);
    inspect = vi.fn(async (_path, source: string) => source.startsWith("data:")
      ? { kind: "embedded", bytes: 3, preview: source } : { kind: "missing", error: "Image file is missing." });
    action = vi.fn(async () => {});
    window.nexus = { inspectDocumentAsset: inspect } as unknown as Window["nexus"];
    await act(async () => renderer.render(<AssetPanel markdown={markdown} documentPath="C:/docs/note.md" onClose={vi.fn()} onAction={action} />));
  });
  afterEach(async () => {
    await act(async () => renderer.unmount()); host.remove(); delete window.nexus;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });
  async function click(label: string) {
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === label || button.getAttribute("aria-label") === label)!.click());
  }
  async function loaded(image: HTMLImageElement) {
    Object.defineProperties(image, { naturalWidth: { value: 240 }, naturalHeight: { value: 160 } });
    await act(async () => image.dispatchEvent(new Event("load")));
  }
  it("restores dimensions after refreshing an unchanged cached thumbnail", async () => {
    const first = host.querySelector("img")!;
    await loaded(first);
    expect(host.textContent).toContain("240 × 160 px");
    await click("Refresh assets");
    const refreshed = host.querySelector("img")!;
    expect(refreshed).not.toBe(first);
    await loaded(refreshed);
    expect(host.textContent).toContain("240 × 160 px");
    expect(action).not.toHaveBeenCalled();
  });
  it("shows missing-file repair, image sizes and the explicit extraction action", async () => {
    expect(host.textContent).toContain("3 B"); expect(host.textContent).toContain("embedded image source");
    expect(host.textContent).toContain("Image file is missing.");
    await click("Locate file…");
    expect(action).toHaveBeenCalledWith(markdown, expect.objectContaining({ source: "missing.png" }), "locate");
    await click("Extract to file…");
    expect(action).toHaveBeenCalledWith(markdown, expect.objectContaining({ embedded: true }), "extract");
  });
  it("shows action failures and disables extraction for an untitled document", async () => {
    action.mockRejectedValueOnce(new Error("The document changed."));
    await click("Replace…");
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("The document changed.");
    await act(async () => renderer.render(<AssetPanel markdown={markdown} onClose={vi.fn()} onAction={action} />));
    expect([...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Extract to file…")?.disabled).toBe(true);
  });
});
