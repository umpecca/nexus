import { $getNodeByKey, DecoratorNode } from "lexical";
import type {
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread
} from "lexical";
import { useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Image } from "mdast";
import type { LexicalExportVisitor, MdastImportVisitor } from "@mdxeditor/editor";
import { extractIsoflowModel, isIsoflowImageUrl } from "../../lib/isoflowSvg";
import { setSvgDisplayWidth } from "../../lib/svgImageSize";
import DiagramResizeHandle from "./DiagramResizeHandle";

/**
 * Rich-text representation of an editable isoflow (isometric network) diagram.
 *
 * A diagram is stored in the document as an ordinary Markdown image whose `src` is an *editable* SVG
 * data URL — a PNG snapshot of the rendered diagram wrapped in an SVG that carries the diagram's
 * source isoflow `Model` in its `data-isoflow` attribute (see `lib/isoflowSvg.ts`). On import we
 * upgrade those images to this {@link DecoratorNode} so the rendered picture gains an inline "Edit
 * diagram" affordance; on export we serialise straight back to a plain Markdown `image`, so the
 * document stays standard Markdown and any other tool just shows the picture. Editing reopens the
 * embedded model in the isoflow editor (via the `editIsoflow` preload bridge) and swaps in the SVG
 * it returns.
 *
 * Mirrors {@link DrawioImageNode} — an inline leaf decorator with no children.
 */
type SerializedIsoflowImageNode = Spread<
  { src: string; alt: string; title?: string },
  SerializedLexicalNode
>;

export class IsoflowImageNode extends DecoratorNode<ReactNode> {
  /** @internal */ __src: string;
  /** @internal */ __alt: string;
  /** @internal */ __title: string | undefined;

  /** @internal */
  static getType(): string {
    return "isoflowImage";
  }

  /** @internal */
  static clone(node: IsoflowImageNode): IsoflowImageNode {
    return new IsoflowImageNode(node.__src, node.__alt, node.__title, node.__key);
  }

  /** @internal */
  static importJSON(serializedNode: SerializedIsoflowImageNode): IsoflowImageNode {
    return $createIsoflowImageNode({
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
  exportJSON(): SerializedIsoflowImageNode {
    return { src: this.__src, alt: this.__alt, title: this.__title, type: "isoflowImage", version: 1 };
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
      <IsoflowImage nodeKey={this.getKey()} src={this.__src} alt={this.__alt} editor={editor} />
    );
  }
}

export function $createIsoflowImageNode(params: {
  src: string;
  alt?: string;
  title?: string;
}): IsoflowImageNode {
  return new IsoflowImageNode(params.src, params.alt ?? "", params.title);
}

export function $isIsoflowImageNode(node: LexicalNode | null | undefined): node is IsoflowImageNode {
  return node instanceof IsoflowImageNode;
}

function IsoflowImage({
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
  const imgRef = useRef<HTMLImageElement>(null);
  // The editor only exists inside Electron; in a plain browser there is no isoflow window to open.
  const canEdit = typeof window !== "undefined" && Boolean(window.nexus?.editIsoflow);

  // Bake the dragged display width into the SVG source so the new size persists in the document.
  function handleResize(width: number) {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isIsoflowImageNode(node)) {
        node.setSrc(setSvgDisplayWidth(node.getSrc(), width));
      }
    });
  }

  async function handleEdit() {
    if (busy || !window.nexus?.editIsoflow) {
      return;
    }
    setBusy(true);
    try {
      const result = await window.nexus.editIsoflow({ model: extractIsoflowModel(src) });
      if (result && !result.canceled) {
        editor.update(() => {
          const node = $getNodeByKey(nodeKey);
          if ($isIsoflowImageNode(node)) {
            node.setSrc(result.dataUrl);
          }
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="nexus-isoflow" data-isoflow="true" contentEditable={false}>
      <img ref={imgRef} className="nexus-isoflow-img" src={src} alt={alt} draggable={false} />
      {canEdit ? (
        <button
          type="button"
          className="nexus-isoflow-edit"
          // Prevent the click from collapsing the editor selection onto the decorator.
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleEdit}
          disabled={busy}
        >
          {busy ? "Opening…" : "Edit diagram"}
        </button>
      ) : null}
      <DiagramResizeHandle imgRef={imgRef} onResizeEnd={handleResize} />
    </span>
  );
}

/** Import visitor: upgrades a Markdown image with an editable-SVG isoflow source to an {@link IsoflowImageNode}. */
export const MdastIsoflowImageVisitor: MdastImportVisitor<Image> = {
  // Higher priority than the stock image visitor (priority 0) so isoflow images are intercepted; a
  // non-isoflow image fails the URL test and falls through to the default image handling.
  priority: 1,
  testNode: (node) => node.type === "image" && isIsoflowImageUrl(node.url),
  visitNode({ mdastNode, lexicalParent }) {
    (lexicalParent as LexicalNode & { append(node: LexicalNode): void }).append(
      $createIsoflowImageNode({
        src: mdastNode.url,
        alt: mdastNode.alt ?? "",
        title: mdastNode.title ?? undefined
      })
    );
  }
};

/** Export visitor: serialises an {@link IsoflowImageNode} back to a standard Markdown `image`. */
export const LexicalIsoflowImageVisitor: LexicalExportVisitor<IsoflowImageNode, Image> = {
  testLexicalNode: $isIsoflowImageNode,
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
