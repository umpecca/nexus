import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { extractOutline } from "./outline";

// The logic under test is the Electron main-process CommonJS module (no transpile step at runtime),
// so load it through a real `require` rather than an ESM import. The renderer never bundles it.
const require = createRequire(import.meta.url);
const documentTools = require("../../electron/mcpDocumentTools.cjs") as {
  buildDocumentOutline: (
    markdown: string
  ) => Array<{ level: number; text: string; slug: string; index: number; line: number }>;
  getDocumentSection: (
    markdown: string,
    selector: { index?: number; slug?: string; heading?: string }
  ) => {
    found: boolean;
    reason?: string;
    heading?: string;
    level?: number;
    slug?: string;
    index?: number;
    startLine?: number;
    endLine?: number;
    lineCount?: number;
    markdown?: string;
    headingCount?: number;
    headings?: Array<{ index: number; level: number; slug: string; text: string }>;
  };
  searchDocument: (
    markdown: string,
    options: { query: string; isRegex?: boolean; caseSensitive?: boolean; maxResults?: number }
  ) => {
    query: string;
    isRegex: boolean;
    caseSensitive: boolean;
    total: number;
    truncated: boolean;
    matches: Array<{ line: number; column: number; match: string; preview: string }>;
  };
};

const { buildDocumentOutline, getDocumentSection, searchDocument } = documentTools;

const lines = (...parts: string[]) => parts.join("\n");

describe("buildDocumentOutline", () => {
  // Every document the renderer's extractOutline test exercises must produce the same level/text/line
  // (the CJS port is 1-based; extractOutline is 0-based) so the two implementations never drift.
  const parityDocuments = [
    "Just a paragraph.\n\nAnother line.",
    lines("# Title", "", "## Section", "", "### Detail", "", "## Second"),
    lines("# Real Heading", "", "```bash", "# not a heading", "echo hi", "```", "", "## After Fence"),
    lines("~~~", "# fenced", "~~~", "# Heading"),
    lines("## Notes", "", "## Notes"),
    lines("#    Spaced   ", "## Closed ##"),
    "####### Too deep",
    lines("# Heading&#x20;", "## &#x20;Leading space", "### A&#x20;&#x20;B"),
    lines("# Tom &amp; Jerry", "## 5 &lt; 10"),
    "# Issue &#x23;42",
    lines("# One", "para", "para", "## Two", "", "more", "### Three")
  ];

  it("matches extractOutline level/text/line for every parity document", () => {
    for (const markdown of parityDocuments) {
      const ported = buildDocumentOutline(markdown).map((heading) => ({
        level: heading.level,
        text: heading.text,
        index: heading.index,
        line: heading.line - 1
      }));
      expect(ported).toEqual(extractOutline(markdown));
    }
  });

  it("assigns deduplicated GitHub-style slugs in document order", () => {
    const outline = buildDocumentOutline(lines("# Notes", "## Notes", "## Hello, World!"));
    expect(outline.map((heading) => heading.slug)).toEqual(["notes", "notes-1", "hello-world"]);
  });

  it("reports 1-based line numbers", () => {
    const outline = buildDocumentOutline(lines("# One", "para", "## Two"));
    expect(outline.map((heading) => heading.line)).toEqual([1, 3]);
  });
});

