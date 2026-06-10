import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// The logic under test is the Electron main-process CommonJS edits module; load it through a real
// `require` (the renderer never bundles it), mirroring src/lib/mcpDocumentTools.test.ts.
const require = createRequire(import.meta.url);
const documentEdits = require("../../electron/mcpDocumentEdits.cjs") as {
  applyEdits: (
    markdown: string,
    edits: Array<{ find?: string; replace?: string; all?: boolean; isRegex?: boolean }>
  ) => { ok: boolean; markdown?: string; reason?: string; editIndex?: number; matchCount?: number };
  replaceSection: (
    markdown: string,
    selector: { index?: number; slug?: string; heading?: string },
    newMarkdown: unknown
  ) => { ok: boolean; markdown?: string; reason?: string };
  setFrontmatter: (
    markdown: string,
    changes: { set?: Record<string, unknown>; remove?: string[] }
  ) => { ok: boolean; markdown?: string; reason?: string; key?: string };
};

const { applyEdits, replaceSection, setFrontmatter } = documentEdits;
const lines = (...parts: string[]) => parts.join("\n");

describe("applyEdits", () => {
  it("applies a single literal replacement", () => {
    const result = applyEdits("Hello world", [{ find: "world", replace: "there" }]);
    expect(result).toEqual({ ok: true, markdown: "Hello there", editsApplied: 1 });
  });

  it("applies edits in order, each seeing the previous result", () => {
    const result = applyEdits("a", [
      { find: "a", replace: "b" },
      { find: "b", replace: "c" }
    ]);
    expect(result.markdown).toBe("c");
  });

  it("fails the whole batch when an anchor is not found", () => {
    const result = applyEdits("Hello world", [
      { find: "world", replace: "there" },
      { find: "missing", replace: "x" }
    ]);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("anchor-not-found");
    expect(result.editIndex).toBe(1);
    expect(result.markdown).toBeUndefined();
  });

  it("rejects an ambiguous literal anchor unless all is set", () => {
    const ambiguous = applyEdits("x x x", [{ find: "x", replace: "y" }]);
    expect(ambiguous.ok).toBe(false);
    expect(ambiguous.reason).toBe("ambiguous");
    expect(ambiguous.matchCount).toBe(3);

    const all = applyEdits("x x x", [{ find: "x", replace: "y", all: true }]);
    expect(all.markdown).toBe("y y y");
  });

  it("treats find as a literal (no regex) by default", () => {
    const result = applyEdits("a.b", [{ find: "a.b", replace: "Z" }]);
    expect(result.markdown).toBe("Z");
  });

  it("supports regex edits with capture-group replacements", () => {
    const result = applyEdits("2026-06-09", [
      { find: "(\\d{4})-(\\d{2})-(\\d{2})", replace: "$3/$2/$1", isRegex: true }
    ]);
    expect(result.markdown).toBe("09/06/2026");
  });

  it("reports an invalid regex", () => {
    const result = applyEdits("text", [{ find: "(", replace: "x", isRegex: true }]);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("invalid-regex");
  });

  it("supports deletion via an empty replacement", () => {
    const result = applyEdits("remove me please", [{ find: "remove me ", replace: "" }]);
    expect(result.markdown).toBe("please");
  });

  it("rejects an empty edits array", () => {
    expect(applyEdits("x", []).reason).toBe("invalid-edits");
  });

  it("rejects an edit without a find anchor", () => {
    expect(applyEdits("x", [{ replace: "y" }]).reason).toBe("invalid-edit");
  });
});

describe("replaceSection", () => {
  const doc = lines(
    "# Title",
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
    "Beta body."
  );

  it("replaces a whole section including its subsections, by slug", () => {
    const result = replaceSection(doc, { slug: "alpha" }, lines("## Alpha", "", "Rewritten."));
    expect(result.ok).toBe(true);
    expect(result.markdown).toBe(
      lines("# Title", "", "## Alpha", "", "Rewritten.", "## Beta", "", "Beta body.")
    );
  });

  it("replaces a section by heading ordinal index", () => {
    const result = replaceSection(doc, { index: 3 }, lines("## Beta", "", "New beta."));
    expect(result.ok).toBe(true);
    expect(result.markdown?.endsWith(lines("## Beta", "", "New beta."))).toBe(true);
  });

  it("deletes a section when the replacement is empty", () => {
    const result = replaceSection(doc, { slug: "beta" }, "");
    expect(result.ok).toBe(true);
    expect(result.markdown).not.toContain("Beta body.");
  });

  it("reports section-not-found with the available headings", () => {
    const result = replaceSection(doc, { slug: "missing" }, "x");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("section-not-found");
  });

  it("reports no-headings for a document without headings", () => {
    const result = replaceSection("Just prose.", { index: 0 }, "x");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("no-headings");
  });

  it("rejects a non-string replacement", () => {
    const result = replaceSection(doc, { slug: "beta" }, null);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("invalid-markdown");
  });
});

describe("setFrontmatter", () => {
  it("creates a frontmatter block when none exists", () => {
    const result = setFrontmatter("# Title\n\nBody.", { set: { title: "Hi" } });
    expect(result.ok).toBe(true);
    expect(result.markdown).toBe(lines("---", "title: Hi", "---", "# Title", "", "Body."));
  });

  it("merges into an existing block, preserving key order and adding new keys", () => {
    const source = lines("---", "title: Old", "draft: true", "---", "", "# Body");
    const result = setFrontmatter(source, { set: { title: "New", author: "Vince" } });
    expect(result.markdown).toBe(
      lines("---", "title: New", "draft: true", "author: Vince", "---", "", "# Body")
    );
  });

  it("removes a key", () => {
    const source = lines("---", "title: Keep", "draft: true", "---", "Body");
    const result = setFrontmatter(source, { remove: ["draft"] });
    expect(result.markdown).toBe(lines("---", "title: Keep", "---", "Body"));
  });

  it("drops the block entirely when the last key is removed", () => {
    const source = lines("---", "title: Only", "---", "", "# Body");
    const result = setFrontmatter(source, { remove: ["title"] });
    expect(result.markdown).toBe("# Body");
  });

  it("refuses to touch non-scalar frontmatter", () => {
    const source = lines("---", "tags:", "  - a", "  - b", "---", "Body");
    const result = setFrontmatter(source, { set: { title: "x" } });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("frontmatter-unsupported");
  });

  it("rejects unsupported (non-scalar) set values", () => {
    const result = setFrontmatter("Body", { set: { tags: ["a", "b"] as unknown as string } });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("unsupported-value");
    expect(result.key).toBe("tags");
  });

  it("rejects a call with neither set nor remove", () => {
    expect(setFrontmatter("Body", {}).reason).toBe("no-changes");
  });
});
