import { TooltipWrap } from "@mdxeditor/editor";
import { Brush } from "lucide-react";
import { Button } from "../ui/button";

function CleanUpFormatting({ onCleanUp }: { onCleanUp: () => void }) {
  return (
    <TooltipWrap title="Clean up formatting">
      <Button
        aria-label="Clean up formatting"
        className="nexus-shadcn-toolbar-mode-button"
        onClick={onCleanUp}
        size="icon"
        type="button"
        variant="ghost"
      >
        <Brush aria-hidden="true" />
      </Button>
    </TooltipWrap>
  );
}

export default CleanUpFormatting;
