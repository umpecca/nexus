import { DecoratorNode } from "lexical";
import type {
  EditorConfig,
  ElementNode,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread
} from "lexical";
import { useState } from "react";
import type { ReactNode } from "react";
import { NestedEditorsContext, NestedLexicalEditor, voidEmitter } from "@mdxeditor/editor";
import type {
  LexicalExportVisitor,
  MdastImportVisitor,
  NestedEditorsContextValue
} from "@mdxeditor/editor";
import type { FootnoteDefinition } from "mdast";
import { footnoteLabel, isValidFootnoteIdentifier, normalizeFootnoteIdentifier } from "../../lib/footnotes";
import { collectFootnoteIdentifiers, renameFootnote } from "./footnoteCommands";

/**
 * Rich-text representation of a block footnote definition (`[^1]: …`).
 *
 * This mirrors MDXEditor's stock `DirectiveNode`: a {@link DecoratorNode} that
 * carries its MDAST node and renders an editable block. The definition's body is
 * arbitrary flow content (paragraphs, links, lists), so — like the admonition and
 * GitHub-alert callouts — the body is edited through a {@link NestedLexicalEditor},
 * and the identifier is shown as non-editable chrome. Because the carried MDAST
 * node is handed straight back by {@link LexicalFootnoteDefinitionVisitor},
 * `mdast-util-gfm-footnote` serialises it back to `[^id]: …`.
 *
 * Definitions render inline at their authored position rather than collected at the
 * foot of the document (as GitHub renders them): for an editor that keeps the
 * source order visible and round-trips byte-for-byte.
 */
type SerializedFootnoteDefinitionNode = Spread<
  { mdastNode: FootnoteDefinition },
  SerializedLexicalNode
>;

export class FootnoteDefinitionNode extends DecoratorNode<ReactNode> {
  /** @internal */
  __mdastNode: FootnoteDefinition;
  /** @internal */
  __focusEmitter = voidEmitter();

  /** @internal */
  static getType(): string {
    return "footnoteDefinition";
  }

  /** @internal */
  static clone(node: FootnoteDefinitionNode): FootnoteDefinitionNode {
    return new FootnoteDefinitionNode(structuredClone(node.__mdastNode), node.__key);
  }

  /** @internal */
  static importJSON(serializedNode: SerializedFootnoteDefinitionNode): FootnoteDefinitionNode {
    return $createFootnoteDefinitionNode(serializedNode.mdastNode);
  }

  constructor(mdastNode: FootnoteDefinition, key?: NodeKey) {
    super(key);
    this.__mdastNode = mdastNode;
  }

  /** Returns the MDAST node this definition renders and edits. */
  getMdastNode(): FootnoteDefinition {
    return this.__mdastNode;
  }

  /** Replaces the edited MDAST node — called by the nested editor when the body changes. */
  setMdastNode(mdastNode: FootnoteDefinition): void {
    this.getWritable().__mdastNode = mdastNode;
  }

  /** Focuses the nested body editor. */
  select(): void {
    this.__focusEmitter.publish();
  }

  /** @internal */
  exportJSON(): SerializedFootnoteDefinitionNode {
    return { mdastNode: structuredClone(this.__mdastNode), type: "footnoteDefinition", version: 1 };
  }

  /** @internal */
  createDOM(): HTMLElement {
    return document.createElement("div");
  }

  /** @internal */
  updateDOM(): false {
    return false;
  }

  /** @internal */
  isInline(): false {
    return false;
  }

  /** @internal */
  isKeyboardSelectable(): boolean {
    return true;
  }

  /** @internal */
  decorate(parentEditor: LexicalEditor, config: EditorConfig): ReactNode {
    return (
      <FootnoteDefinitionEditor
        lexicalNode={this}
        mdastNode={this.getMdastNode()}
        parentEditor={parentEditor}
        config={config}
        focusEmitter={this.__focusEmitter}
      />
    );
  }
}

/**
 * Provides the {@link NestedEditorsContext} the {@link NestedLexicalEditor} needs
 * (it is normally supplied by `DirectiveNode`), then renders the identifier chrome
 * and the editable body.
 */
