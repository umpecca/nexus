import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./InsertKatexBlock.tsx", import.meta.url), "utf8");

describe("math toolbar contract", () => {
  it("groups inline and display math behind one dropdown control", () => {
    expect(source).toContain("ButtonOrDropdownButton");
    expect(source).toContain('{ value: "inline", label: "Inline math" }');
    expect(source).toContain('{ value: "block", label: "Block math" }');
    expect(source).toContain('title="Insert math"');
    expect(source).not.toContain("TooltipWrap");
  });
});
