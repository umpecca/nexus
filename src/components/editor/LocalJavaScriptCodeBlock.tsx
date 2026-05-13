import { useState } from "react";
import { CodeMirrorEditor } from "@mdxeditor/editor";
import type { CodeBlockEditorDescriptor, CodeBlockEditorProps } from "@mdxeditor/editor";
import { Play } from "lucide-react";
import {
  isRunnableJavaScriptBlock,
  runLocalJavaScript,
  type LocalJavaScriptRunnerResult
} from "../../lib/localJavaScriptRunner";
import { Button } from "../ui/button";

function LocalJavaScriptRunnerOutput({ result }: { result: LocalJavaScriptRunnerResult | null }) {
  if (!result) {
    return <div className="nexus-js-runner-empty">No output yet.</div>;
  }

  return (
    <div className="nexus-js-runner-output" aria-live="polite">
      {result.console.length > 0 ? (
        result.console.map((entry) => (
          <div className={`nexus-js-runner-line nexus-js-runner-line-${entry.method}`} key={entry.id}>
            <span className="nexus-js-runner-method">{entry.method}</span>
            <span className="nexus-js-runner-message">{entry.args.join(" ")}</span>
          </div>
        ))
      ) : (
        <div className="nexus-js-runner-empty">No console output.</div>
      )}
      {result.status !== "success" ? (
        <pre className="nexus-js-runner-error">{result.error}</pre>
      ) : null}
    </div>
  );
}

function LocalJavaScriptCodeBlock(props: CodeBlockEditorProps) {
  const [result, setResult] = useState<LocalJavaScriptRunnerResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  async function runCode() {
    setIsRunning(true);
    setResult(null);

    try {
      setResult(await runLocalJavaScript(props.code));
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="nexus-js-runner-block">
      <CodeMirrorEditor {...props} />
      <div className="nexus-js-runner-panel">
        <div className="nexus-js-runner-actions">
          <Button
            className="nexus-js-runner-run"
            disabled={isRunning}
            onClick={runCode}
            size="sm"
            type="button"
          >
            <Play aria-hidden="true" />
            {isRunning ? "Running" : "Run"}
          </Button>
          <span className="nexus-js-runner-status">
            {result ? result.status : "Ready"}
          </span>
        </div>
        <LocalJavaScriptRunnerOutput result={result} />
      </div>
    </div>
  );
}

export const localJavaScriptRunnerCodeBlockDescriptor: CodeBlockEditorDescriptor = {
  priority: 20,
  match: isRunnableJavaScriptBlock,
  Editor: LocalJavaScriptCodeBlock
};

export default LocalJavaScriptCodeBlock;
