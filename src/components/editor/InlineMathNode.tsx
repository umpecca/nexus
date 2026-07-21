import { DecoratorNode } from "lexical";
import type {
  ElementNode,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread
} from "lexical";
import type { InlineCode } from "mdast";
import { useEffect, useState, type ReactNode } from "react";
import type { LexicalExportVisitor, MdastImportVisitor } from "@mdxeditor/editor";
import { renderMath, type KatexRenderResult } from "../../lib/katexRenderer";

export const INLINE_MATH_PREFIX = "math:";

type SerializedInlineMathNode = Spread<{ formula: string }, SerializedLexicalNode>;

export class InlineMathNode extends DecoratorNode<ReactNode> {
  /** @internal */ __formula: string;

  static getType(): string {
    return "inlineMath";
  }

  static clone(node: InlineMathNode): InlineMathNode {
    return new InlineMathNode(node.__formula, node.__key);
  }

  static importJSON(serializedNode: SerializedInlineMathNode): InlineMathNode {
    return $createInlineMathNode(serializedNode.formula);
  }

  constructor(formula: string, key?: NodeKey) {
    super(key);
    this.__formula = formula;
  }

  getFormula(): string {
    return this.__formula;
  }

  exportJSON(): SerializedInlineMathNode {
    return { formula: this.__formula, type: "inlineMath", version: 1 };
  }

  createDOM(): HTMLElement {
    return document.createElement("span");
  }

  updateDOM(): false {
    return false;
  }

  isInline(): true {
    return true;
  }

  isKeyboardSelectable(): boolean {
    return true;
  }

  decorate(): ReactNode {
    return <InlineMath formula={this.__formula} />;
  }
}

export function $createInlineMathNode(formula: string): InlineMathNode {
  return new InlineMathNode(formula);
}

export function $isInlineMathNode(
  node: LexicalNode | null | undefined
): node is InlineMathNode {
  return node instanceof InlineMathNode;
}

function InlineMath({ formula }: { formula: string }) {
  const [result, setResult] = useState<KatexRenderResult>({ status: "success", html: "" });

  useEffect(() => {
    let current = true;
    void renderMath(formula, { displayMode: false }).then((nextResult) => {
      if (current) setResult(nextResult);
    });
    return () => {
      current = false;
    };
  }, [formula]);

  if (result.status === "error") {
    return <code className="nexus-inline-math-error" title={result.error}>{formula}</code>;
  }

  return (
    <span
      className="nexus-inline-math"
      data-inline-math={formula}
      title={`Inline math: ${formula}`}
      dangerouslySetInnerHTML={{ __html: result.html }}
    />
  );
}

export const MdastInlineMathVisitor: MdastImportVisitor<InlineCode> = {
  priority: 1,
  testNode: (node) =>
    node.type === "inlineCode" && node.value.trimStart().startsWith(INLINE_MATH_PREFIX),
  visitNode({ mdastNode, lexicalParent }) {
    const formula = mdastNode.value.trimStart().slice(INLINE_MATH_PREFIX.length).trim();
    (lexicalParent as ElementNode).append($createInlineMathNode(formula));
  }
};

export const LexicalInlineMathVisitor: LexicalExportVisitor<InlineMathNode, InlineCode> = {
  testLexicalNode: $isInlineMathNode,
  visitLexicalNode({ lexicalNode, mdastParent, actions }) {
    actions.appendToParent(mdastParent, {
      type: "inlineCode",
      value: `${INLINE_MATH_PREFIX}${lexicalNode.getFormula()}`
    });
  }
};
