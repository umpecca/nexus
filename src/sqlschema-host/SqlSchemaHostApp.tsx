import { useCallback, useEffect, useMemo, useState } from "react";
import { ReactFlow, Background, Controls, Handle, MiniMap, Position, type Connection, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import {
  SQL_SCHEMA_TYPES,
  cloneSqlSchema,
  createEmptySqlSchema,
  findColumn,
  generateSqlSchemaDdl,
  parseSqlSchema,
  serializeSqlSchema,
  validateSqlSchema,
  type SqlSchemaColumn,
  type SqlSchemaDocument,
  type SqlSchemaTable
} from "../lib/sqlSchema";

type History = { past: SqlSchemaDocument[]; current: SqlSchemaDocument; future: SqlSchemaDocument[] };
type TableNodeData = { table: SqlSchemaTable };
const COLORS = ["#2563eb", "#7c3aed", "#0891b2", "#16a34a", "#ea580c", "#dc2626"];

function TableNode({ data }: NodeProps<Node<TableNodeData>>) {
  const table = data.table;
  return <div className="schema-table-node" style={{ borderColor: table.color }}><header style={{ background: table.color }}>{table.name || "Untitled table"}</header>{table.description ? <p>{table.description}</p> : null}<div>{table.columns.map((column) => <div className="schema-column" key={column.id} title={column.description || undefined}><Handle type="target" position={Position.Left} id={`target-${column.id}`} /><span><b>{column.name || "column"}</b> <em>{column.type}</em></span><span>{column.primaryKey ? "PK" : column.unique ? "UQ" : ""}</span><Handle type="source" position={Position.Right} id={`source-${column.id}`} /></div>)}</div></div>;
}
const nodeTypes = { table: TableNode };

export function SqlSchemaHostApp() {
  const [history, setHistory] = useState<History | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSql, setShowSql] = useState(false);

  const load = useCallback((source: string) => {
    const result = parseSqlSchema(source);
    if (!result.ok) { setError(result.error); return; }
    setHistory({ past: [], current: result.document, future: [] });
    setSelectedTableId(result.document.tables[0]?.id ?? null);
    setError(null);
  }, []);

  useEffect(() => {
    const bridge = window.nexusSqlSchemaHost;
    if (!bridge) { load(serializeSqlSchema(createEmptySqlSchema())); return; }
    bridge.onInit(({ schema, theme }) => { document.documentElement.dataset.theme = theme; load(schema || serializeSqlSchema(createEmptySqlSchema())); });
    bridge.ready();
  }, [load]);

  const update = useCallback((mutator: (draft: SqlSchemaDocument) => void) => {
    setHistory((value) => {
      if (!value) return value;
      const next = cloneSqlSchema(value.current);
      mutator(next);
      return { past: [...value.past, value.current], current: next, future: [] };
    });
  }, []);
  const undo = () => setHistory((value) => !value || !value.past.length ? value : { past: value.past.slice(0, -1), current: value.past.at(-1)!, future: [value.current, ...value.future] });
  const redo = () => setHistory((value) => !value || !value.future.length ? value : { past: [...value.past, value.current], current: value.future[0], future: value.future.slice(1) });
  const model = history?.current;
  const selected = model?.tables.find((table) => table.id === selectedTableId) ?? null;
  const errors = model ? validateSqlSchema(model) : [];

  const nodes = useMemo<Node<TableNodeData>[]>(() => model?.tables.map((table) => ({ id: table.id, type: "table", position: table.position, data: { table } })) ?? [], [model]);
  const edges = useMemo<Edge[]>(() => model?.relationships.map((relationship) => ({ id: relationship.id, source: relationship.sourceTableId, sourceHandle: `source-${relationship.sourceColumnId}`, target: relationship.targetTableId, targetHandle: `target-${relationship.targetColumnId}`, type: "smoothstep", markerEnd: "url(#sql-one)" })) ?? [], [model]);

  function addTable() {
    const id = crypto.randomUUID();
    update((draft) => { draft.tables.push({ id, name: "new_table", description: "", color: COLORS[draft.tables.length % COLORS.length], position: { x: 80 + draft.tables.length * 40, y: 80 + draft.tables.length * 40 }, columns: [{ id: crypto.randomUUID(), name: "id", type: "uuid", description: "", primaryKey: true, nullable: false, unique: false, defaultValue: "" }] }); });
    setSelectedTableId(id);
  }
  function addColumn() { if (!selected) return; update((draft) => draft.tables.find((table) => table.id === selected.id)?.columns.push({ id: crypto.randomUUID(), name: "column", type: "text", description: "", primaryKey: false, nullable: true, unique: false, defaultValue: "" })); }
  function updateTable(patch: Partial<SqlSchemaTable>) { if (!selected) return; update((draft) => Object.assign(draft.tables.find((table) => table.id === selected.id)!, patch)); }
  function updateColumn(columnId: string, patch: Partial<SqlSchemaColumn>) { if (!selected) return; update((draft) => Object.assign(draft.tables.find((table) => table.id === selected.id)!.columns.find((column) => column.id === columnId)!, patch)); }
  function deleteColumn(columnId: string) { if (!selected) return; update((draft) => { const table = draft.tables.find((item) => item.id === selected.id)!; table.columns = table.columns.filter((column) => column.id !== columnId); draft.relationships = draft.relationships.filter((relationship) => relationship.sourceColumnId !== columnId && relationship.targetColumnId !== columnId); }); }
  function deleteTable() { if (!selected) return; const id = selected.id; update((draft) => { draft.tables = draft.tables.filter((table) => table.id !== id); draft.relationships = draft.relationships.filter((relationship) => relationship.sourceTableId !== id && relationship.targetTableId !== id); }); setSelectedTableId(null); }
  function onConnect(connection: Connection) {
    if (!model || !connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return;
    const sourceColumnId = connection.sourceHandle.replace("source-", "");
    const targetColumnId = connection.targetHandle.replace("target-", "");
    const source = findColumn(model, connection.source, sourceColumnId);
    const target = findColumn(model, connection.target, targetColumnId);
    if (!target?.column.primaryKey && !target?.column.unique) { setError("Relationships must target a primary or unique column."); return; }
    if (connection.source === connection.target && sourceColumnId === targetColumnId) { setError("A column cannot reference itself."); return; }
    if (model.relationships.some((relationship) => relationship.sourceColumnId === sourceColumnId && relationship.targetColumnId === targetColumnId)) return;
    const baseName = `fk_${source?.table.name ?? "source"}_${source?.column.name ?? "column"}_${target?.table.name ?? "target"}`;
    const suffix = model.relationships.filter((relationship) => relationship.id === baseName).length;
    update((draft) => draft.relationships.push({ id: suffix ? `${baseName}_${suffix + 1}` : baseName, sourceTableId: connection.source!, sourceColumnId, targetTableId: connection.target!, targetColumnId }));
  }
  function autoLayout() { update((draft) => { const graph = new dagre.graphlib.Graph(); graph.setDefaultEdgeLabel(() => ({})); graph.setGraph({ rankdir: "LR", ranksep: 110, nodesep: 55 }); draft.tables.forEach((table) => graph.setNode(table.id, { width: 280, height: 50 + table.columns.length * 30 })); draft.relationships.forEach((relationship) => graph.setEdge(relationship.sourceTableId, relationship.targetTableId)); dagre.layout(graph); draft.tables.forEach((table) => { const point = graph.node(table.id); table.position = { x: point.x - 140, y: point.y - (25 + table.columns.length * 15) }; }); }); }
  function save() { if (!model) return; if (errors.length) { setError(errors[0]); return; } window.nexusSqlSchemaHost?.save({ schema: serializeSqlSchema(model) }); }
  function downloadSql() { if (!model || errors.length) return; const blob = new Blob([generateSqlSchemaDdl(model)], { type: "text/sql" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `${model.title || "schema"}.sql`; a.click(); URL.revokeObjectURL(url); }
  if (!model) return <main className="schema-loading"><h1>Data Model Designer</h1><p>{error ?? "Loading model…"}</p></main>;
  const ddl = errors.length ? "" : generateSqlSchemaDdl(model);
  return <main className="schema-host"><header className="schema-topbar"><div><strong>Data Model Designer</strong><input aria-label="Schema title" value={model.title} onChange={(event) => update((draft) => { draft.title = event.target.value; })} /></div><div><button disabled={!history?.past.length} onClick={undo}>Undo</button><button disabled={!history?.future.length} onClick={redo}>Redo</button><button onClick={addTable}>Add table</button><button onClick={autoLayout}>Auto layout</button><button onClick={() => setShowSql((value) => !value)}>SQL</button><button className="primary" onClick={save}>Save</button><button onClick={() => window.nexusSqlSchemaHost?.cancel()}>Cancel</button></div></header>{error ? <div className="schema-error">{error}<button onClick={() => setError(null)}>Dismiss</button></div> : null}<section className="schema-workspace"><div className="schema-canvas"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView onConnect={onConnect} onNodeClick={(_, node) => setSelectedTableId(node.id)} onNodeDragStop={(_, node) => update((draft) => { const table = draft.tables.find((item) => item.id === node.id); if (table) table.position = node.position; })} onEdgesDelete={(deleted) => update((draft) => { const ids = new Set(deleted.map((edge) => edge.id)); draft.relationships = draft.relationships.filter((relationship) => !ids.has(relationship.id)); })}><Background /><Controls /><MiniMap /></ReactFlow></div><aside className="schema-inspector">{selected ? <><h2>Table</h2><label>Name<input value={selected.name} onChange={(event) => updateTable({ name: event.target.value })} /></label><label>Description<textarea value={selected.description} onChange={(event) => updateTable({ description: event.target.value })} /></label><label>Color<input type="color" value={selected.color} onChange={(event) => updateTable({ color: event.target.value })} /></label><button className="danger" onClick={deleteTable}>Delete table</button><h2>Columns</h2>{selected.columns.map((column) => <div className="column-editor" key={column.id}><input aria-label="Column name" value={column.name} onChange={(event) => updateColumn(column.id, { name: event.target.value })} /><input aria-label="Column type" list="schema-types" value={column.type} onChange={(event) => updateColumn(column.id, { type: event.target.value })} /><label><input type="checkbox" checked={column.primaryKey} onChange={(event) => updateColumn(column.id, { primaryKey: event.target.checked })} />PK</label><label><input type="checkbox" checked={column.nullable} onChange={(event) => updateColumn(column.id, { nullable: event.target.checked })} />Null</label><label><input type="checkbox" checked={column.unique} onChange={(event) => updateColumn(column.id, { unique: event.target.checked })} />Unique</label><input aria-label="Default expression" placeholder="Default" value={column.defaultValue} onChange={(event) => updateColumn(column.id, { defaultValue: event.target.value })} /><input aria-label="Column description" placeholder="Description" value={column.description} onChange={(event) => updateColumn(column.id, { description: event.target.value })} /><button onClick={() => deleteColumn(column.id)}>Remove</button></div>)}<button onClick={addColumn}>Add column</button></> : <p>Select a table to edit it.</p>}<datalist id="schema-types">{SQL_SCHEMA_TYPES.map((type) => <option key={type} value={type} />)}</datalist></aside></section>{showSql ? <section className="schema-sql"><h2>PostgreSQL schema</h2>{errors.length ? <p>Fix validation errors before exporting SQL.</p> : <><button onClick={() => void navigator.clipboard.writeText(ddl)}>Copy SQL</button><button onClick={downloadSql}>Download .sql</button><pre>{ddl}</pre></>}</section> : null}</main>;
}
