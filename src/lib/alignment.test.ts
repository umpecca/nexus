/**
 * Tests for block alignment's pure import/export glue.
 *
 * MDXEditor parses raw `<div align="…">` into an `mdxJsxFlowElement` that nests the wrapped blocks as
 * children, so the import side is tested against trees of that exact shape (built by {@link div}); the
 * export side and a simulated import→export round-trip drive the real `mdast-util-to-markdown`
 * serializer. The full parse→edit→serialize loop through MDXEditor itself is covered by manual preview
 * verification, since the MDX JSX parser is not a direct dependency.
 */
import { describe, expect, it } from "vitest";
import { toMarkdown } from "mdast-util-to-markdown";
import type { Heading, Paragraph, Root, RootContent } from "mdast";
import {
  alignmentToMarkdownExtension,
  isAlignment,
  isPersistedAlignment,
  lexicalFormatToAlign,
  mdastAlign,
  transformTreeDivAlignToData
} from "./alignment";

const serialize = (tree: Root): string =>
  toMarkdown(tree, { extensions: [alignmentToMarkdownExtension] });

const para = (value: string, align?: "center" | "right"): Paragraph => ({
  type: "paragraph",
  ...(align ? { data: { align } } : {}),
  children: [{ type: "text", value }]
});

const heading = (value: string, align?: "center" | "right"): Heading => ({
  type: "heading",
  depth: 2,
  ...(align ? { data: { align } } : {}),
  children: [{ type: "text", value }]
});

/** Build the `mdxJsxFlowElement` node MDXEditor parses `<div align="…">` into. */
const div = (align: string, children: RootContent[]): RootContent =>
  ({
    type: "mdxJsxFlowElement",
    name: "div",
    attributes: [{ type: "mdxJsxAttribute", name: "align", value: align }],
    children
  }) as unknown as RootContent;

const fold = (children: RootContent[]): RootContent[] => {
  const tree: Root = { type: "root", children };
  transformTreeDivAlignToData(tree);
  return tree.children;
};

describe("alignment value guards", () => {
  it("recognises the three toolbar alignments and nothing else", () => {
    expect(isAlignment("left")).toBe(true);
    expect(isAlignment("center")).toBe(true);
    expect(isAlignment("right")).toBe(true);
    expect(isAlignment("justify")).toBe(false);
    expect(isAlignment(undefined)).toBe(false);
  });

  it("treats only center/right as persisted (left is the default)", () => {
    expect(isPersistedAlignment("center")).toBe(true);
    expect(isPersistedAlignment("right")).toBe(true);
    expect(isPersistedAlignment("left")).toBe(false);
  });

  it("maps Lexical element formats to a persisted alignment", () => {
    expect(lexicalFormatToAlign("center")).toBe("center");
    expect(lexicalFormatToAlign("right")).toBe("right");
    expect(lexicalFormatToAlign("left")).toBeUndefined();
    expect(lexicalFormatToAlign("")).toBeUndefined();
    expect(lexicalFormatToAlign("justify")).toBeUndefined();
  });
});

