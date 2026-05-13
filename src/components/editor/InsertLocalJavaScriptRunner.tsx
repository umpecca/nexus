import { insertCodeBlock$ } from "@mdxeditor/editor";
import { usePublisher } from "@mdxeditor/gurx";
import { SquareTerminal } from "lucide-react";
import { Button } from "../ui/button";

function InsertLocalJavaScriptRunner() {
  const insertCodeBlock = usePublisher(insertCodeBlock$);

  return (
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
      title="Insert JS runner"
      type="button"
      variant="ghost"
    >
      <SquareTerminal aria-hidden="true" />
    </Button>
  );
}

export default InsertLocalJavaScriptRunner;
