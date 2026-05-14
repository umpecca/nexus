import { TooltipWrap, insertCodeBlock$ } from "@mdxeditor/editor";
import { usePublisher } from "@mdxeditor/gurx";
import { SquareTerminal } from "lucide-react";
import { Button } from "../ui/button";

function InsertLocalJavaScriptRunner() {
  const insertCodeBlock = usePublisher(insertCodeBlock$);

  return (
    <TooltipWrap title="Insert JS runner">
      <Button
        aria-label="Insert JS runner"
        onClick={() =>
          insertCodeBlock({
            code: 'console.log("Hello Nexus");',
            language: "js",
            meta: "nexus-run"
          })
        }
        size="icon"
        type="button"
        variant="ghost"
      >
        <SquareTerminal aria-hidden="true" />
      </Button>
    </TooltipWrap>
  );
}

export default InsertLocalJavaScriptRunner;
