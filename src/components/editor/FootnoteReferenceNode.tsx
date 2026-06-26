import { DecoratorNode } from "lexical";
import type { ElementNode, LexicalNode, NodeKey, SerializedLexicalNode, Spread } from "lexical";
import type { ReactNode } from "react";
import type { FootnoteReference } from "mdast";
import type { LexicalExportVisitor, MdastImportVisitor } from "@mdxeditor/editor";
import { footnoteLabel } from "../../lib/footnotes";

/**
 * Rich-text representation of an inline footnote reference (`[^1]`).
 *
 * Like MDXEditor's stock `DirectiveNode`, this is a Lexical {@link DecoratorNode}
 * that simply carries its MDAST node (`__mdastNode`) and renders a superscript
 * marker for it. It is a *leaf* — a footnote reference has no children — so unlike
 * the block {@link FootnoteDefinitionNode} it needs no nested editor; the identifier
 * is fixed chrome and edits to the footnote happen in its definition block. The
 * carried MDAST node round-trips untouched through {@link LexicalFootnoteReferenceVisitor},
 * so `mdast-util-gfm-footnote` serialises it straight back to `[^id]`.
 */
type SerializedFootnoteReferenceNode = Spread<
  { mdastNode: FootnoteReference },
  SerializedLexicalNode
>;

export class FootnoteReferenceNode extends DecoratorNode<ReactNode> {
  /** @internal */
  __mdastNode: FootnoteReference;

  /** @internal */
  static getType(): string {
    return "footnoteReference";
  }

  /** @internal */
  static clone(node: FootnoteReferenceNode): FootnoteReferenceNode {
    return new FootnoteReferenceNode(structuredClone(node.__mdastNode), node.__key);
  }

  /** @internal */
  static importJSON(serializedNode: SerializedFootnoteReferenceNode): FootnoteReferenceNode {
    return $createFootnoteReferenceNode(serializedNode.mdastNode);
  }

  constructor(mdastNode: FootnoteReference, key?: NodeKey) {
    super(key);
    this.__mdastNode = mdastNode;
  }

  /** Returns the MDAST node this reference renders. */
  getMdastNode(): FootnoteReference {
    return this.__mdastNode;
  }

  /** Replaces the carried MDAST node — used when a footnote is renamed. */
  setMdastNode(mdastNode: FootnoteReference): void {
    this.getWritable().__mdastNode = mdastNode;
  }

  /** @internal */
  exportJSON(): SerializedFootnoteReferenceNode {
    return { mdastNode: structuredClone(this.__mdastNode), type: "footnoteReference", version: 1 };
  }

  /** @internal */
  createDOM(): HTMLElement {
    return document.createElement("span");
  }

  /** @internal */
  updateDOM(): false {
    return false;
  }

  /** @internal */
  isInline(): true {
    return true;
  }

  /** @internal */
  isKeyboardSelectable(): boolean {
    return true;
  }

  /** @internal */
  decorate(): ReactNode {
    return (
      <sup className="nexus-footnote-ref" data-footnote-id={this.__mdastNode.identifier}>
        {footnoteLabel(this.__mdastNode)}
      </sup>
    );
  }
}

export function $createFootnoteReferenceNode(mdastNode: FootnoteReference): FootnoteReferenceNode {
  return new FootnoteReferenceNode(mdastNode);
}

export function $isFootnoteReferenceNode(node: LexicalNode | null | undefined): node is FootnoteReferenceNode {
  return node instanceof FootnoteReferenceNode;
}

/** Import visitor: wraps an MDAST `footnoteReference` in a {@link FootnoteReferenceNode}. */
export const MdastFootnoteReferenceVisitor: MdastImportVisitor<FootnoteReference> = {
  testNode: "footnoteReference",
  visitNode({ mdastNode, lexicalParent }) {
    (lexicalParent as ElementNode).append($createFootnoteReferenceNode(mdastNode));
  }
};

/** Export visitor: hands the carried MDAST node back so the footnote serialises as `[^id]`. */
export const LexicalFootnoteReferenceVisitor: LexicalExportVisitor<FootnoteReferenceNode, FootnoteReference> = {
  testLexicalNode: $isFootnoteReferenceNode,
  visitLexicalNode({ lexicalNode, mdastParent, actions }) {
    actions.appendToParent(mdastParent, lexicalNode.getMdastNode());
  }
};
