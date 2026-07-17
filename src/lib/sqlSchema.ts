export const SQL_SCHEMA_BLOCK_LANGUAGE = "sql";
export const SQL_SCHEMA_BLOCK_META = "sqlschema";
export const SQL_SCHEMA_VERSION = 1 as const;

export type SqlSchemaColumn = { id: string; name: string; type: string; description: string; primaryKey: boolean; nullable: boolean; unique: boolean; defaultValue: string };
export type SqlSchemaTable = { id: string; name: string; description: string; color: string; position: { x: number; y: number }; columns: SqlSchemaColumn[] };
export type SqlSchemaRelationship = { id: string; sourceTableId: string; sourceColumnId: string; targetTableId: string; targetColumnId: string };
export type SqlSchemaDocument = { version: typeof SQL_SCHEMA_VERSION; title: string; tables: SqlSchemaTable[]; relationships: SqlSchemaRelationship[] };
export type SqlSchemaParseResult = { ok: true; document: SqlSchemaDocument } | { ok: false; error: string };

export const SQL_SCHEMA_TYPES = ["bigint", "bigserial", "boolean", "bytea", "date", "decimal", "double precision", "integer", "json", "jsonb", "numeric", "real", "serial", "smallint", "text", "time", "timestamp", "timestamptz", "uuid", "varchar(255)"];
const COLORS = ["#2563eb", "#7c3aed", "#0891b2", "#16a34a", "#ea580c", "#dc2626"];

export function createEmptySqlSchema(): SqlSchemaDocument { return { version: SQL_SCHEMA_VERSION, title: "Data model", tables: [], relationships: [] }; }
export function cloneSqlSchema(document: SqlSchemaDocument): SqlSchemaDocument { return JSON.parse(JSON.stringify(document)) as SqlSchemaDocument; }
export function isSqlSchemaCodeBlock(language?: string | null, meta?: string | null): boolean { return language?.toLowerCase() === SQL_SCHEMA_BLOCK_LANGUAGE && (meta ?? "").split(/\s+/).includes(SQL_SCHEMA_BLOCK_META); }

