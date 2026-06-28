import {
  ButtonOrDropdownButton,
  NESTED_EDITOR_UPDATED_COMMAND,
  activeEditor$,
  insertCodeBlock$,
  rootEditor$
} from "@mdxeditor/editor";
import { usePublisher, useRealm } from "@mdxeditor/gurx";
import { $getRoot, $getSelection, $insertNodes, $isRangeSelection } from "lexical";
import { Workflow } from "lucide-react";
import { $createDrawioImageNode } from "./DrawioImageNode";
import { $createIsoflowImageNode } from "./IsoflowImageNode";

const MERMAID_TEMPLATE = "flowchart TD\n  A[Start] --> B[Finish]";

/**
 * Combined "Insert diagram" toolbar control: one split button (mirroring the GitHub-alert and
 * admonition controls' {@link ButtonOrDropdownButton}) whose dropdown offers the three diagram kinds,
 * replacing the former separate Mermaid / drawio / isoflow buttons.
 *
 * Mermaid drops a fenced ```mermaid code block at the caret. drawio and isoflow open their bundled
 * native editors via the preload bridge and, on save, insert the returned editable SVG as an inline
 * image node — so those two appear only inside Electron (where the bridge exists). The async editor
 * round-trip + nested-editor persistence is shared by both in `insertNativeDiagram`, and was the
 * behaviour of the old single-purpose buttons.
 */
function InsertDiagram() {
  const realm = useRealm();
  const insertCodeBlock = usePublisher(insertCodeBlock$);
  const canDrawio = typeof window !== "undefined" && Boolean(window.nexus?.editDiagram);
  const canIsoflow = typeof window !== "undefined" && Boolean(window.nexus?.editIsoflow);

  function insertMermaid() {
    insertCodeBlock({ code: MERMAID_TEMPLATE, language: "mermaid", meta: "" });
  }

  async function insertNativeDiagram(kind: "drawio" | "isoflow") {
    const bridge = window.nexus;
    if (!bridge) {
      return;
    }
    // Capture the target editor synchronously: the caret may sit in a nested editor (an alert /
    // admonition body or a table cell), and opening the modal must not change which one we edit.
    const rootEditor = realm.getValue(rootEditor$);
    const targetEditor = realm.getValue(activeEditor$) ?? rootEditor;
    if (!rootEditor || !targetEditor) {
      return;
    }

    let dataUrl: string;
    if (kind === "drawio") {
      if (!bridge.editDiagram) {
        return;
      }
      const result = await bridge.editDiagram({ xml: "" });
      if (!result || result.canceled) {
        return;
      }
      dataUrl = result.dataUrl;
    } else {
      if (!bridge.editIsoflow) {
        return;
      }
      const result = await bridge.editIsoflow({ model: null });
      if (!result || result.canceled) {
        return;
      }
      dataUrl = result.dataUrl;
    }

    targetEditor.update(
      () => {
        if (!$isRangeSelection($getSelection())) {
          $getRoot().selectEnd();
        }
        const node =
          kind === "drawio"
            ? $createDrawioImageNode({ src: dataUrl, alt: "diagram" })
            : $createIsoflowImageNode({ src: dataUrl, alt: "diagram" });
        $insertNodes([node]);
      },
      // `discrete` commits synchronously so the nested-editor flush below reads the inserted node.
      { discrete: true }
    );
    // A nested editor only syncs to the document on blur or this command; fire it so the new diagram
    // persists immediately.
    if (targetEditor !== rootEditor) {
      targetEditor.dispatchCommand(NESTED_EDITOR_UPDATED_COMMAND, undefined);
    }
  }

  // drawio/isoflow need the native editor bridge, so they appear only inside Electron. Mermaid is
  // always available, so the dropdown always has at least one item.
  const items: { value: string; label: string }[] = [{ value: "mermaid", label: "Mermaid" }];
  if (canDrawio) {
    items.push({ value: "drawio", label: "drawio" });
  }
  if (canIsoflow) {
    items.push({ value: "isoflow", label: "isoflow" });
  }

  function handleChoose(value: string) {
    // ButtonOrDropdownButton passes "" when the dropdown collapses to a single item (Mermaid only).
    const choice = value === "" ? items[0].value : value;
    if (choice === "mermaid") {
      insertMermaid();
    } else if (choice === "drawio") {
      void insertNativeDiagram("drawio");
    } else if (choice === "isoflow") {
      void insertNativeDiagram("isoflow");
    }
  }

  return (
    <ButtonOrDropdownButton title="Insert diagram" onChoose={handleChoose} items={items}>
      <Workflow aria-hidden="true" />
    </ButtonOrDropdownButton>
  );
}

export default InsertDiagram;
