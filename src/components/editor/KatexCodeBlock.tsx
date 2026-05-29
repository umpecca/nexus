import { useEffect, useState } from "react";
import type { CodeBlockEditorDescriptor, CodeBlockEditorProps } from "@mdxeditor/editor";
import { isMathCodeBlock, renderMath, type KatexRenderResult } from "../../lib/katexRenderer";

function KatexCodeBlock({ code }: CodeBlockEditorProps) {
  const [result, setResult] = useState<KatexRenderResult>({
    status: "success",
    html: ""
  });

  useEffect(() => {
    let isCurrent = true;

    async function renderEquation() {
      const trimmed = code.trim();
      if (!trimmed) {
        if (isCurrent) {
          setResult({ status: "success", html: "" });
        }
        return;
      }

      const nextResult = await renderMath(code, { displayMode: true });

      if (isCurrent) {
        setResult(nextResult);
      }
    }

    void renderEquation();

    return () => {
      isCurrent = false;
    };
  }, [code]);

  if (result.status === "error") {
    return (
      <div className="nexus-math-block nexus-math-block-error">
        <div className="nexus-math-title">Math</div>
        <pre className="nexus-math-error">{result.error}</pre>
      </div>
    );
  }

  return (
    <div className="nexus-math-block">
      {result.html ? (
        <div
          className="nexus-math-rendered"
          dangerouslySetInnerHTML={{ __html: result.html }}
        />
      ) : (
        <div className="nexus-math-empty">Enter LaTeX to render an equation...</div>
      )}
    </div>
  );
}

export const katexCodeBlockDescriptor: CodeBlockEditorDescriptor = {
  priority: 30,
  match: (language) => isMathCodeBlock(language),
  Editor: KatexCodeBlock
};

export default KatexCodeBlock;
