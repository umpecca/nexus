import { describe, expect, it } from "vitest";
import { extractOutline } from "./outline";

describe("extractOutline", () => {
  it("returns an empty list for a document with no headings", () => {
    expect(extractOutline("Just a paragraph.\n\nAnother line.")).toEqual([]);
  });

  it("extracts nested heading levels in document order", () => {
    const markdown = ["# Title", "", "## Section", "", "### Detail", "", "## Second"].join("\n");

    expect(extractOutline(markdown)).toEqual([
      { level: 1, text: "Title", index: 0 },
      { level: 2, text: "Section", index: 1 },
      { level: 3, text: "Detail", index: 2 },
      { level: 2, text: "Second", index: 3 }
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
      { level: 1, text: "Real Heading", index: 0 },
      { level: 2, text: "After Fence", index: 1 }
    ]);
  });

  it("ignores headings inside tilde-fenced code blocks", () => {
    const markdown = ["~~~", "# fenced", "~~~", "# Heading"].join("\n");

    expect(extractOutline(markdown)).toEqual([{ level: 1, text: "Heading", index: 0 }]);
  });

  it("gives repeated heading text distinct ordinal indexes", () => {
    const markdown = ["## Notes", "", "## Notes"].join("\n");

    expect(extractOutline(markdown)).toEqual([
      { level: 2, text: "Notes", index: 0 },
      { level: 2, text: "Notes", index: 1 }
    ]);
  });

  it("trims whitespace and strips closing hash markers", () => {
    const markdown = ["#    Spaced   ", "## Closed ##"].join("\n");

    expect(extractOutline(markdown)).toEqual([
      { level: 1, text: "Spaced", index: 0 },
      { level: 2, text: "Closed", index: 1 }
    ]);
  });

  it("does not treat seven or more hashes as a heading", () => {
    expect(extractOutline("####### Too deep")).toEqual([]);
  });
});
