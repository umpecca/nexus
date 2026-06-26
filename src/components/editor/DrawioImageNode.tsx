import { $getNodeByKey, DecoratorNode } from "lexical";
import type {
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread
} from "lexical";
import { useState } from "react";
import type { ReactNode } from "react";
import type { Image } from "mdast";
import type { LexicalExportVisitor, MdastImportVisitor } from "@mdxeditor/editor";
import { extractDrawioXml, isDrawioImageUrl } from "../../lib/drawioSvg";

/**
 * Rich-text representation of an editable drawio diagram.
 *
 * A diagram is stored in the document as an ordinary Markdown image whose `src` is an *editable*
 * SVG data URL — drawio's "Editable SVG" export, which carries the diagram's source XML inside the
 * SVG (see `lib/drawioSvg.ts`). On import we upgrade those images to this {@link DecoratorNode} so
 * the rendered picture gains an inline "Edit diagram" affordance; on export we serialise straight
 * back to a plain Markdown `image`, so the document stays standard Markdown and any other tool just
 * shows the SVG. Editing reopens the embedded XML in the bundled drawio editor (via the
 * `editDiagram` preload bridge) and swaps in the SVG it returns.
 *
 * Like {@link FootnoteReferenceNode}, this is an inline leaf decorator — the image has no children.
 */
type SerializedDrawioImageNode = Spread<
  { src: string; alt: string; title?: string },
  SerializedLexicalNode
>;

export class DrawioImageNode extends DecoratorNode<ReactNode> {
  /** @internal */ __src: string;
  /** @internal */ __alt: string;
  /** @internal */ __title: string | undefined;

  /** @internal */
  static getType(): string {
    return "drawioImage";
  }

  /** @internal */
  static clone(node: DrawioImageNode): DrawioImageNode {
    return new DrawioImageNode(node.__src, node.__alt, node.__title, node.__key);
  }

  /** @internal */
  static importJSON(serializedNode: SerializedDrawioImageNode): DrawioImageNode {
    return $createDrawioImageNode({
      src: serializedNode.src,
      alt: serializedNode.alt,
      title: serializedNode.title
    });
  }

  constructor(src: string, alt: string, title: string | undefined, key?: NodeKey) {
    super(key);
    this.__src = src;
    this.__alt = alt;
    this.__title = title;
  }

  getSrc(): string {
    return this.__src;
  }

  getAlt(): string {
    return this.__alt;
  }

  getTitle(): string | undefined {
    return this.__title;
  }

  /** Replaces the diagram image (called after a successful edit). */
  setSrc(src: string): void {
    this.getWritable().__src = src;
  }

  /** @internal */
  exportJSON(): SerializedDrawioImageNode {
    return { src: this.__src, alt: this.__alt, title: this.__title, type: "drawioImage", version: 1 };
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
  decorate(editor: LexicalEditor): ReactNode {
    return (
      <DrawioImage nodeKey={this.getKey()} src={this.__src} alt={this.__alt} editor={editor} />
    );
  }
}

export function $createDrawioImageNode(params: {
  src: string;
  alt?: string;
  title?: string;
}): DrawioImageNode {
  return new DrawioImageNode(params.src, params.alt ?? "", params.title);
}

export function $isDrawioImageNode(node: LexicalNode | null | undefined): node is DrawioImageNode {
  return node instanceof DrawioImageNode;
}

function DrawioImage({
  nodeKey,
  src,
  alt,
  editor
}: {
  nodeKey: NodeKey;
  src: string;
  alt: string;
  editor: LexicalEditor;
}) {
  const [busy, setBusy] = useState(false);
  // The editor only exists inside Electron; in a plain browser there is no drawio window to open.
  const canEdit = typeof window !== "undefined" && Boolean(window.nexus?.editDiagram);

  async function handleEdit() {
    if (busy || !window.nexus?.editDiagram) {
      return;
    }
    setBusy(true);
    try {
      const result = await window.nexus.editDiagram({ xml: extractDrawioXml(src) ?? "" });
      if (result && !result.canceled) {
        editor.update(() => {
          const node = $getNodeByKey(nodeKey);
          if ($isDrawioImageNode(node)) {
            node.setSrc(result.dataUrl);
          }
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="nexus-drawio" data-drawio="true" contentEditable={false}>
      <img className="nexus-drawio-img" src={src} alt={alt} draggable={false} />
      {canEdit ? (
        <button
          type="button"
          className="nexus-drawio-edit"
          // Prevent the click from collapsing the editor selection onto the decorator.
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleEdit}
          disabled={busy}
        >
          {busy ? "Opening…" : "Edit diagram"}
        </button>
      ) : null}
    </span>
  );
}

/** Import visitor: upgrades a Markdown image with an editable-SVG drawio source to a {@link DrawioImageNode}. */
export const MdastDrawioImageVisitor: MdastImportVisitor<Image> = {
  // Higher priority than the stock image visitor (priority 0) so drawio images are intercepted; a
  // non-drawio image fails the URL test and falls through to the default image handling.
  priority: 1,
  testNode: (node) => node.type === "image" && isDrawioImageUrl(node.url),
  visitNode({ mdastNode, lexicalParent }) {
    (lexicalParent as LexicalNode & { append(node: LexicalNode): void }).append(
      $createDrawioImageNode({
        src: mdastNode.url,
        alt: mdastNode.alt ?? "",
        title: mdastNode.title ?? undefined
      })
    );
  }
};

/** Export visitor: serialises a {@link DrawioImageNode} back to a standard Markdown `image`. */
export const LexicalDrawioImageVisitor: LexicalExportVisitor<DrawioImageNode, Image> = {
  testLexicalNode: $isDrawioImageNode,
  visitLexicalNode({ lexicalNode, mdastParent, actions }) {
    const image: Image = {
      type: "image",
      url: lexicalNode.getSrc(),
      alt: lexicalNode.getAlt() || null,
      title: lexicalNode.getTitle() ?? null
    };
    actions.appendToParent(mdastParent, image);
  }
};
