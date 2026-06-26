/**
 * Tests the drawio import/export visitors' pure decision/serialisation logic — the part that does
 * not require a live Lexical editor. The import visitor must intercept *only* editable-drawio
 * images (so plain images keep MDXEditor's default handling), and the export visitor must turn a
 * drawio node back into a standard Markdown `image` so the document degrades everywhere else. The
 * rich-text rendering and the edit round-trip are exercised in the app (preview).
 */
import { describe, expect, it } from "vitest";
import type { Image } from "mdast";
import { LexicalDrawioImageVisitor, MdastDrawioImageVisitor } from "./DrawioImageNode";
import { buildDrawioImageDataUrl, embedDrawioXml } from "../../lib/drawioSvg";

const DRAWIO_URL = buildDrawioImageDataUrl(
  embedDrawioXml('<svg xmlns="http://www.w3.org/2000/svg"></svg>', "<mxfile>diagram</mxfile>")
);

describe("MdastDrawioImageVisitor (import)", () => {
  it("runs ahead of the stock image visitor", () => {
    expect(MdastDrawioImageVisitor.priority).toBe(1);
  });

  it("matches only images whose source is an editable drawio SVG", () => {
    const test = MdastDrawioImageVisitor.testNode as (node: { type: string; url?: string }) => boolean;
    expect(test({ type: "image", url: DRAWIO_URL })).toBe(true);
    expect(test({ type: "image", url: "data:image/png;base64,iVBORw0KGgo=" })).toBe(false);
    expect(test({ type: "image", url: "./diagram.png" })).toBe(false);
    expect(test({ type: "paragraph" })).toBe(false);
  });
});

describe("LexicalDrawioImageVisitor (export)", () => {
  it("serialises a drawio node back to a standard Markdown image", () => {
    const appended: Image[] = [];
    const lexicalNode = {
      getSrc: () => DRAWIO_URL,
      getAlt: () => "diagram",
      getTitle: () => undefined
    };
    const actions = {
      appendToParent: (_parent: unknown, node: Image) => {
        appended.push(node);
        return node;
      }
    };

    LexicalDrawioImageVisitor.visitLexicalNode?.({
      lexicalNode: lexicalNode as never,
      mdastParent: { type: "paragraph", children: [] } as never,
      actions: actions as never
    });

    expect(appended).toEqual([{ type: "image", url: DRAWIO_URL, alt: "diagram", title: null }]);
  });
});
