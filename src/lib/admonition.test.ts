import { describe, expect, it } from "vitest";
import {
  ADMONITION_LABELS,
  ADMONITION_TYPES,
  createAdmonitionDirectiveNode,
  dedupeBlocksByKey,
  isAdmonitionType
} from "./admonition";
import type { BlockContent } from "mdast";

const paragraph = (text: string): BlockContent => ({
  type: "paragraph",
  children: [{ type: "text", value: text }]
});

describe("isAdmonitionType", () => {
  it("accepts every advertised admonition kind", () => {
    for (const type of ADMONITION_TYPES) {
      expect(isAdmonitionType(type)).toBe(true);
    }
  });

  it("rejects unknown or mis-cased names", () => {
    expect(isAdmonitionType("warning")).toBe(false);
    expect(isAdmonitionType("NOTE")).toBe(false);
    expect(isAdmonitionType("")).toBe(false);
  });

  it("has a label for every kind", () => {
    for (const type of ADMONITION_TYPES) {
      expect(ADMONITION_LABELS[type]).toBeTruthy();
    }
  });
});

describe("createAdmonitionDirectiveNode", () => {
  it("wraps the given block children in a container directive of the chosen kind", () => {
    const children = [paragraph("first"), paragraph("second")];
    expect(createAdmonitionDirectiveNode("tip", children)).toEqual({
      type: "containerDirective",
      name: "tip",
      children
    });
  });

  it("omits attributes so it matches an inserted-then-typed admonition's shape", () => {
    const node = createAdmonitionDirectiveNode("note", []);
    expect(Object.hasOwn(node, "attributes")).toBe(false);
  });

  it("passes the children array through by reference without copying or reordering", () => {
    const children = [paragraph("a"), paragraph("b"), paragraph("c")];
    const node = createAdmonitionDirectiveNode("danger", children);
    expect(node.children).toBe(children);
  });
});

describe("dedupeBlocksByKey", () => {
  const keyed = (key: string) => ({ getKey: () => key });

  it("collapses the repeated blocks a selection reports into one entry each", () => {
    // A selection spanning two paragraphs reports each block once per touched child node.
    const b1 = keyed("1");
    const b2 = keyed("2");
    const result = dedupeBlocksByKey([b1, b1, b2, b2, b2]);
    expect(result).toEqual([b1, b2]);
  });

  it("preserves first-seen (document) order across interleaved repeats", () => {
    const a = keyed("a");
    const b = keyed("b");
    const c = keyed("c");
    expect(dedupeBlocksByKey([a, b, a, c, b, c])).toEqual([a, b, c]);
  });

  it("returns already-unique input unchanged", () => {
    const nodes = [keyed("x"), keyed("y"), keyed("z")];
    expect(dedupeBlocksByKey(nodes)).toEqual(nodes);
  });

  it("returns an empty array for empty input", () => {
    expect(dedupeBlocksByKey([])).toEqual([]);
  });
});
