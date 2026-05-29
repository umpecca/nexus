import { TooltipWrap, insertCodeBlock$ } from "@mdxeditor/editor";
import { usePublisher } from "@mdxeditor/gurx";
import { Sigma } from "lucide-react";
import { Button } from "../ui/button";

function InsertKatexBlock() {
  const insertCodeBlock = usePublisher(insertCodeBlock$);

  return (
    <TooltipWrap title="Insert math equation">
      <Button
        aria-label="Insert math equation"
        onClick={() =>
          insertCodeBlock({
            code: "E = mc^2",
            language: "math",
            meta: ""
          })
        }
        size="icon"
        type="button"
        variant="ghost"
      >
        <Sigma aria-hidden="true" />
      </Button>
    </TooltipWrap>
  );
}

export default InsertKatexBlock;
