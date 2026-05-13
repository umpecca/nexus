import { insertCodeBlock$ } from "@mdxeditor/editor";
import { usePublisher } from "@mdxeditor/gurx";
import { Workflow } from "lucide-react";
import { Button } from "../ui/button";

function InsertMermaidDiagram() {
  const insertCodeBlock = usePublisher(insertCodeBlock$);

  return (
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
      title="Insert Mermaid diagram"
      type="button"
      variant="ghost"
    >
      <Workflow aria-hidden="true" />
    </Button>
  );
}

export default InsertMermaidDiagram;
