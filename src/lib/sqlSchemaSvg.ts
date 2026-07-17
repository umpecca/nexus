import type { SqlSchemaDocument, SqlSchemaTable } from "./sqlSchema";

const TABLE_WIDTH = 280;
const HEADER_HEIGHT = 42;
const ROW_HEIGHT = 30;
const DESCRIPTION_HEIGHT = 34;
const PADDING = 48;

export type SqlSchemaSvgResult = { svg: string; width: number; height: number };

export function renderSqlSchemaSvg(document: SqlSchemaDocument): SqlSchemaSvgResult {
  if (!document.tables.length) {
    return {
      width: 640,
      height: 220,
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 220" role="img" aria-label="Empty data model"><rect width="640" height="220" rx="12" fill="#f8fafc" stroke="#cbd5e1"/><text x="320" y="112" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#64748b">No tables yet</text></svg>'
    };
  }
  const boxes = new Map(document.tables.map((table) => [table.id, tableBox(table)]));
  const minX = Math.min(...[...boxes.values()].map((box) => box.x)) - PADDING;
  const minY = Math.min(...[...boxes.values()].map((box) => box.y)) - PADDING;
  const maxX = Math.max(...[...boxes.values()].map((box) => box.x + box.width)) + PADDING;
  const maxY = Math.max(...[...boxes.values()].map((box) => box.y + box.height)) + PADDING;
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const markers = `<defs><marker id="sql-one" markerWidth="10" markerHeight="12" refX="9" refY="6" orient="auto"><path d="M8 1V11M4 1V11" stroke="#64748b" fill="none"/></marker><marker id="sql-many" markerWidth="14" markerHeight="14" refX="13" refY="7" orient="auto"><path d="M13 7L2 1M13 7L2 7M13 7L2 13" stroke="#64748b" fill="none"/></marker><marker id="sql-optional" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto"><circle cx="5" cy="6" r="3.5" stroke="#64748b" fill="#fff"/></marker></defs>`;
  const edges = document.relationships.map((relationship) => {
    const sourceTable = document.tables.find((table) => table.id === relationship.sourceTableId);
    const targetTable = document.tables.find((table) => table.id === relationship.targetTableId);
    const sourceBox = sourceTable ? boxes.get(sourceTable.id) : null;
    const targetBox = targetTable ? boxes.get(targetTable.id) : null;
    if (!sourceTable || !targetTable || !sourceBox || !targetBox) return "";
    const sourceIndex = sourceTable.columns.findIndex((column) => column.id === relationship.sourceColumnId);
    const targetIndex = targetTable.columns.findIndex((column) => column.id === relationship.targetColumnId);
    if (sourceIndex < 0 || targetIndex < 0) return "";
    const sourceColumn = sourceTable.columns[sourceIndex];
    const sourceY = sourceBox.y + rowStart(sourceTable) + sourceIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
    const targetY = targetBox.y + rowStart(targetTable) + targetIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
    const leftToRight = sourceBox.x < targetBox.x;
    const sx = leftToRight ? sourceBox.x + TABLE_WIDTH : sourceBox.x;
    const tx = leftToRight ? targetBox.x : targetBox.x + TABLE_WIDTH;
    const bend = (sx + tx) / 2;
    const childMarker = sourceColumn.unique ? "sql-one" : "sql-many";
    const optional = sourceColumn.nullable ? ' marker-mid="url(#sql-optional)"' : "";
    return `<path d="M${sx} ${sourceY} H${bend} V${targetY} H${tx}" fill="none" stroke="#64748b" stroke-width="1.8" marker-start="url(#${childMarker})" marker-end="url(#sql-one)"${optional}/>`;
  }).join("");
  const tables = document.tables.map((table) => renderTable(table, boxes.get(table.id)!)).join("");
  return {
    width,
    height,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" role="img" aria-label="${escapeXml(document.title)} data model">${markers}<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#f8fafc"/>${edges}${tables}</svg>`
  };
}

function tableBox(table: SqlSchemaTable) {
  return { x: table.position.x, y: table.position.y, width: TABLE_WIDTH, height: rowStart(table) + table.columns.length * ROW_HEIGHT + 8 };
}

function rowStart(table: SqlSchemaTable) {
  return HEADER_HEIGHT + (table.description ? DESCRIPTION_HEIGHT : 0);
}

function renderTable(table: SqlSchemaTable, box: ReturnType<typeof tableBox>) {
  const description = table.description
    ? `<text x="${box.x + 12}" y="${box.y + HEADER_HEIGHT + 21}" font-family="sans-serif" font-size="11" fill="#475569">${escapeXml(trimText(table.description, 42))}</text>`
    : "";
  const rows = table.columns.map((column, index) => {
    const y = box.y + rowStart(table) + index * ROW_HEIGHT;
    const badges = [column.primaryKey ? "PK" : "", column.unique && !column.primaryKey ? "UQ" : ""].filter(Boolean).join(" ");
    return `<g><title>${escapeXml(column.description || `${column.name}: ${column.type}`)}</title><line x1="${box.x}" y1="${y}" x2="${box.x + TABLE_WIDTH}" y2="${y}" stroke="#e2e8f0"/><text x="${box.x + 12}" y="${y + 20}" font-family="ui-monospace,monospace" font-size="12" font-weight="600" fill="#0f172a">${escapeXml(trimText(column.name, 20))}</text><text x="${box.x + 152}" y="${y + 20}" font-family="ui-monospace,monospace" font-size="11" fill="#64748b">${escapeXml(trimText(column.type, 15))}</text>${badges ? `<text x="${box.x + 267}" y="${y + 20}" text-anchor="end" font-family="sans-serif" font-size="9" font-weight="700" fill="#475569">${badges}</text>` : ""}</g>`;
  }).join("");
  return `<g><rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="8" fill="#fff" stroke="#94a3b8"/><path d="M${box.x + 8} ${box.y}H${box.x + box.width - 8}Q${box.x + box.width} ${box.y} ${box.x + box.width} ${box.y + 8}V${box.y + HEADER_HEIGHT}H${box.x}V${box.y + 8}Q${box.x} ${box.y} ${box.x + 8} ${box.y}" fill="${escapeXml(table.color)}"/><text x="${box.x + 14}" y="${box.y + 27}" font-family="sans-serif" font-size="15" font-weight="700" fill="#fff">${escapeXml(trimText(table.name, 28))}</text>${description}${rows}</g>`;
}

function trimText(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
}
