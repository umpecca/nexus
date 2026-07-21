import { TooltipWrap, activeEditor$, insertCodeBlock$, rootEditor$ } from "@mdxeditor/editor";
import { usePublisher } from "@mdxeditor/gurx";
import { useCellValues } from "@mdxeditor/gurx";
import { $getSelection, $insertNodes } from "lexical";
import { Sigma } from "lucide-react";
import { Button } from "../ui/button";
import { $createInlineMathNode } from "./InlineMathNode";

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

  return (
    <>
      <TooltipWrap title="Insert display math">
        <Button
          aria-label="Insert display math"
          onClick={() =>
            insertCodeBlock({ code: "E = mc^2", language: "math", meta: "" })
          }
          size="icon"
          type="button"
          variant="ghost"
        >
          <Sigma aria-hidden="true" />
        </Button>
      </TooltipWrap>
      <TooltipWrap title="Insert inline math">
        <Button
          aria-label="Insert inline math"
          className="nexus-inline-math-insert"
          onClick={insertInlineMath}
          size="icon"
          type="button"
          variant="ghost"
        >
          <span aria-hidden="true">∑</span>
        </Button>
      </TooltipWrap>
    </>
  );
}

export default InsertKatexBlock;
