const SQL_SCHEMA_WINDOW = Object.freeze({ width: 1360, height: 880, minWidth: 960, minHeight: 680 });

function normalizeSqlSchemaSaveResult(raw) {
  if (!raw || typeof raw !== "object" || typeof raw.schema !== "string" || !raw.schema.trim()) return null;
  return { canceled: false, schema: raw.schema };
}

module.exports = { SQL_SCHEMA_WINDOW, normalizeSqlSchemaSaveResult };
