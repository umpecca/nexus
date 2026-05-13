import { describe, expect, it } from "vitest";
import { isMermaidCodeBlock, renderMermaidDiagram } from "./mermaidRenderer";

describe("mermaid renderer helpers", () => {
  it("matches mermaid code block language only", () => {
    expect(isMermaidCodeBlock("mermaid")).toBe(true);
    expect(isMermaidCodeBlock(" Mermaid ")).toBe(true);
    expect(isMermaidCodeBlock("js")).toBe(false);
    expect(isMermaidCodeBlock(undefined)).toBe(false);
  });

  it("returns SVG output from a renderer", async () => {
    await expect(
      renderMermaidDiagram("flowchart TD\nA --> B", "diagram-id", () => ({
        svg: "<svg>diagram</svg>"
      }))
    ).resolves.toEqual({
      status: "success",
      svg: "<svg>diagram</svg>"
    });
  });

  it("returns a render error without throwing", async () => {
    await expect(
      renderMermaidDiagram("not mermaid", "diagram-id", () => {
        throw new Error("Parse error");
      })
    ).resolves.toEqual({
      status: "error",
      error: "Parse error"
    });
  });
});