/** Parse the intentionally small Nexus PostgreSQL subset. It is not a general SQL dump parser. */
export function parseSqlSchema(source: string): SqlSchemaParseResult {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  if (!lines.some((line) => /^\s*--\s*nexus-schema\s+v1\s*$/i.test(line))) return fail(1, "Expected '-- nexus-schema v1' header.");
  const title = lines.find((line) => /^\s*--\s*title\s*:/i.test(line))?.replace(/^\s*--\s*title\s*:\s*/i, "").trim() || "Data model";
  const layout = new Map<string, { x: number; y: number; color: string }>();
  const tableNotes = new Map<string, string>();
  const columnNotes = new Map<string, string>();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const position = line.match(/^\s*--\s*layout\s+([A-Za-z_][\w$]*)\s+x=(-?\d+(?:\.\d+)?)\s+y=(-?\d+(?:\.\d+)?)\s+color=(#[0-9a-f]{6})\s*$/i);
    if (position) { layout.set(position[1], { x: Number(position[2]), y: Number(position[3]), color: position[4].toLowerCase() }); continue; }
    if (/^\s*--\s*layout\b/i.test(line)) return fail(index + 1, "Layout must be '-- layout table x=0 y=0 color=#2563eb'.");
    const tableNote = line.match(/^\s*--\s*note\s+table\s+([A-Za-z_][\w$]*)\s*:\s*(.*?)\s*$/i);
    if (tableNote) { tableNotes.set(tableNote[1], tableNote[2]); continue; }
    const columnNote = line.match(/^\s*--\s*note\s+column\s+([A-Za-z_][\w$]*)\.([A-Za-z_][\w$]*)\s*:\s*(.*?)\s*$/i);
    if (columnNote) { columnNotes.set(`${columnNote[1]}.${columnNote[2]}`, columnNote[3]); continue; }
    if (/^\s*--\s*note\b/i.test(line)) return fail(index + 1, "Notes must name a table or column.");
  }
  const sql = lines.map((line) => line.replace(/--.*$/, "")).join("\n").trim();
  if (/\b(CREATE\s+(TYPE|INDEX|SCHEMA|VIEW)|CHECK\s*\(|ENUM\b)/i.test(sql)) return fail(findLine(lines, /\b(CREATE\s+(TYPE|INDEX|SCHEMA|VIEW)|CHECK\s*\(|ENUM\b)/i), "This SQL feature is outside the Nexus schema subset.");
  const statements = splitStatements(sql);
  const document = createEmptySqlSchema(); document.title = title;
  const foreignKeys: Array<{ line: number; name: string; sourceTable: string; sourceColumn: string; targetTable: string; targetColumn: string }> = [];
  for (const statement of statements) {
    const line = findLine(lines, new RegExp(escapeRegex(statement.trim().slice(0, 30)), "i"));
    if (/^CREATE\s+TABLE\b/i.test(statement)) {
      const parsed = parseCreateTable(statement, line, tableNotes, columnNotes, layout, document.tables.length);
      if (!("table" in parsed)) return parsed;
      document.tables.push(parsed.table);
    } else if (/^ALTER\s+TABLE\b/i.test(statement)) {
      const match = statement.match(/^ALTER\s+TABLE\s+([A-Za-z_][\w$]*)\s+ADD\s+CONSTRAINT\s+([A-Za-z_][\w$]*)\s+FOREIGN\s+KEY\s*\(\s*([A-Za-z_][\w$]*)\s*\)\s+REFERENCES\s+([A-Za-z_][\w$]*)\s*\(\s*([A-Za-z_][\w$]*)\s*\)\s*$/is);
      if (!match) return fail(line, "Expected a single-column ALTER TABLE ... FOREIGN KEY statement.");
      foreignKeys.push({ line, name: match[2], sourceTable: match[1], sourceColumn: match[3], targetTable: match[4], targetColumn: match[5] });
    } else if (statement.trim()) return fail(line, "Only CREATE TABLE and ALTER TABLE ... FOREIGN KEY statements are supported.");
  }
  for (const foreignKey of foreignKeys) {
    const source = document.tables.find((table) => table.name === foreignKey.sourceTable)?.columns.find((column) => column.name === foreignKey.sourceColumn);
    const target = document.tables.find((table) => table.name === foreignKey.targetTable)?.columns.find((column) => column.name === foreignKey.targetColumn);
    if (!source || !target) return fail(foreignKey.line, "Foreign key references a table or column that does not exist.");
    document.relationships.push({ id: foreignKey.name, sourceTableId: tableId(foreignKey.sourceTable), sourceColumnId: columnId(foreignKey.sourceTable, foreignKey.sourceColumn), targetTableId: tableId(foreignKey.targetTable), targetColumnId: columnId(foreignKey.targetTable, foreignKey.targetColumn) });
  }
  for (const name of layout.keys()) if (!document.tables.some((table) => table.name === name)) return fail(findLine(lines, new RegExp(`--\\s*layout\\s+${escapeRegex(name)}\\b`, "i")), `Layout refers to table '${name}', which does not exist.`);
  for (const name of tableNotes.keys()) if (!document.tables.some((table) => table.name === name)) return fail(findLine(lines, new RegExp(`--\\s*note\\s+table\\s+${escapeRegex(name)}\\b`, "i")), `Table note refers to table '${name}', which does not exist.`);
  for (const key of columnNotes.keys()) { const [tableName, columnName] = key.split("."); if (!document.tables.some((table) => table.name === tableName && table.columns.some((column) => column.name === columnName))) return fail(findLine(lines, new RegExp(`--\\s*note\\s+column\\s+${escapeRegex(key)}\\s*:`, "i")), `Column note refers to '${key}', which does not exist.`); }
  const errors = validateSqlSchema(document); return errors.length ? { ok: false, error: errors[0] } : { ok: true, document };
}

export function serializeSqlSchema(document: SqlSchemaDocument): string {
  const errors = validateSqlSchema(document); if (errors.length) throw new Error(errors.join("\n"));
  const header = ["-- nexus-schema v1", `-- title: ${document.title}`];
  for (const table of document.tables) { header.push(`-- layout ${table.name} x=${formatNumber(table.position.x)} y=${formatNumber(table.position.y)} color=${table.color}`); if (table.description) header.push(`-- note table ${table.name}: ${table.description}`); for (const column of table.columns) if (column.description) header.push(`-- note column ${table.name}.${column.name}: ${column.description}`); }
  const tables = document.tables.map((table) => {
    const definitions = table.columns.map((column) => {
      const parts = [column.name, column.type]; if (!column.nullable) parts.push("NOT NULL"); if (column.unique && !column.primaryKey) parts.push("UNIQUE"); if (column.defaultValue) parts.push(`DEFAULT ${column.defaultValue}`); return `  ${parts.join(" ")}`;
    });
    const primary = table.columns.filter((column) => column.primaryKey); if (primary.length) definitions.push(`  PRIMARY KEY (${primary.map((column) => column.name).join(", ")})`);
    return `CREATE TABLE ${table.name} (\n${definitions.join(",\n")}\n);`;
  });
  const relationships = document.relationships.map((relationship) => { const source = findColumn(document, relationship.sourceTableId, relationship.sourceColumnId)!; const target = findColumn(document, relationship.targetTableId, relationship.targetColumnId)!; return `ALTER TABLE ${source.table.name}\n  ADD CONSTRAINT ${relationship.id}\n  FOREIGN KEY (${source.column.name}) REFERENCES ${target.table.name}(${target.column.name});`; });
  return `${header.join("\n")}\n\n${tables.join("\n\n")}${relationships.length ? `\n\n${relationships.join("\n\n")}` : ""}\n`;
}

export const generateSqlSchemaDdl = serializeSqlSchema;
export function getSqlSchemaWarnings(): string[] { return []; }

export function validateSqlSchema(document: SqlSchemaDocument): string[] {
  const errors: string[] = []; if (!document.title.trim()) errors.push("Schema title is required.");
  const tables = new Set<string>(); const ids = new Set<string>();
  for (const table of document.tables) { if (!isIdentifier(table.name)) errors.push(`Invalid table name: ${table.name || "(empty)"}.`); if (tables.has(table.name)) errors.push(`Duplicate table name: ${table.name}.`); tables.add(table.name); if (!/^#[0-9a-f]{6}$/i.test(table.color)) errors.push(`Table ${table.name} has an invalid color.`); if (!Number.isFinite(table.position.x) || !Number.isFinite(table.position.y)) errors.push(`Table ${table.name} has an invalid position.`); const columns = new Set<string>(); for (const column of table.columns) { if (!isIdentifier(column.name)) errors.push(`Invalid column name in ${table.name}.`); if (columns.has(column.name)) errors.push(`Duplicate column name ${column.name} in table ${table.name}.`); columns.add(column.name); ids.add(column.id); if (!column.type.trim()) errors.push(`Column ${table.name}.${column.name} requires a type.`); } }
  const relationIds = new Set<string>(); for (const relationship of document.relationships) { if (!isIdentifier(relationship.id)) errors.push(`Invalid relationship name: ${relationship.id}.`); if (relationIds.has(relationship.id)) errors.push(`Duplicate relationship name: ${relationship.id}.`); relationIds.add(relationship.id); const source = findColumn(document, relationship.sourceTableId, relationship.sourceColumnId); const target = findColumn(document, relationship.targetTableId, relationship.targetColumnId); if (!source || !target) errors.push(`Relationship ${relationship.id} references a missing table or column.`); else if (!target.column.primaryKey && !target.column.unique) errors.push(`Relationship ${relationship.id} must reference a primary or unique column.`); }
  return errors;
}

export function findColumn(document: SqlSchemaDocument, tableIdValue: string, columnIdValue: string) { const table = document.tables.find((candidate) => candidate.id === tableIdValue); const column = table?.columns.find((candidate) => candidate.id === columnIdValue); return table && column ? { table, column } : null; }

function parseCreateTable(statement: string, line: number, tableNotes: Map<string, string>, columnNotes: Map<string, string>, layout: Map<string, { x: number; y: number; color: string }>, index: number): { ok: true; table: SqlSchemaTable } | SqlSchemaParseResult {
  const match = statement.match(/^CREATE\s+TABLE\s+([A-Za-z_][\w$]*)\s*\(([\s\S]*)\)\s*$/i); if (!match) return fail(line, "Expected CREATE TABLE table_name (...).");
  const name = match[1]; const items = splitTopLevel(match[2], ","); const columns: SqlSchemaColumn[] = []; const primary = new Set<string>();
  for (const item of items) {
    const trimmed = item.trim(); if (!trimmed) continue;
    const pk = trimmed.match(/^PRIMARY\s+KEY\s*\(\s*([A-Za-z_][\w$]*(?:\s*,\s*[A-Za-z_][\w$]*)*)\s*\)$/i); if (pk) { pk[1].split(/\s*,\s*/).forEach((column) => primary.add(column)); continue; }
    if (/^(UNIQUE|CONSTRAINT|FOREIGN\s+KEY)/i.test(trimmed)) return fail(line, "Only table-level PRIMARY KEY constraints are supported.");
    const column = parseColumn(trimmed, line, name, columnNotes); if (!("column" in column)) return column; columns.push(column.column);
  }
  for (const column of columns) if (primary.has(column.name)) column.primaryKey = true;
  const saved = layout.get(name); return { ok: true, table: { id: tableId(name), name, description: tableNotes.get(name) ?? "", color: saved?.color ?? COLORS[index % COLORS.length], position: { x: saved?.x ?? (index % 3) * 400, y: saved?.y ?? Math.floor(index / 3) * 260 }, columns } };
}

function parseColumn(item: string, line: number, table: string, notes: Map<string, string>): { ok: true; column: SqlSchemaColumn } | SqlSchemaParseResult {
  const match = item.match(/^([A-Za-z_][\w$]*)\s+(.+)$/s); if (!match) return fail(line, `Invalid column definition '${item}'.`); const name = match[1]; let rest = match[2].trim();
  let defaultValue = ""; const defaultMatch = rest.match(/\s+DEFAULT\s+(.+)$/is); if (defaultMatch) { defaultValue = defaultMatch[1].trim(); rest = rest.slice(0, defaultMatch.index).trim(); }
  const primaryKey = /\s+PRIMARY\s+KEY\b/i.test(` ${rest}`); const nullable = !/\s+NOT\s+NULL\b/i.test(` ${rest}`); const unique = /\s+UNIQUE\b/i.test(` ${rest}`);
  rest = rest.replace(/\s+PRIMARY\s+KEY\b/ig, "").replace(/\s+NOT\s+NULL\b/ig, "").replace(/\s+UNIQUE\b/ig, "").trim();
  if (!rest || /\b(CHECK|REFERENCES|GENERATED|COLLATE)\b/i.test(rest)) return fail(line, `Unsupported column definition for ${table}.${name}.`);
  return { ok: true, column: { id: columnId(table, name), name, type: rest, description: notes.get(`${table}.${name}`) ?? "", primaryKey, nullable: primaryKey ? false : nullable, unique, defaultValue } };
}

function splitStatements(sql: string) { return splitTopLevel(sql, ";").map((statement) => statement.trim()).filter(Boolean); }
function splitTopLevel(value: string, delimiter: string) { const result: string[] = []; let current = ""; let depth = 0; let quote = ""; for (const char of value) { if (quote) { current += char; if (char === quote) quote = ""; continue; } if (char === "'" || char === '"') { quote = char; current += char; continue; } if (char === "(") depth += 1; if (char === ")") depth -= 1; if (char === delimiter && depth === 0) { result.push(current); current = ""; } else current += char; } result.push(current); return result; }
function tableId(name: string) { return `table:${name}`; } function columnId(table: string, column: string) { return `column:${table}.${column}`; } function isIdentifier(value: string) { return /^[A-Za-z_][\w$]*$/.test(value); } function findLine(lines: string[], pattern: RegExp) { return Math.max(1, lines.findIndex((line) => pattern.test(line)) + 1); } function fail(line: number, message: string): SqlSchemaParseResult { return { ok: false, error: `Line ${line}: ${message}` }; } function escapeRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); } function formatNumber(value: number) { return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100); }
