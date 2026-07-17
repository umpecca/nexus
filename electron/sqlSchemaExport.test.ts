import { describe, expect, it } from "vitest";
import { isSqlSchemaExportFence, renderSqlSchemaExport } from "./sqlSchemaExport.cjs";

const schema = `-- nexus-schema v1
-- title: Orders
-- layout users x=0 y=0 color=#2563eb

CREATE TABLE users (
  id uuid PRIMARY KEY
);`;

describe("SQL schema export", () => {
  it("matches only explicitly marked SQL fences", () => {
    expect(isSqlSchemaExportFence("sql sqlschema")).toBe(true);
    expect(isSqlSchemaExportFence("sql")).toBe(false);
  });
  it("renders valid PostgreSQL schema text as a static SVG", () => {
    const html = renderSqlSchemaExport(schema);
    expect(html).toContain("Orders");
    expect(html).toContain("<svg");
    expect(html).toContain("users");
  });
  it("leaves malformed models on the code-renderer path", () => {
    expect(renderSqlSchemaExport("not SQL")).toBeNull();
    expect(renderSqlSchemaExport("-- nexus-schema v2")).toBeNull();
    expect(renderSqlSchemaExport("-- nexus-schema v1\nDROP TABLE users;")).toBeNull();
  });
});
