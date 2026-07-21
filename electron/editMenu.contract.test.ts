import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(new URL("./main.cjs", import.meta.url), "utf8");
const titlebarSource = readFileSync(new URL("../src/components/titlebar/Titlebar.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const toolbarSource = readFileSync(new URL("../src/components/editor/ShadcnMdxToolbar.tsx", import.meta.url), "utf8");

describe("Edit menu table of contents contract", () => {
  it("routes the native and rendered Edit menu commands through the shared insertion handler", () => {
    expect(mainSource).toContain('label: "Insert Table of Contents"');
    expect(mainSource).toContain('sendMenuAction("insertTableOfContents")');
    expect(titlebarSource).toContain('dispatchMenuAction("insertTableOfContents")');
    expect(appSource).toContain('case "insertTableOfContents":');
    expect(appSource).toContain("h.insertTableOfContents();");
    expect(toolbarSource).not.toContain("InsertTableOfContents");
  });
});
