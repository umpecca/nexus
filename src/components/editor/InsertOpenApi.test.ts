import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $setSelection,
  createEditor
} from "lexical";
import { CodeBlockNode } from "@mdxeditor/editor";
import { describe, expect, it } from "vitest";
import { captureDiagramSelection } from "./InsertDiagram";
import { insertOpenApiCodeBlock } from "./InsertOpenApi";

describe("OpenAPI block insertion", () => {
  it("restores the captured caret and inserts a portable YAML code block", () => {
    const editor = createEditor({
      namespace: "openapi-insertion-test",
      nodes: [CodeBlockNode],
      onError: (error) => { throw error; }
    });
    editor.update(() => {
      const text = $createTextNode("before after");
      $getRoot().append($createParagraphNode().append(text));
      text.select(7, 7);
    }, { discrete: true });
    const selection = captureDiagramSelection(editor);
    editor.update(() => $setSelection(null), { discrete: true });

    insertOpenApiCodeBlock(editor, editor, selection, "openapi: 3.0.3\n");

    const result = editor.getEditorState().read(() => {
      const block = $getRoot().getChildren()[1] as CodeBlockNode;
      return {
        children: $getRoot().getChildren().map((node) => node.getType()),
        language: block.getLanguage(),
        meta: block.getMeta(),
        code: block.getCode()
      };
    });
    expect(result).toEqual({
      children: ["paragraph", "codeblock", "paragraph"],
      language: "yaml",
      meta: "openapi",
      code: "openapi: 3.0.3\n"
    });
  });
});
