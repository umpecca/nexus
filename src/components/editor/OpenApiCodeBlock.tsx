import { useState } from "react";
import {
  useCodeBlockEditorContext,
  type CodeBlockEditorDescriptor,
  type CodeBlockEditorProps
} from "@mdxeditor/editor";
import { Braces, ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { Button } from "../ui/button";
import { isOpenApiCodeBlock, parseOpenApiYaml, summarizeOpenApi } from "../../lib/openapiYaml";
import { OpenApiReferencePreview } from "./OpenApiReferencePreview";

function currentTheme(): "light" | "dark" {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function OpenApiCodeBlock({ code }: CodeBlockEditorProps) {
  const { setCode } = useCodeBlockEditorContext();
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const parsed = parseOpenApiYaml(code);
  const summary = parsed.ok ? summarizeOpenApi(parsed.document) : null;
  const parseError = parsed.ok ? null : parsed.error;

  async function edit() {
    if (!window.nexus?.editOpenApi || busy) return;
    setBusy(true);
    try {
      const result = await window.nexus.editOpenApi({ yaml: code, theme: currentTheme() });
      if (!result.canceled) setCode(result.yaml);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={parsed.ok ? "nexus-openapi-shell" : "nexus-openapi-shell nexus-openapi-block-error"} contentEditable={false}>
      <div className="nexus-openapi-block">
        <div className="nexus-openapi-icon"><Braces aria-hidden="true" /></div>
        <div className="nexus-openapi-details">
          <div className="nexus-openapi-eyebrow">OpenAPI {summary?.openapiVersion ?? "specification"}</div>
          <strong>{summary?.title ?? "Invalid OpenAPI YAML"}</strong>
          {summary ? (
            <span>v{summary.version} · {summary.routeCount} {summary.routeCount === 1 ? "route" : "routes"} · {summary.schemaCount} {summary.schemaCount === 1 ? "schema" : "schemas"}</span>
          ) : (
            <span>{parseError}</span>
          )}
        </div>
        <div className="nexus-openapi-actions">
          {parsed.ok ? (
            <Button aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} size="sm" type="button" variant="outline">
              {expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
              {expanded ? "Hide reference" : "Show reference"}
            </Button>
          ) : null}
          <Button aria-label="Edit OpenAPI specification visually" disabled={!window.nexus?.editOpenApi || busy} onClick={() => void edit()} size="sm" type="button" variant="outline">
            <Pencil aria-hidden="true" /> {busy ? "Opening…" : "Edit visually"}
          </Button>
        </div>
      </div>
      {parsed.ok && expanded ? <OpenApiReferencePreview document={parsed.document} /> : null}
    </div>
  );
}

export const openApiCodeBlockDescriptor: CodeBlockEditorDescriptor = {
  priority: 40,
  match: isOpenApiCodeBlock,
  Editor: OpenApiCodeBlock
};

export default OpenApiCodeBlock;
