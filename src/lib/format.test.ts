import { describe, expect, it } from "vitest";
import { cleanupMarkdownFormatting } from "./format";

const lines = (...parts: string[]) => parts.join("\n");

describe("cleanupMarkdownFormatting — list markers", () => {
  it("normalizes unordered markers to '- ' and collapses marker spacing", () => {
    const input = lines("* one", "+ two", "-    three");
    expect(cleanupMarkdownFormatting(input)).toBe(lines("- one", "- two", "- three"));
  });

  it("preserves nesting indentation while normalizing the marker", () => {
    const input = lines("- top", "  * nested", "    + deeper");
    expect(cleanupMarkdownFormatting(input)).toBe(lines("- top", "  - nested", "    - deeper"));
  });

  it("collapses ordered-marker spacing without renumbering", () => {
    const input = lines("1.   first", "3)  third");
    expect(cleanupMarkdownFormatting(input)).toBe(lines("1. first", "3) third"));
  });

  it("does not treat emphasis at line start as a list", () => {
    expect(cleanupMarkdownFormatting("*not a list*")).toBe("*not a list*");
  });
});

describe("cleanupMarkdownFormatting — headings", () => {
  it("collapses the space after the hashes and strips a trailing closer", () => {
    expect(cleanupMarkdownFormatting("##   Section")).toBe("## Section");
    expect(cleanupMarkdownFormatting("##   Section   ##")).toBe("## Section");
  });

  it("leaves a hash run with no following space as a paragraph (not a heading)", () => {
    // CommonMark requires a space after the hashes, so `##Section` is text, not a heading;
    // turning it into one would change the document's meaning.
    expect(cleanupMarkdownFormatting("##Section")).toBe("##Section");
  });

  it("drops leading indentation from an ATX heading", () => {
    expect(cleanupMarkdownFormatting("   ## Indented")).toBe("## Indented");
  });

  it("inserts a single blank line above and below a heading", () => {
    const input = lines("text before", "## Section", "text after");
    expect(cleanupMarkdownFormatting(input)).toBe(
      lines("text before", "", "## Section", "", "text after")
    );
  });

  it("does not stack blank lines that already surround a heading", () => {
    const input = lines("before", "", "## Section", "", "after");
    expect(cleanupMarkdownFormatting(input)).toBe(input);
  });

  it("separates two adjacent headings with one blank line", () => {
    const input = lines("# Title", "## Section");
    expect(cleanupMarkdownFormatting(input)).toBe(lines("# Title", "", "## Section"));
  });

  it("does not add a leading blank line before a heading at the top", () => {
    expect(cleanupMarkdownFormatting("# Title\nbody")).toBe(lines("# Title", "", "body"));
  });
});

describe("cleanupMarkdownFormatting — tables", () => {
  it("pads columns and rebuilds the delimiter row to a uniform width", () => {
    const input = lines("| Name | Age |", "| --- | --- |", "| Alice | 30 |", "| Bob | 7 |");
    expect(cleanupMarkdownFormatting(input)).toBe(
      lines("| Name  | Age |", "| ----- | --- |", "| Alice | 30  |", "| Bob   | 7   |")
    );
  });

  it("respects per-column alignment markers", () => {
    const input = lines("| L | C | R |", "|:--|:-:|--:|", "| a | b | c |");
    expect(cleanupMarkdownFormatting(input)).toBe(
      lines("| L   |  C  |   R |", "| :-- | :-: | --: |", "| a   |  b  |   c |")
    );
  });

  it("normalizes ragged tables authored without outer pipes", () => {
    const input = lines("a | b", "--- | ---", "longer | x");
    expect(cleanupMarkdownFormatting(input)).toBe(
      lines("| a      | b   |", "| ------ | --- |", "| longer | x   |")
    );
  });

  it("does not split on escaped pipes inside a cell", () => {
    const input = lines("| col |", "| --- |", "| a \\| b |");
    expect(cleanupMarkdownFormatting(input)).toBe(
      lines("| col    |", "| ------ |", "| a \\| b |")
    );
  });

  it("leaves a setext-style underline alone (not mistaken for a table)", () => {
    const input = lines("Title", "---", "", "body");
    expect(cleanupMarkdownFormatting(input)).toBe(input);
  });
});

describe("cleanupMarkdownFormatting — thematic breaks and blank lines", () => {
  it("normalizes thematic breaks to '---'", () => {
    expect(cleanupMarkdownFormatting(lines("a", "", "***", "", "b"))).toBe(
      lines("a", "", "---", "", "b")
    );
    expect(cleanupMarkdownFormatting(lines("a", "", "* * *", "", "b"))).toBe(
      lines("a", "", "---", "", "b")
    );
  });

  it("collapses three or more blank lines to one", () => {
    expect(cleanupMarkdownFormatting(lines("a", "", "", "", "b"))).toBe(lines("a", "", "b"));
  });

  it("trims leading and trailing blank lines", () => {
    expect(cleanupMarkdownFormatting(lines("", "", "a", "b", "", ""))).toBe(lines("a", "b"));
  });

  it("trims a single trailing space but keeps (and normalizes) a hard break", () => {
    expect(cleanupMarkdownFormatting("one trailing space ")).toBe("one trailing space");
    expect(cleanupMarkdownFormatting("hard break  ")).toBe("hard break  ");
    // Two or more trailing spaces is a hard line break; normalize the run to exactly two rather
    // than dropping the rendered break.
    expect(cleanupMarkdownFormatting("padded break    ")).toBe("padded break  ");
  });

  it("normalizes CRLF line endings to LF", () => {
    expect(cleanupMarkdownFormatting("a\r\nb")).toBe("a\nb");
  });
});

describe("cleanupMarkdownFormatting — fenced code and frontmatter", () => {
  it("does not reformat content inside fenced code blocks", () => {
    const input = lines("```", "* keep   this", "##notaheading", "| a | b |", "```");
    expect(cleanupMarkdownFormatting(input)).toBe(input);
  });

  it("only closes a fence on a matching, equal-or-longer fence", () => {
    const input = lines("````", "```", "* still code", "````");
    expect(cleanupMarkdownFormatting(input)).toBe(input);
  });

  it("passes a leading, closed YAML frontmatter block through verbatim", () => {
    const input = lines("---", "title:   Keep", "---", "", "# Heading");
    expect(cleanupMarkdownFormatting(input)).toBe(input);
  });

  it("inserts a single blank line between frontmatter and the body", () => {
    const input = lines("---", "title: x", "---", "# Heading");
    expect(cleanupMarkdownFormatting(input)).toBe(
      lines("---", "title: x", "---", "", "# Heading")
    );
  });
});

describe("cleanupMarkdownFormatting — general", () => {
  it("returns an empty string for empty input", () => {
    expect(cleanupMarkdownFormatting("")).toBe("");
  });

  it("is idempotent over a kitchen-sink document", () => {
    const input = lines(
      "#Title",
      "intro paragraph",
      "## Mixed",
      "* a",
      "+ b",
      "-   c",
      "",
      "",
      "",
      "| x | y |",
      "|---|--:|",
      "| 1 | 22 |",
      "",
      "***",
      "```",
      "* not normalized",
      "```",
      "done   "
    );
    const once = cleanupMarkdownFormatting(input);
    expect(cleanupMarkdownFormatting(once)).toBe(once);
  });
});
