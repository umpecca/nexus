import { $nodesOfType } from "lexical";
import type { LexicalEditor } from "lexical";
import { FootnoteReferenceNode } from "./FootnoteReferenceNode";
import { FootnoteDefinitionNode } from "./FootnoteDefinitionNode";

/**
 * Shared Lexical operations over footnote nodes, used by both naming affordances — the
 * insert dialog ({@link InsertFootnote}) and the editable definition marker. Kept out of
 * the pure `lib/footnotes.ts` because they reach into the Lexical node classes.
 *
 * Both helpers walk the *given* editor's tree via `$nodesOfType`, which does not descend
 * into other nested editors (e.g. an alert/admonition body, a table cell, or another
 * footnote's body). A footnote reference inserted inside such a nested block is therefore
 * not seen here, so {@link renameFootnote} won't update it (its definition, which always
 * lives at the document root, is still renamed). References in the document body — the
 * common case — live in the root editor and are fully handled.
 */

/** Every footnote identifier (references + definitions) currently in `editor`'s tree. */
export function collectFootnoteIdentifiers(editor: LexicalEditor): string[] {
  return editor.getEditorState().read(() => [
    ...$nodesOfType(FootnoteReferenceNode).map((node) => node.getMdastNode().identifier),
    ...$nodesOfType(FootnoteDefinitionNode).map((node) => node.getMdastNode().identifier)
  ]);
}

/**
 * Rename a footnote document-wide: every reference and definition whose identifier equals
 * `fromIdentifier` is rewritten to `toIdentifier` / `toLabel`, keeping the
 * reference↔definition link (and thus the footnote) intact. Passing the same identifier
 * with a new label just restyles the displayed casing.
 */
export function renameFootnote(
  editor: LexicalEditor,
  fromIdentifier: string,
  toIdentifier: string,
  toLabel: string
): void {
  editor.update(() => {
    for (const node of $nodesOfType(FootnoteReferenceNode)) {
      const mdast = node.getMdastNode();
      if (mdast.identifier === fromIdentifier) {
        node.setMdastNode({ ...mdast, identifier: toIdentifier, label: toLabel });
      }
    }
    for (const node of $nodesOfType(FootnoteDefinitionNode)) {
      const mdast = node.getMdastNode();
      if (mdast.identifier === fromIdentifier) {
        node.setMdastNode({ ...mdast, identifier: toIdentifier, label: toLabel });
      }
    }
  });
}
