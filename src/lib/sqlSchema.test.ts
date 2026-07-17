import { describe, expect, it } from "vitest";
import { createEmptySqlSchema, isSqlSchemaCodeBlock, parseSqlSchema, serializeSqlSchema, validateSqlSchema } from "./sqlSchema";

const SOURCE = `-- nexus-schema v1
-- title: Orders
-- layout users x=0 y=0 color=#2563eb
-- layout orders x=420 y=0 color=#16a34a
-- note table users: Customer accounts
-- note column users.email: Login address

CREATE TABLE users (
  id uuid NOT NULL,
  email text NOT NULL UNIQUE,
  PRIMARY KEY (id)
);

CREATE TABLE orders (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  total numeric(12,2) NOT NULL DEFAULT 0
);

ALTER TABLE orders
  ADD CONSTRAINT fk_orders_user
  FOREIGN KEY (user_id) REFERENCES users(id);
`;

describe("Nexus PostgreSQL schema format", () => {
  it("parses directives, table details, and foreign keys", () => {
    const parsed = parseSqlSchema(SOURCE);
    expect(parsed).toMatchObject({ ok: true, document: { title: "Orders", tables: expect.arrayContaining([expect.objectContaining({ name: "users", description: "Customer accounts" })]), relationships: expect.arrayContaining([expect.objectContaining({ id: "fk_orders_user" })]) } });
    if (!parsed.ok) return;
    expect(parsed.document.tables[0].columns[1].description).toBe("Login address");
    expect(parsed.document.tables[1].columns[2].defaultValue).toBe("0");
  });

  it("formats visual models as readable PostgreSQL source", () => {
    const parsed = parseSqlSchema(SOURCE);
    if (!parsed.ok) throw new Error(parsed.error);
    const formatted = serializeSqlSchema(parsed.document);
    expect(formatted).toContain("-- nexus-schema v1");
    expect(formatted).toContain("CREATE TABLE users");
    expect(formatted).toContain("ALTER TABLE orders");
    expect(parseSqlSchema(formatted)).toMatchObject({ ok: true });
  });

  it("uses explicitly marked SQL fences only", () => {
    expect(isSqlSchemaCodeBlock("sql", "sqlschema")).toBe(true);
    expect(isSqlSchemaCodeBlock("sql", "")).toBe(false);
    expect(isSqlSchemaCodeBlock("json", "sqlschema")).toBe(false);
  });

  it("rejects unsupported and malformed source with a line number", () => {
    expect(parseSqlSchema("CREATE TABLE users (id uuid);")).toEqual(expect.objectContaining({ ok: false, error: expect.stringContaining("Line 1") }));
    expect(parseSqlSchema("-- nexus-schema v1\nCREATE INDEX users_email ON users(email);")).toEqual(expect.objectContaining({ ok: false, error: expect.stringContaining("Line 2") }));
    expect(parseSqlSchema("-- nexus-schema v1\n-- layout users x=bad y=0 color=#2563eb")).toEqual(expect.objectContaining({ ok: false, error: expect.stringContaining("Line 2") }));
  });

  it("starts new documents as PostgreSQL source models", () => {
    const source = serializeSqlSchema(createEmptySqlSchema());
    expect(source).toContain("-- nexus-schema v1");
    expect(validateSqlSchema(createEmptySqlSchema())).toEqual([]);
  });
});
