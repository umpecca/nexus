import { useState } from "react";
import { useCodeBlockEditorContext, type CodeBlockEditorDescriptor, type CodeBlockEditorProps } from "@mdxeditor/editor";
import { ChevronDown, ChevronUp, Database, Pencil } from "lucide-react";
import { Button } from "../ui/button";
import { isSqlSchemaCodeBlock, parseSqlSchema } from "../../lib/sqlSchema";
import { renderSqlSchemaSvg } from "../../lib/sqlSchemaSvg";

function theme(): "light" | "dark" { return document.documentElement.dataset.theme === "dark" ? "dark" : "light"; }
function svgUrl(svg: string) { return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; }

export function SqlSchemaCodeBlock({ code }: CodeBlockEditorProps) {
  const { setCode } = useCodeBlockEditorContext();
  const [expanded, setExpanded] = useState(true);
  const [busy, setBusy] = useState(false);
  const parsed = parseSqlSchema(code);
  const document = parsed.ok ? parsed.document : null;
  const parseError = parsed.ok ? "" : parsed.error;
  const image = document ? renderSqlSchemaSvg(document) : null;
  async function edit() {
    if (!window.nexus?.editSqlSchema || busy) return;
    setBusy(true);
    try {
      const result = await window.nexus.editSqlSchema({ schema: code, theme: theme() });
      if (!result.canceled) setCode(result.schema);
    } finally { setBusy(false); }
  }
  return <div className={document ? "nexus-sqlschema-shell" : "nexus-sqlschema-shell nexus-sqlschema-error"} contentEditable={false}>
    <div className="nexus-sqlschema-card"><div className="nexus-sqlschema-icon"><Database /></div><div className="nexus-sqlschema-details"><div>DATA MODEL</div><strong>{document?.title ?? "Invalid SQL schema"}</strong><span>{document ? `PostgreSQL · ${document.tables.length} ${document.tables.length === 1 ? "table" : "tables"} · ${document.relationships.length} ${document.relationships.length === 1 ? "relationship" : "relationships"}` : parseError}</span></div><div className="nexus-sqlschema-actions">{document ? <Button aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} size="sm" type="button" variant="outline">{expanded ? <ChevronUp /> : <ChevronDown />}{expanded ? "Hide diagram" : "Show diagram"}</Button> : null}<Button disabled={!window.nexus?.editSqlSchema || busy} onClick={() => void edit()} size="sm" type="button" variant="outline"><Pencil />{busy ? "Opening…" : "Edit model"}</Button></div></div>
    {document && expanded && image ? <div className="nexus-sqlschema-diagram"><img alt={`${document.title} entity relationship diagram`} src={svgUrl(image.svg)} /></div> : null}
  </div>;
}

export const sqlSchemaCodeBlockDescriptor: CodeBlockEditorDescriptor = { priority: 41, match: isSqlSchemaCodeBlock, Editor: SqlSchemaCodeBlock };
