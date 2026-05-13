import { useEffect, useState } from "react";
import type { CodeBlockEditorDescriptor, CodeBlockEditorProps } from "@mdxeditor/editor";
import { renderMermaidDiagram, type MermaidRenderResult } from "../../lib/mermaidRenderer";

function MermaidCodeBlock({ code }: CodeBlockEditorProps) {
  const [result, setResult] = useState<MermaidRenderResult>({
    status: "success",
    svg: ""
  });

  useEffect(() => {
    let isCurrent = true;

    async function renderDiagram() {
      const nextResult = await renderMermaidDiagram(code);

      if (isCurrent) {
        setResult(nextResult);
      }
    }

    void renderDiagram();

    return () => {
      isCurrent = false;
    };
  }, [code]);

  if (result.status === "error") {
    return (
      <div className="nexus-mermaid-block nexus-mermaid-block-error">
        <div className="nexus-mermaid-title">Mermaid</div>
        <pre className="nexus-mermaid-error">{result.error}</pre>
      </div>
    );
  }

  return (
    <div className="nexus-mermaid-block">
      {result.svg ? (
        <div
          className="nexus-mermaid-rendered"
          dangerouslySetInnerHTML={{ __html: result.svg }}
        />
      ) : (
        <div className="nexus-mermaid-empty">Rendering diagram...</div>
      )}
    </div>
  );
}

export const mermaidCodeBlockDescriptor: CodeBlockEditorDescriptor = {
  priority: 30,
  match: (language) => (language ?? "").trim().toLowerCase() === "mermaid",
  Editor: MermaidCodeBlock
};

export default MermaidCodeBlock;
