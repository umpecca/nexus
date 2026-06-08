import { describe, expect, it } from "vitest";
import { extractOutline, getActiveHeadingIndex } from "./outline";

describe("extractOutline", () => {
  it("returns an empty list for a document with no headings", () => {
    expect(extractOutline("Just a paragraph.\n\nAnother line.")).toEqual([]);
  });

  it("extracts nested heading levels in document order", () => {
    const markdown = ["# Title", "", "## Section", "", "### Detail", "", "## Second"].join("\n");

    expect(extractOutline(markdown)).toEqual([
      { level: 1, text: "Title", index: 0, line: 0 },
      { level: 2, text: "Section", index: 1, line: 2 },
      { level: 3, text: "Detail", index: 2, line: 4 },
      { level: 2, text: "Second", index: 3, line: 6 }
    ]);
  });

  it("ignores heading-like lines inside fenced code blocks", () => {
    const markdown = [
      "# Real Heading",
      "",
      "```bash",
      "# not a heading",
      "echo hi",
      "```",
      "",
      "## After Fence"
    ].join("\n");

    expect(extractOutline(markdown)).toEqual([
      { level: 1, text: "Real Heading", index: 0, line: 0 },
      { level: 2, text: "After Fence", index: 1, line: 7 }
    ]);
  });

  it("ignores headings inside tilde-fenced code blocks", () => {
    const markdown = ["~~~", "# fenced", "~~~", "# Heading"].join("\n");

    expect(extractOutline(markdown)).toEqual([{ level: 1, text: "Heading", index: 0, line: 3 }]);
  });

  it("gives repeated heading text distinct ordinal indexes", () => {
    const markdown = ["## Notes", "", "## Notes"].join("\n");

    expect(extractOutline(markdown)).toEqual([
      { level: 2, text: "Notes", index: 0, line: 0 },
      { level: 2, text: "Notes", index: 1, line: 2 }
    ]);
  });

  it("trims whitespace and strips closing hash markers", () => {
    const markdown = ["#    Spaced   ", "## Closed ##"].join("\n");

    expect(extractOutline(markdown)).toEqual([
      { level: 1, text: "Spaced", index: 0, line: 0 },
      { level: 2, text: "Closed", index: 1, line: 1 }
    ]);
  });

  it("does not treat seven or more hashes as a heading", () => {
    expect(extractOutline("####### Too deep")).toEqual([]);
  });

  it("decodes numeric character references emitted by the serializer", () => {
    const markdown = ["# Heading&#x20;", "## &#x20;Leading space", "### A&#x20;&#x20;B"].join("\n");

    expect(extractOutline(markdown)).toEqual([
      { level: 1, text: "Heading", index: 0, line: 0 },
      { level: 2, text: "Leading space", index: 1, line: 1 },
      { level: 3, text: "A  B", index: 2, line: 2 }
    ]);
  });

  it("decodes common named character references", () => {
    const markdown = ["# Tom &amp; Jerry", "## 5 &lt; 10"].join("\n");

    expect(extractOutline(markdown)).toEqual([
      { level: 1, text: "Tom & Jerry", index: 0, line: 0 },
      { level: 2, text: "5 < 10", index: 1, line: 1 }
    ]);
  });

  it("does not treat an encoded hash as a closing marker", () => {
    expect(extractOutline("# Issue &#x23;42")).toEqual([
      { level: 1, text: "Issue #42", index: 0, line: 0 }
    ]);
  });

  it("leaves unknown character references untouched", () => {
    expect(extractOutline("# Keep &unknown; intact")).toEqual([
      { level: 1, text: "Keep &unknown; intact", index: 0, line: 0 }
    ]);
  });

  it("records the line index of headings separated by body content", () => {
    const markdown = ["# One", "para", "para", "## Two", "", "more", "### Three"].join("\n");

    expect(extractOutline(markdown).map((heading) => heading.line)).toEqual([0, 3, 6]);
  });
});

describe("getActiveHeadingIndex", () => {
  const viewport = (scrollTop: number, clientHeight = 600, scrollHeight = 2000) => ({
    scrollTop,
    clientHeight,
    scrollHeight
  });

  it("returns -1 when there are no headings", () => {
    expect(getActiveHeadingIndex([], viewport(0), 100)).toBe(-1);
  });

  it("keeps the first heading active above the first heading", () => {
    expect(getActiveHeadingIndex([0, 400, 800], viewport(0), 100)).toBe(0);
  });

  it("activates the last heading whose top is at or above the activation line", () => {
    // Activation line = 350 + 100 = 450, so heading at 400 wins over the one at 800.
    expect(getActiveHeadingIndex([0, 400, 800], viewport(350), 100)).toBe(1);
  });

  it("advances to a heading exactly on the activation line", () => {
    // Activation line = 700 + 100 = 800, which equals the third heading's top.
    expect(getActiveHeadingIndex([0, 400, 800], viewport(700), 100)).toBe(2);
  });

  it("activates the final heading when scrolled to the bottom", () => {
    // Bottom: scrollTop + clientHeight reaches scrollHeight even though the last
    // heading's top is below the activation line.
    expect(getActiveHeadingIndex([0, 400, 1950], viewport(1400), 100)).toBe(2);
  });

  it("treats unresolved heading tops (Infinity) as never active", () => {
    expect(getActiveHeadingIndex([0, Number.POSITIVE_INFINITY], viewport(1000), 100)).toBe(0);
  });
});
