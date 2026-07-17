function isSqlSchemaExportFence(language) {
  const tokens = String(language ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  return tokens[0] === "sql" && tokens.includes("sqlschema");
}
function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
function parse(source) {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  if (!lines.some((line) => /^\s*--\s*nexus-schema\s+v1\s*$/i.test(line))) return null;
  const title = lines.find((line) => /^\s*--\s*title\s*:/i.test(line))?.replace(/^\s*--\s*title\s*:\s*/i, "").trim() || "Data model";
  const layouts = new Map();
  for (const line of lines) { const match = line.match(/^\s*--\s*layout\s+([A-Za-z_][\w$]*)\s+x=(-?\d+(?:\.\d+)?)\s+y=(-?\d+(?:\.\d+)?)\s+color=(#[0-9a-f]{6})\s*$/i); if (match) layouts.set(match[1], { x: Number(match[2]), y: Number(match[3]), color: match[4] }); }
  for (const line of lines) {
    if (/^\s*--\s*layout\b/i.test(line) && !/^\s*--\s*layout\s+[A-Za-z_][\w$]*\s+x=-?\d+(?:\.\d+)?\s+y=-?\d+(?:\.\d+)?\s+color=#[0-9a-f]{6}\s*$/i.test(line)) return null;
    if (/^\s*--\s*note\b/i.test(line) && !/^\s*--\s*note\s+(?:table\s+[A-Za-z_][\w$]*|column\s+[A-Za-z_][\w$]*\.[A-Za-z_][\w$]*)\s*:/i.test(line)) return null;
  }
  const sql = lines.map((line) => line.replace(/--.*$/, "")).join("\n");
  if (/\b(CREATE\s+(TYPE|INDEX|SCHEMA|VIEW)|CHECK\s*\(|ENUM\b)/i.test(sql)) return null;
  const tables = []; const create = /CREATE\s+TABLE\s+([A-Za-z_][\w$]*)\s*\(([\s\S]*?)\)\s*;/gi; let match;
  while ((match = create.exec(sql))) { const name = match[1]; const parts = split(match[2], ","); const primary = new Set(); for (const part of parts) { const pk = part.trim().match(/^PRIMARY\s+KEY\s*\(\s*([A-Za-z_][\w$]*(?:\s*,\s*[A-Za-z_][\w$]*)*)\s*\)$/i); if (pk) pk[1].split(/\s*,\s*/).forEach((item) => primary.add(item)); }
    const columns = parts.map((part) => { const value = part.trim(); if (!value || /^PRIMARY\s+KEY/i.test(value)) return null; const column = value.match(/^([A-Za-z_][\w$]*)\s+(.+)$/s); if (!column) return null; let rest = column[2]; const defaultMatch = rest.match(/\s+DEFAULT\s+(.+)$/is); const defaultValue = defaultMatch ? defaultMatch[1] : ""; if (defaultMatch) rest = rest.slice(0, defaultMatch.index); const primaryKey = primary.has(column[1]) || /\s+PRIMARY\s+KEY\b/i.test(rest); const unique = /\s+UNIQUE\b/i.test(rest); rest = rest.replace(/\s+(PRIMARY\s+KEY|NOT\s+NULL|UNIQUE)\b/ig, "").trim(); return { name: column[1], type: rest, primaryKey, unique, defaultValue }; }).filter(Boolean);
    const layout = layouts.get(name) || { x: tables.length % 3 * 400, y: Math.floor(tables.length / 3) * 250, color: ["#2563eb", "#7c3aed", "#0891b2"][tables.length % 3] }; tables.push({ name, columns, ...layout }); }
  const relationships = []; const foreign = /ALTER\s+TABLE\s+([A-Za-z_][\w$]*)\s+ADD\s+CONSTRAINT\s+([A-Za-z_][\w$]*)\s+FOREIGN\s+KEY\s*\(\s*([A-Za-z_][\w$]*)\s*\)\s+REFERENCES\s+([A-Za-z_][\w$]*)\s*\(\s*([A-Za-z_][\w$]*)\s*\)\s*;/gi; while ((match = foreign.exec(sql))) relationships.push({ source: match[1], sourceColumn: match[3], target: match[4], targetColumn: match[5] });
  const remainder = sql.replace(create, "").replace(foreign, "").trim(); if (remainder) return null;
  for (const relationship of relationships) {
    const source = tables.find((table) => table.name === relationship.source)?.columns.find((column) => column.name === relationship.sourceColumn);
    const target = tables.find((table) => table.name === relationship.target)?.columns.find((column) => column.name === relationship.targetColumn);
    if (!source || !target || !target.primaryKey && !target.unique) return null;
  }
  return { title, tables, relationships };
}
function split(value, delimiter) { const output = []; let current = "", depth = 0; for (const char of value) { if (char === "(") depth++; if (char === ")") depth--; if (char === delimiter && depth === 0) { output.push(current); current = ""; } else current += char; } output.push(current); return output; }
function renderSqlSchemaExport(source) {
  const schema = parse(source); if (!schema) return null;
  if (!schema.tables.length) return `<section class="nexus-sqlschema-export"><h3>${escapeHtml(schema.title)}</h3><p>No tables yet.</p></section>`;
  const boxes = schema.tables.map((table) => ({ ...table, width: 280, height: 50 + table.columns.length * 30 })); const minX = Math.min(...boxes.map((box) => box.x)) - 40; const minY = Math.min(...boxes.map((box) => box.y)) - 40; const maxX = Math.max(...boxes.map((box) => box.x + box.width)) + 40; const maxY = Math.max(...boxes.map((box) => box.y + box.height)) + 40;
  const svgTables = boxes.map((table) => `<g><rect x="${table.x}" y="${table.y}" width="280" height="${table.height}" rx="8" fill="#fff" stroke="#94a3b8"/><path d="M${table.x + 8} ${table.y}H${table.x + 272}Q${table.x + 280} ${table.y} ${table.x + 280} ${table.y + 8}V${table.y + 42}H${table.x}V${table.y + 8}Q${table.x} ${table.y} ${table.x + 8} ${table.y}" fill="${table.color}"/><text x="${table.x + 12}" y="${table.y + 27}" font-family="sans-serif" font-size="15" font-weight="700" fill="#fff">${escapeHtml(table.name)}</text>${table.columns.map((column, index) => { const y = table.y + 42 + index * 30; return `<g><line x1="${table.x}" y1="${y}" x2="${table.x + 280}" y2="${y}" stroke="#e2e8f0"/><text x="${table.x + 12}" y="${y + 20}" font-family="monospace" font-size="12">${escapeHtml(column.name)}</text><text x="${table.x + 150}" y="${y + 20}" font-family="monospace" font-size="11" fill="#64748b">${escapeHtml(column.type)}</text></g>`; }).join("")}</g>`).join("");
  return `<section class="nexus-sqlschema-export" aria-label="Data model"><header><h3>${escapeHtml(schema.title)}</h3><p>PostgreSQL · ${schema.tables.length} tables · ${schema.relationships.length} relationships</p></header><svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" role="img"><rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}" fill="#f8fafc"/>${svgTables}</svg></section>`;
}
module.exports = { isSqlSchemaExportFence, renderSqlSchemaExport };
