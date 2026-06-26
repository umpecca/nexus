import { NESTED_EDITOR_UPDATED_COMMAND, TooltipWrap, activeEditor$, rootEditor$ } from "@mdxeditor/editor";
import { useRealm } from "@mdxeditor/gurx";
import { $getRoot, $getSelection, $insertNodes, $isRangeSelection } from "lexical";
import { Shapes } from "lucide-react";
import { Button } from "../ui/button";
import { $createDrawioImageNode } from "./DrawioImageNode";

/**
 * Toolbar control that inserts a new drawio diagram. Clicking opens the bundled drawio editor (via
 * the `editDiagram` preload bridge) on a blank canvas; on save it drops the returned editable SVG
 * into the document as an inline image node at the caret. Disabled outside Electron, where there is
 * no diagram editor to open. Mirrors {@link InsertMermaidDiagram}'s shape, with the async editor
 * round-trip and nested-editor persistence borrowed from {@link InsertFootnote}.
 */
function InsertDrawioDiagram() {
  const realm = useRealm();
  const canEdit = typeof window !== "undefined" && Boolean(window.nexus?.editDiagram);

  async function insertDiagram() {
    if (!window.nexus?.editDiagram) {
      return;
    }
    // Capture the target editor synchronously: the caret may sit in a nested editor (an alert /
    // admonition body or a table cell), and opening the modal must not change which one we edit.
    const rootEditor = realm.getValue(rootEditor$);
    const targetEditor = realm.getValue(activeEditor$) ?? rootEditor;
    if (!rootEditor || !targetEditor) {
      return;
    }

    const result = await window.nexus.editDiagram({ xml: "" });
    if (!result || result.canceled) {
      return;
    }

    targetEditor.update(
      () => {
        if (!$isRangeSelection($getSelection())) {
          $getRoot().selectEnd();
        }
        $insertNodes([$createDrawioImageNode({ src: result.dataUrl, alt: "diagram" })]);
      },
      // `discrete` commits synchronously so the nested-editor flush below reads the inserted node.
      { discrete: true }
    );
    // A nested editor only syncs to the document on blur or this command; fire it so the new
    // diagram persists immediately.
    if (targetEditor !== rootEditor) {
      targetEditor.dispatchCommand(NESTED_EDITOR_UPDATED_COMMAND, undefined);
    }
  }

  return (
    <TooltipWrap title="Insert drawio diagram">
      <Button
        aria-label="Insert drawio diagram"
        onClick={insertDiagram}
        size="icon"
        type="button"
        variant="ghost"
        disabled={!canEdit}
      >
        <Shapes aria-hidden="true" />
      </Button>
    </TooltipWrap>
  );
}

export default InsertDrawioDiagram;
