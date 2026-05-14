import { TooltipWrap, insertCodeBlock$ } from "@mdxeditor/editor";
import { usePublisher } from "@mdxeditor/gurx";
import { Workflow } from "lucide-react";
import { Button } from "../ui/button";

function InsertMermaidDiagram() {
  const insertCodeBlock = usePublisher(insertCodeBlock$);

  return (
    <TooltipWrap title="Insert Mermaid diagram">
      <Button
        aria-label="Insert Mermaid diagram"
        onClick={() =>
          insertCodeBlock({
            code: "flowchart TD\n  A[Start] --> B[Finish]",
            language: "mermaid",
            meta: ""
          })
        }
        size="icon"
        type="button"
        variant="ghost"
      >
        <Workflow aria-hidden="true" />
      </Button>
    </TooltipWrap>
  );
}

export default InsertMermaidDiagram;
