import { describe, expect, it } from "vitest";
import { normalizeSqlSchemaSaveResult, SQL_SCHEMA_WINDOW } from "./sqlSchemaEmbed.cjs";

describe("SQL schema editor IPC", () => {
  it("uses a desktop-sized editor window", () => {
    expect(SQL_SCHEMA_WINDOW).toMatchObject({ width: 1360, height: 880, minWidth: 960, minHeight: 680 });
  });
  it("accepts a non-empty saved schema only", () => {
    expect(normalizeSqlSchemaSaveResult({ schema: '{"version":1}' })).toEqual({ canceled: false, schema: '{"version":1}' });
    expect(normalizeSqlSchemaSaveResult({ schema: "" })).toBeNull();
    expect(normalizeSqlSchemaSaveResult(null)).toBeNull();
  });
});