function FootnoteDefinitionEditor(props: NestedEditorsContextValue<FootnoteDefinition>): ReactNode {
  const { mdastNode } = props;
  return (
    <NestedEditorsContext.Provider value={props}>
      <div className="nexus-footnote-def">
        <FootnoteMarker mdastNode={mdastNode} parentEditor={props.parentEditor} />
        <NestedLexicalEditor<FootnoteDefinition>
          block
          getContent={(node) => node.children}
          getUpdatedMdastNode={(node, children) => ({
            ...node,
            children: children as FootnoteDefinition["children"]
          })}
        />
      </div>
    </NestedEditorsContext.Provider>
  );
}

/**
 * The `[^id]:` marker of a definition, click-to-edit for renaming the footnote. Committing
 * a new name rewrites this definition *and* every matching reference in the parent editor
 * ({@link renameFootnote}), so the footnote stays linked. Enter validates strictly and
 * keeps editing with an inline error on a bad/duplicate name; blur reverts; Escape cancels.
 * The `[^` / `]:` brackets are CSS pseudo-elements on the wrapper, framing both the static
 * label and the input; the input lives in `contentEditable={false}` chrome and stops event
 * propagation so the host editor doesn't capture its clicks and keystrokes.
 */
function FootnoteMarker({
  mdastNode,
  parentEditor
}: {
  mdastNode: FootnoteDefinition;
  parentEditor: LexicalEditor;
}): ReactNode {
  const currentLabel = footnoteLabel(mdastNode);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentLabel);
  const [error, setError] = useState(false);

  function startEditing() {
    setValue(currentLabel);
    setError(false);
    setEditing(true);
  }

  function tryCommit(keepOpenOnError: boolean) {
    const typed = value.trim();
    // No effective change — leave the footnote untouched.
    if (typed === currentLabel) {
      setEditing(false);
      return;
    }
    const fromIdentifier = mdastNode.identifier;
    const toIdentifier = normalizeFootnoteIdentifier(typed);
    const taken = collectFootnoteIdentifiers(parentEditor).filter((id) => id !== fromIdentifier);
    if (!isValidFootnoteIdentifier(typed) || taken.includes(toIdentifier)) {
      if (keepOpenOnError) {
        setError(true);
      } else {
        setEditing(false);
      }
      return;
    }
    renameFootnote(parentEditor, fromIdentifier, toIdentifier, typed);
    setEditing(false);
  }

  return (
    <span className="nexus-footnote-def__marker" contentEditable={false}>
      {editing ? (
        <input
          className={`nexus-footnote-def__name nexus-footnote-def__name--editing${
            error ? " nexus-footnote-def__name--error" : ""
          }`}
          value={value}
          autoFocus
          size={Math.max(value.length, 1)}
          aria-label="Footnote name"
          onChange={(event) => {
            setValue(event.target.value);
            setError(false);
          }}
          onMouseDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") {
              event.preventDefault();
              tryCommit(true);
            } else if (event.key === "Escape") {
              event.preventDefault();
              setEditing(false);
            }
          }}
          onBlur={() => tryCommit(false)}
        />
      ) : (
        <button
          type="button"
          className="nexus-footnote-def__name"
          title="Rename footnote"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={startEditing}
        >
          {currentLabel}
        </button>
      )}
    </span>
  );
}

export function $createFootnoteDefinitionNode(mdastNode: FootnoteDefinition): FootnoteDefinitionNode {
  return new FootnoteDefinitionNode(mdastNode);
}

export function $isFootnoteDefinitionNode(
  node: LexicalNode | null | undefined
): node is FootnoteDefinitionNode {
  return node instanceof FootnoteDefinitionNode;
}

/** Import visitor: wraps an MDAST `footnoteDefinition` in a {@link FootnoteDefinitionNode}. */
export const MdastFootnoteDefinitionVisitor: MdastImportVisitor<FootnoteDefinition> = {
  testNode: "footnoteDefinition",
  visitNode({ mdastNode, lexicalParent }) {
    (lexicalParent as ElementNode).append($createFootnoteDefinitionNode(mdastNode));
  }
};

/** Export visitor: hands the carried MDAST node back so the definition serialises as `[^id]: …`. */
export const LexicalFootnoteDefinitionVisitor: LexicalExportVisitor<FootnoteDefinitionNode, FootnoteDefinition> = {
  testLexicalNode: $isFootnoteDefinitionNode,
  visitLexicalNode({ lexicalNode, mdastParent, actions }) {
    actions.appendToParent(mdastParent, lexicalNode.getMdastNode());
  }
};
