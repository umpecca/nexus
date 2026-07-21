import { describe, expect, it } from "vitest";
import type { InlineCode } from "mdast";
import {
  INLINE_MATH_PREFIX,
  LexicalInlineMathVisitor,
  MdastInlineMathVisitor
} from "./InlineMathNode";

describe("inline math visitors", () => {
  it("intercepts only math-prefixed inline code ahead of the stock code visitor", () => {
    const test = MdastInlineMathVisitor.testNode as (node: InlineCode) => boolean;
    expect(MdastInlineMathVisitor.priority).toBe(1);
    expect(test({ type: "inlineCode", value: `${INLINE_MATH_PREFIX}(x,y)` })).toBe(true);
    expect(test({ type: "inlineCode", value: "const x = 1" })).toBe(false);
  });

  it("serializes inline math back to a portable inline code span", () => {
    const appended: InlineCode[] = [];
    LexicalInlineMathVisitor.visitLexicalNode?.({
      lexicalNode: { getFormula: () => "\\frac{1}{2}" } as never,
      mdastParent: { type: "paragraph", children: [] } as never,
      actions: {
        appendToParent: (_parent: unknown, node: InlineCode) => {
          appended.push(node);
          return node;
        }
      } as never
    });
    expect(appended).toEqual([{ type: "inlineCode", value: "math:\\frac{1}{2}" }]);
  });
});
