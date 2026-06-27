/**
 * Tests the isoflow import/export visitors' pure decision/serialisation logic — the part that does
 * not require a live Lexical editor. The import visitor must intercept *only* editable-isoflow
 * images (so plain images, and drawio images, keep their own handling), and the export visitor must
 * turn an isoflow node back into a standard Markdown `image` so the document degrades everywhere
 * else. The rich-text rendering and the edit round-trip are exercised in the running Electron app.
 */
import { describe, expect, it } from "vitest";
import type { Image } from "mdast";
import { LexicalIsoflowImageVisitor, MdastIsoflowImageVisitor } from "./IsoflowImageNode";
import { buildIsoflowEditableSvg, buildIsoflowImageDataUrl } from "../../lib/isoflowSvg";

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const MODEL = { icons: [], colors: [], items: [{ id: "i1" }], views: [{ id: "v1" }] };
const ISOFLOW_URL = buildIsoflowImageDataUrl(buildIsoflowEditableSvg(PNG, 200, 150, MODEL));

describe("MdastIsoflowImageVisitor (import)", () => {
  it("runs ahead of the stock image visitor", () => {
    expect(MdastIsoflowImageVisitor.priority).toBe(1);
  });

  it("matches only images whose source is an editable isoflow SVG", () => {
    const test = MdastIsoflowImageVisitor.testNode as (node: { type: string; url?: string }) => boolean;
    expect(test({ type: "image", url: ISOFLOW_URL })).toBe(true);
    expect(test({ type: "image", url: "data:image/png;base64,iVBORw0KGgo=" })).toBe(false);
    expect(test({ type: "image", url: "./diagram.png" })).toBe(false);
    expect(test({ type: "paragraph" })).toBe(false);
  });
});

describe("LexicalIsoflowImageVisitor (export)", () => {
  it("serialises an isoflow node back to a standard Markdown image", () => {
    const appended: Image[] = [];
    const lexicalNode = {
      getSrc: () => ISOFLOW_URL,
      getAlt: () => "diagram",
      getTitle: () => undefined
    };
    const actions = {
      appendToParent: (_parent: unknown, node: Image) => {
        appended.push(node);
        return node;
      }
    };

    LexicalIsoflowImageVisitor.visitLexicalNode?.({
      lexicalNode: lexicalNode as never,
      mdastParent: { type: "paragraph", children: [] } as never,
      actions: actions as never
    });

    expect(appended).toEqual([{ type: "image", url: ISOFLOW_URL, alt: "diagram", title: null }]);
  });
});
