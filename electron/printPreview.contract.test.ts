import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(new URL("./main.cjs", import.meta.url), "utf8");
const preloadSource = readFileSync(new URL("./preload.cjs", import.meta.url), "utf8");
const titlebarSource = readFileSync(new URL("../src/components/titlebar/Titlebar.tsx", import.meta.url), "utf8");

describe("print preview Electron contract", () => {
  it("routes export and preview through the shared Chromium PDF renderer", () => {
    expect(mainSource).toContain("async function renderMarkdownPdfBuffer(payload)");
    expect(mainSource.match(/renderMarkdownPdfBuffer\(payload\)/g)).toHaveLength(3);
    expect(mainSource).toContain('ipcMain.handle("file:preview-pdf"');
    expect(mainSource).toContain('ipcMain.handle("file:save-pdf-preview"');
  });

  it("exposes preview generation and snapshot saving through the preload bridge", () => {
    expect(preloadSource).toContain("createPdfPreview(currentPath, markdown, options)");
    expect(preloadSource).toContain("savePdfPreview(currentPath, data)");
  });

  it("keeps Print Preview in File while omitting it from View", () => {
    expect(mainSource).toContain('label: "Print Preview"');
    expect(titlebarSource).toContain('dispatchMenuAction("printPreview")}>Print Preview</MenubarItem>');
    expect(mainSource).not.toContain('label: "Open Print Preview…"');
    expect(titlebarSource).not.toContain("Open Print Preview…");
    expect(mainSource).not.toContain("Show Approximate Page Guides");
    expect(mainSource).not.toContain("togglePageBoundaries");
  });

  it("adds print fragmentation rules for headings and common document blocks", () => {
    expect(mainSource).toContain("break-after: avoid-page");
    expect(mainSource).toContain("break-inside: avoid-page");
    expect(mainSource).toContain(".nexus-export-admonition,");
    expect(mainSource).not.toContain(".nexus-alert,");
    expect(mainSource).toContain("orphans: 3");
    expect(mainSource).toContain("widows: 3");
  });
});
