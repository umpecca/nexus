import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $insertNodes,
  $isElementNode,
  $setSelection,
  createEditor
} from "lexical";
import { describe, expect, it } from "vitest";
import { $createDrawioImageNode, DrawioImageNode } from "./DrawioImageNode";
import { captureDiagramSelection, restoreDiagramSelection } from "./InsertDiagram";

function createDiagramEditor() {
  return createEditor({
    namespace: "diagram-insertion-test",
    nodes: [DrawioImageNode],
    onError: (error) => {
      throw error;
    }
  });
}

describe("native diagram insertion selection", () => {
  it("restores the caret after the native editor clears the live selection", () => {
    const editor = createDiagramEditor();

    editor.update(
      () => {
        const targetText = $createTextNode("before after");
        $getRoot().append(
          $createParagraphNode().append(targetText),
          $createParagraphNode().append($createTextNode("document end"))
        );
        targetText.select(7, 7);
      },
      { discrete: true }
    );
    const savedSelection = captureDiagramSelection(editor);

    editor.update(() => $setSelection(null), { discrete: true });
    editor.update(
      () => {
        restoreDiagramSelection(savedSelection);
        $insertNodes([$createDrawioImageNode({ src: "data:image/svg+xml,test" })]);
      },
      { discrete: true }
    );

    const childTypes = editor.getEditorState().read(() =>
      $getRoot().getChildren().map((node) =>
        $isElementNode(node)
          ? `${node.getType()}:${node.getChildren().map((child) => child.getType()).join(",")}`
          : node.getType()
      )
    );
    expect(childTypes).toEqual([
      "paragraph:text,drawioImage,text",
      "paragraph:text"
    ]);
  });

  it("falls back to the target editor end when the captured caret is stale", () => {
    const editor = createDiagramEditor();

    editor.update(
      () => {
        const staleText = $createTextNode("removed target");
        $getRoot().append(
          $createParagraphNode().append(staleText),
          $createParagraphNode().append($createTextNode("document end"))
        );
        staleText.select(0, 0);
      },
      { discrete: true }
    );
    const savedSelection = captureDiagramSelection(editor);

    editor.update(
      () => {
        $getRoot().getFirstChildOrThrow().remove();
        $setSelection(null);
      },
      { discrete: true }
    );
    editor.update(
      () => {
        restoreDiagramSelection(savedSelection);
        $insertNodes([$createDrawioImageNode({ src: "data:image/svg+xml,test" })]);
      },
      { discrete: true }
    );

    const childTypes = editor.getEditorState().read(() =>
      $getRoot().getChildren().flatMap((node) =>
        $isElementNode(node) ? node.getChildren().map((child) => child.getType()) : node.getType()
      )
    );
    expect(childTypes).toEqual(["text", "drawioImage"]);
  });
});
