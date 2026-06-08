import { describe, expect, it } from "vitest";
import {
  buildTableOfContents,
  createHeadingSlugger,
  insertTableOfContentsIntoBuffer,
  slugifyHeadingText
} from "./toc";
import { extractOutline } from "./outline";

const lines = (...parts: string[]) => parts.join("\n");

describe("slugifyHeadingText", () => {
  it("lowercases and hyphenates, dropping punctuation", () => {
    expect(slugifyHeadingText("Hello, World!")).toBe("hello-world");
  });

  it("collapses and trims surrounding whitespace", () => {
    expect(slugifyHeadingText("  Spaced   Out  ")).toBe("spaced-out");
  });

  it("keeps Unicode letters", () => {
    expect(slugifyHeadingText("Café résumé")).toBe("café-résumé");
  });

  it("keeps underscores and existing hyphens", () => {
    expect(slugifyHeadingText("snake_case-name")).toBe("snake_case-name");
  });

  it("decodes entities before slugging", () => {
    expect(slugifyHeadingText("Tom &amp; Jerry")).toBe("tom-jerry");
    expect(slugifyHeadingText("A&#x20;B")).toBe("a-b");
  });

  it("returns an empty string when nothing slug-worthy remains", () => {
    expect(slugifyHeadingText("***")).toBe("");
  });
});

describe("createHeadingSlugger", () => {
  it("disambiguates repeated slugs with numeric suffixes", () => {
    const slug = createHeadingSlugger();
    expect(slug("Intro")).toBe("intro");
    expect(slug("Intro")).toBe("intro-1");
    expect(slug("Intro")).toBe("intro-2");
    expect(slug("Other")).toBe("other");
  });

  it("falls back to 'section' for empty slugs and dedupes the fallback", () => {
    const slug = createHeadingSlugger();
    expect(slug("***")).toBe("section");
    expect(slug("###")).toBe("section-1");
  });
});

describe("buildTableOfContents", () => {
  it("skips the H1 title and nests H2–H6 by depth", () => {
    const markdown = lines("# Title", "", "## Section A", "", "### Detail", "", "## Section B");

    expect(buildTableOfContents(extractOutline(markdown))).toBe(
      lines(
        "## Table of Contents",
        "",
        "- [Section A](#section-a)",
        "  - [Detail](#detail)",
        "- [Section B](#section-b)"
      )
    );
  });

  it("returns an empty string when there are no H2+ headings", () => {
    expect(buildTableOfContents(extractOutline("# Only a title\n\nbody"))).toBe("");
    expect(buildTableOfContents(extractOutline("plain text"))).toBe("");
  });

  it("normalizes indentation to the shallowest included level when no H1 is present", () => {
    const markdown = lines("## A", "", "#### Deep");

    expect(buildTableOfContents(extractOutline(markdown))).toBe(
      lines("## Table of Contents", "", "- [A](#a)", "    - [Deep](#deep)")
    );
  });

  it("disambiguates duplicate heading links", () => {
    const markdown = lines("## Notes", "", "## Notes");

    expect(buildTableOfContents(extractOutline(markdown))).toBe(
      lines("## Table of Contents", "", "- [Notes](#notes)", "- [Notes](#notes-1)")
    );
  });

  it("counts the skipped H1 in dedupe so a matching H2 slug shifts", () => {
    const markdown = lines("# Intro", "", "## Intro");

    expect(buildTableOfContents(extractOutline(markdown))).toContain("- [Intro](#intro-1)");
  });

  it("escapes link-breaking characters in the label but not the slug", () => {
    expect(buildTableOfContents(extractOutline("## Foo [bar]"))).toContain(
      "- [Foo \\[bar\\]](#foo-bar)"
    );
  });
});

describe("insertTableOfContentsIntoBuffer", () => {
  it("leaves a document without H2+ headings untouched", () => {
    const markdown = lines("# Title", "", "plain body");
    expect(insertTableOfContentsIntoBuffer(markdown)).toBe(markdown);
  });

  it("inserts the TOC just after a leading H1 title", () => {
    const markdown = lines("# Title", "", "## A", "", "## B");

    expect(insertTableOfContentsIntoBuffer(markdown)).toBe(
      lines(
        "# Title",
        "",
        "## Table of Contents",
        "",
        "- [A](#a)",
        "- [B](#b)",
        "",
        "## A",
        "",
        "## B"
      )
    );
  });

  it("inserts at the very top when there is no H1 title", () => {
    const markdown = lines("## A", "", "Body");

    expect(insertTableOfContentsIntoBuffer(markdown)).toBe(
      lines("## Table of Contents", "", "- [A](#a)", "", "## A", "", "Body")
    );
  });

  it("inserts below a YAML frontmatter block and H1", () => {
    const markdown = lines("---", "title: x", "---", "# Title", "", "## A");

    expect(insertTableOfContentsIntoBuffer(markdown)).toBe(
      lines("---", "title: x", "---", "# Title", "", "## Table of Contents", "", "- [A](#a)", "", "## A")
    );
  });

  it("replaces an existing TOC instead of stacking (idempotent)", () => {
    const markdown = lines("# Title", "", "## A", "", "## B");
    const once = insertTableOfContentsIntoBuffer(markdown);

    // Re-running must not list the inserted "Table of Contents" heading nor duplicate the block.
    expect(once).not.toContain("[Table of Contents]");
    expect(insertTableOfContentsIntoBuffer(once)).toBe(once);
  });

  it("replaces an existing TOC that uses '*' markers (MDXEditor round-trip)", () => {
    // MDXEditor re-serializes the inserted "- " bullets as "* "; a refresh must still detect and
    // replace that list rather than orphaning it and stacking a second TOC.
    const roundTripped = lines(
      "# Title",
      "",
      "## Table of Contents",
      "",
      "* [A](#a)",
      "* [B](#b)",
      "",
      "## A",
      "",
      "## B"
    );

    const result = insertTableOfContentsIntoBuffer(roundTripped);
    expect(result.match(/## Table of Contents/g)).toHaveLength(1);
    expect(result.match(/\(#a\)/g)).toHaveLength(1);
    expect(result.match(/\(#b\)/g)).toHaveLength(1);
  });

  it("refreshes the TOC after headings change", () => {
    const first = insertTableOfContentsIntoBuffer(lines("# Title", "", "## A"));
    const edited = first.replace("## A", "## A\n\n## C");
    const refreshed = insertTableOfContentsIntoBuffer(edited);

    expect(refreshed).toContain("- [A](#a)");
    expect(refreshed).toContain("- [C](#c)");
    // Only one TOC heading remains.
    expect(refreshed.match(/## Table of Contents/g)).toHaveLength(1);
  });
});
