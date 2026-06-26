import { useRef, useState } from "react";
import { NESTED_EDITOR_UPDATED_COMMAND, TooltipWrap, activeEditor$, rootEditor$ } from "@mdxeditor/editor";
import { useRealm } from "@mdxeditor/gurx";
import { $getRoot, $getSelection, $insertNodes, $isRangeSelection } from "lexical";
import type { LexicalEditor } from "lexical";
import { Asterisk } from "lucide-react";
import { Button } from "../ui/button";
import { collectFootnoteIdentifiers } from "./footnoteCommands";
import FootnoteNameDialog from "./FootnoteNameDialog";
import { $createFootnoteReferenceNode } from "./FootnoteReferenceNode";
import { $createFootnoteDefinitionNode, FootnoteDefinitionNode } from "./FootnoteDefinitionNode";

/**
 * Toolbar control that inserts a footnote. Clicking opens {@link FootnoteNameDialog} for an
 * optional custom name; on submit it drops an inline `[^id]` reference at the caret plus a
 * matching `[^id]: ` definition, then focuses the (empty) definition body so the author can
 * type the note.
 *
 * The reference goes into the editor that held the caret — which may be a *nested* editor
 * (a GitHub alert / admonition body, or a table cell), so footnotes work inside those
 * blocks; a nested editor only syncs up to the document on blur or
 * `NESTED_EDITOR_UPDATED_COMMAND`, so we fire that command to persist the reference. The
 * definition is a document-level construct, so it is always appended to the root editor
 * (this also keeps definitions from nesting inside one another). Rich-text only — the
 * toolbar renders the Insert group only in rich-text mode.
 */
function InsertFootnote() {
  const realm = useRealm();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [existingIdentifiers, setExistingIdentifiers] = useState<string[]>([]);
  // The editor that held the caret when the dialog opened — captured because opening the
  // modal blurs it. The reference is inserted here; the definition always goes to the root.
  const targetEditorRef = useRef<LexicalEditor | null>(null);

  function openDialog() {
    const rootEditor = realm.getValue(rootEditor$);
    targetEditorRef.current = realm.getValue(activeEditor$) ?? rootEditor ?? null;
    // Definitions all live at the root, so the root editor's identifiers cover every footnote.
    setExistingIdentifiers(rootEditor ? collectFootnoteIdentifiers(rootEditor) : []);
    setDialogOpen(true);
  }

  function insertFootnote(identifier: string, label: string) {
    const rootEditor = realm.getValue(rootEditor$);
    const targetEditor = targetEditorRef.current ?? rootEditor;
    if (!rootEditor || !targetEditor) {
      return;
    }

    // The reference goes where the caret was — possibly a nested editor.
    targetEditor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        // With text selected, collapse to the end so the marker lands *after* the selection
        // rather than replacing it (the selected text is what the footnote annotates).
        if (!selection.isCollapsed()) {
          const end = selection.isBackward() ? selection.anchor : selection.focus;
          selection.anchor.set(end.key, end.offset, end.type);
          selection.focus.set(end.key, end.offset, end.type);
        }
      } else {
        $getRoot().selectEnd();
      }
      $insertNodes([
        $createFootnoteReferenceNode({ type: "footnoteReference", identifier, label })
      ]);
      // `discrete` commits the insert synchronously, so the propagation dispatch below reads
      // the new state (a batched update would otherwise flush the *pre-insert* content up).
    }, { discrete: true });
    // A nested editor (alert/admonition body, table cell) only flushes its content to the
    // document on blur or this command; fire it so the new reference is actually persisted.
    if (targetEditor !== rootEditor) {
      targetEditor.dispatchCommand(NESTED_EDITOR_UPDATED_COMMAND, undefined);
    }

    // The definition is a document-level block — always append it to the root editor.
    let definitionNode: FootnoteDefinitionNode | null = null;
    rootEditor.update(() => {
      definitionNode = $createFootnoteDefinitionNode({
        type: "footnoteDefinition",
        identifier,
        label,
        children: [{ type: "paragraph", children: [] }]
      });
      $getRoot().append(definitionNode);
    });

    setDialogOpen(false);

    // Focus the new definition's nested editor once it has mounted.
    setTimeout(() => {
      definitionNode?.select();
    });
  }

  return (
    <>
      <TooltipWrap title="Insert footnote">
        <Button
          aria-label="Insert footnote"
          onClick={openDialog}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Asterisk aria-hidden="true" />
        </Button>
      </TooltipWrap>
      <FootnoteNameDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        existingIdentifiers={existingIdentifiers}
        onInsert={insertFootnote}
      />
    </>
  );
}

export default InsertFootnote;