describe("folding <div align> elements onto their blocks", () => {
  it("folds a centered paragraph wrapper onto the paragraph", () => {
    const out = fold([div("center", [para("Hello")])]);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("paragraph");
    expect(mdastAlign(out[0] as Paragraph)).toBe("center");
  });

  it("folds a right-aligned heading wrapper onto the heading", () => {
    const out = fold([div("right", [heading("Title")])]);
    expect(out[0].type).toBe("heading");
    expect(mdastAlign(out[0] as Heading)).toBe("right");
  });

  it("stamps each block when a wrapper holds several", () => {
    const out = fold([div("center", [para("One"), para("Two")])]);
    expect(out).toHaveLength(2);
    expect(mdastAlign(out[0] as Paragraph)).toBe("center");
    expect(mdastAlign(out[1] as Paragraph)).toBe("center");
  });

  it("drops a redundant left wrapper, keeping the content unaligned", () => {
    const out = fold([div("left", [para("Hello")])]);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("paragraph");
    expect(mdastAlign(out[0] as Paragraph)).toBeUndefined();
  });

  it("lets the innermost alignment win when wrappers nest", () => {
    const out = fold([div("center", [div("right", [para("Hi")])])]);
    expect(out).toHaveLength(1);
    expect(mdastAlign(out[0] as Paragraph)).toBe("right");
  });

  it("normalises the align value's case", () => {
    const out = fold([div("CENTER", [para("Hi")])]);
    expect(mdastAlign(out[0] as Paragraph)).toBe("center");
  });

  it("leaves a div wrapping non-alignable content for MDXEditor to handle", () => {
    const list: RootContent = {
      type: "list",
      ordered: false,
      children: [{ type: "listItem", children: [para("item")] }]
    } as unknown as RootContent;
    const out = fold([div("center", [list])]);
    expect(out).toHaveLength(1);
    expect((out[0] as { type: string }).type).toBe("mdxJsxFlowElement");
  });

  it("ignores a div with no align attribute", () => {
    const out = fold([div("", [para("Hi")])]);
    expect((out[0] as { type: string }).type).toBe("mdxJsxFlowElement");
  });

  it("folds an aligned div nested inside ordinary content", () => {
    const blockquote: RootContent = {
      type: "blockquote",
      children: [div("center", [para("Quoted")])]
    } as unknown as RootContent;
    const out = fold([blockquote]);
    expect(out[0].type).toBe("blockquote");
    const inner = (out[0] as unknown as { children: RootContent[] }).children;
    expect(inner[0].type).toBe("paragraph");
    expect(mdastAlign(inner[0] as Paragraph)).toBe("center");
  });

  it("leaves ordinary blocks untouched", () => {
    const out = fold([para("Plain"), heading("Heading")]);
    expect(mdastAlign(out[0] as Paragraph)).toBeUndefined();
    expect(mdastAlign(out[1] as Heading)).toBeUndefined();
  });
});

describe("serialising alignment to <div align> wrappers", () => {
  it("wraps a centered paragraph with blank lines around the body", () => {
    expect(serialize({ type: "root", children: [para("Hello", "center")] })).toBe(
      '<div align="center">\n\nHello\n\n</div>\n'
    );
  });

  it("wraps a right-aligned heading", () => {
    expect(serialize({ type: "root", children: [heading("Title", "right")] })).toBe(
      '<div align="right">\n\n## Title\n\n</div>\n'
    );
  });

  it("leaves unaligned blocks completely untouched", () => {
    const tree: Root = { type: "root", children: [para("Plain"), heading("Heading")] };
    expect(serialize(tree)).toBe("Plain\n\n## Heading\n");
  });
});

describe("simulated import -> export round-trips", () => {
  const roundTrip = (children: RootContent[]): string =>
    serialize({ type: "root", children: fold(children) });

  it("turns a centered div into the canonical blank-line wrapper", () => {
    expect(roundTrip([div("center", [para("Hello")])])).toBe('<div align="center">\n\nHello\n\n</div>\n');
  });

  it("expands a multi-block wrapper into one wrapper per block", () => {
    expect(roundTrip([div("center", [para("One"), para("Two")])])).toBe(
      '<div align="center">\n\nOne\n\n</div>\n\n<div align="center">\n\nTwo\n\n</div>\n'
    );
  });

  it("strips a redundant left wrapper down to plain content", () => {
    expect(roundTrip([div("left", [para("Hello")])])).toBe("Hello\n");
  });

  it("keeps an aligned block alongside unaligned content", () => {
    expect(roundTrip([para("Intro."), div("center", [para("Centered.")]), para("Outro.")])).toBe(
      'Intro.\n\n<div align="center">\n\nCentered.\n\n</div>\n\nOutro.\n'
    );
  });
});