describe("getDocumentSection", () => {
  const doc = lines(
    "# Title",
    "",
    "Intro paragraph.",
    "",
    "## Alpha",
    "",
    "Alpha body.",
    "",
    "### Alpha Detail",
    "",
    "Detail body.",
    "",
    "## Beta",
    "",
    "Beta body.",
    ""
  );

  it("returns a section by heading ordinal index, including deeper subsections", () => {
    const result = getDocumentSection(doc, { index: 1 });
    expect(result.found).toBe(true);
    expect(result.heading).toBe("Alpha");
    expect(result.slug).toBe("alpha");
    expect(result.markdown).toBe(
      lines("## Alpha", "", "Alpha body.", "", "### Alpha Detail", "", "Detail body.")
    );
    expect(result.startLine).toBe(5);
    expect(result.endLine).toBe(11);
  });

  it("stops a subsection at the next same-or-higher heading", () => {
    const result = getDocumentSection(doc, { slug: "alpha-detail" });
    expect(result.found).toBe(true);
    expect(result.markdown).toBe(lines("### Alpha Detail", "", "Detail body."));
  });

  it("resolves a section by exact heading text and trims trailing blank lines", () => {
    const result = getDocumentSection(doc, { heading: "Beta" });
    expect(result.found).toBe(true);
    expect(result.markdown).toBe(lines("## Beta", "", "Beta body."));
  });

  it("matches heading text case-insensitively as a fallback", () => {
    const result = getDocumentSection(doc, { heading: "beta" });
    expect(result.found).toBe(true);
    expect(result.slug).toBe("beta");
  });

  it("reports not-found with the available headings when nothing matches", () => {
    const result = getDocumentSection(doc, { slug: "missing" });
    expect(result.found).toBe(false);
    expect(result.reason).toBe("not-found");
    expect(result.headingCount).toBe(4);
    expect(result.headings?.map((heading) => heading.slug)).toEqual([
      "title",
      "alpha",
      "alpha-detail",
      "beta"
    ]);
  });

  it("reports no-headings for a document without headings", () => {
    const result = getDocumentSection("Just prose.\n\nMore prose.", { index: 0 });
    expect(result.found).toBe(false);
    expect(result.reason).toBe("no-headings");
  });

  it("runs the last section to the end of the document", () => {
    const result = getDocumentSection(doc, { index: 3 });
    expect(result.found).toBe(true);
    expect(result.markdown).toBe(lines("## Beta", "", "Beta body."));
  });
});

describe("searchDocument", () => {
  const doc = lines("# Title", "alpha beta alpha", "Beta gamma", "ALPHA again");

  it("finds case-insensitive literal matches by default with 1-based positions", () => {
    const result = searchDocument(doc, { query: "alpha" });
    expect(result.total).toBe(3);
    expect(result.matches[0]).toEqual({
      line: 2,
      column: 1,
      match: "alpha",
      preview: "alpha beta alpha"
    });
    expect(result.matches.map((entry) => entry.line)).toEqual([2, 2, 4]);
    expect(result.matches.map((entry) => entry.match)).toEqual(["alpha", "alpha", "ALPHA"]);
  });

  it("honors caseSensitive", () => {
    const result = searchDocument(doc, { query: "alpha", caseSensitive: true });
    expect(result.total).toBe(2);
    expect(result.matches.every((entry) => entry.match === "alpha")).toBe(true);
  });

  it("supports regular expressions", () => {
    const result = searchDocument(doc, { query: "\\bbeta\\b", isRegex: true });
    expect(result.total).toBe(2);
    expect(result.matches.map((entry) => entry.line)).toEqual([2, 3]);
  });

  it("treats the query as a literal when isRegex is false", () => {
    const result = searchDocument("a.b a.b axb", { query: "a.b" });
    expect(result.total).toBe(2);
  });

  it("caps results at maxResults and reports the accurate total and truncation", () => {
    const result = searchDocument(lines("x x x x x"), { query: "x", maxResults: 2 });
    expect(result.total).toBe(5);
    expect(result.matches).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  it("does not loop forever on zero-width regex matches", () => {
    const result = searchDocument("abc", { query: "a*", isRegex: true });
    expect(result.total).toBeGreaterThan(0);
    expect(result.truncated).toBe(false);
  });

  it("throws on an empty query", () => {
    expect(() => searchDocument(doc, { query: "" })).toThrow(/non-empty/);
  });

  it("throws on an invalid regular expression", () => {
    expect(() => searchDocument(doc, { query: "(", isRegex: true })).toThrow(/Invalid regular/);
  });
});
