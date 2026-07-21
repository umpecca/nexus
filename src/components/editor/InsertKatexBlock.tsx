import { ButtonOrDropdownButton, activeEditor$, insertCodeBlock$, rootEditor$ } from "@mdxeditor/editor";
import { usePublisher } from "@mdxeditor/gurx";
import { useCellValues } from "@mdxeditor/gurx";
import { $getSelection, $insertNodes } from "lexical";
import { Sigma } from "lucide-react";
import { $createInlineMathNode } from "./InlineMathNode";

const MATH_ITEMS = [
  { value: "inline", label: "Inline math" },
  { value: "block", label: "Block math" }
];

function InsertKatexBlock() {
  const insertCodeBlock = usePublisher(insertCodeBlock$);
  const [activeEditor, rootEditor] = useCellValues(activeEditor$, rootEditor$);

  function insertInlineMath() {
    const editor = activeEditor ?? rootEditor;
    editor?.update(() => {
      const selectedText = $getSelection()?.getTextContent().trim();
      $insertNodes([$createInlineMathNode(selectedText || "x")]);
    });
  }

  function handleChoose(value: string) {
    if (value === "inline") {
      insertInlineMath();
      return;
    }

    insertCodeBlock({ code: "E = mc^2", language: "math", meta: "" });
  }

  return (
    <ButtonOrDropdownButton title="Insert math" onChoose={handleChoose} items={MATH_ITEMS}>
      <Sigma aria-hidden="true" />
    </ButtonOrDropdownButton>
  );
}

export default InsertKatexBlock;
