import { TooltipWrap } from "@mdxeditor/editor";
import { TableOfContents } from "lucide-react";
import { Button } from "../ui/button";

function InsertTableOfContents({ onInsert }: { onInsert: () => void }) {
  return (
    <TooltipWrap title="Insert table of contents">
      <Button
        aria-label="Insert table of contents"
        onClick={onInsert}
        size="icon"
        type="button"
        variant="ghost"
      >
        <TableOfContents aria-hidden="true" />
      </Button>
    </TooltipWrap>
  );
}

export default InsertTableOfContents;
