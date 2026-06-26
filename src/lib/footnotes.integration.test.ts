/**
 * End-to-end round-trip tests driving the real micromark/mdast parser and
 * serializer with the footnote extensions Nexus wires into MDXEditor (see
 * `components/editor/footnotesPlugin.ts`). This guards the Markdown ⇄ MDAST surface
 * — the rich-text Lexical nodes are exercised in the app — proving that `[^id]`
 * references and `[^id]: …` definitions survive a parse + serialise for the three
 * shapes the feature targets: a numbered footnote whose body carries Markdown and a
 * link, an alphanumeric label, and a footnote inside a list item.
 */
import { describe, expect, it } from "vitest";
import { fromMarkdown } from "mdast-util-from-markdown";
import { toMarkdown } from "mdast-util-to-markdown";
import type { Nodes, Root } from "mdast";
import {
  footnoteFromMarkdownExtension,
  footnoteSyntaxExtension,
  footnoteToMarkdownExtension,
  isFootnoteDefinition,
  isFootnoteReference
} from "./footnotes";

const parse = (md: string): Root =>
  fromMarkdown(md, {
    extensions: [footnoteSyntaxExtension()],
    mdastExtensions: [footnoteFromMarkdownExtension()]
  });

const serialize = (tree: Root): string =>
  toMarkdown(tree, { extensions: [footnoteToMarkdownExtension()] });

const roundTrip = (md: string): string => serialize(parse(md));

/** Depth-first flatten of every node in the tree, for type assertions. */
function flatten(node: Nodes): Nodes[] {
  const children = "children" in node ? (node.children as Nodes[]) : [];
  return [node, ...children.flatMap(flatten)];
}

const NUMBERED = "A footnote adds detail.[^1]\n\n[^1]: A numbered footnote with **bold** and a [link](https://example.com).\n";
const ALPHANUMERIC = "Custom identifiers work.[^longnote]\n\n[^longnote]: An alphanumeric label, not a number.\n";
const IN_LIST = "- A list item can carry a footnote.[^2]\n\n[^2]: Footnotes work inside list items.\n";

describe("Footnote round-trip through the real parser/serializer", () => {
  it("parses a reference into a footnoteReference and its definition into a footnoteDefinition", () => {
    const nodes = flatten(parse(NUMBERED));
    expect(nodes.some(isFootnoteReference)).toBe(true);
    expect(nodes.some(isFootnoteDefinition)).toBe(true);
  });

  it("keeps the syntax extension load-bearing — without it `[^1]` is literal text", () => {
    const plain = fromMarkdown("A footnote adds detail.[^1]\n");
    expect(flatten(plain).some(isFootnoteReference)).toBe(false);
  });

  it("round-trips a numbered footnote, preserving Markdown and a link in the body", () => {
    const out = roundTrip(NUMBERED);
    expect(out).toContain("detail.[^1]");
    expect(out).toContain("[^1]: A numbered footnote with **bold** and a [link](https://example.com).");
  });

  it("round-trips an alphanumeric label unchanged", () => {
    const out = roundTrip(ALPHANUMERIC);
    expect(out).toContain("[^longnote]");
    expect(out).toContain("[^longnote]: An alphanumeric label, not a number.");
  });

  it("round-trips a footnote inside a list item, keeping the reference in the bullet", () => {
    const out = roundTrip(IN_LIST);
    expect(out).toContain("* A list item can carry a footnote.[^2]");
    expect(out).toContain("[^2]: Footnotes work inside list items.");
  });

  it("is idempotent across a second round-trip for every shape", () => {
    for (const md of [NUMBERED, ALPHANUMERIC, IN_LIST]) {
      const once = roundTrip(md);
      expect(roundTrip(once)).toBe(once);
    }
  });
});
