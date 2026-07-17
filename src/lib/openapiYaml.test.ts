import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPENAPI_YAML,
  isOpenApiCodeBlock,
  parseOpenApiYaml,
  serializeOpenApiYaml,
  summarizeOpenApi,
  buildOpenApiReferencePreview,
  renameOpenApiSchema,
  renameOpenApiSecurityScheme,
  renameOpenApiTag
} from "./openapiYaml";

describe("OpenAPI YAML blocks", () => {
  it("matches only YAML fences carrying the openapi metadata token", () => {
    expect(isOpenApiCodeBlock("yaml", "openapi")).toBe(true);
    expect(isOpenApiCodeBlock("yml", "linenums openapi")).toBe(true);
    expect(isOpenApiCodeBlock("yaml", "")).toBe(false);
    expect(isOpenApiCodeBlock("json", "openapi")).toBe(false);
  });

  it("parses and summarizes a valid specification", () => {
    const result = parseOpenApiYaml(`openapi: 3.0.3
info: { title: Orders, version: 2.1.0 }
paths:
  /orders:
    get: { responses: { '200': { description: OK } } }
    post: { responses: { '201': { description: Created } } }
components:
  schemas:
    Order: { type: object }
`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(summarizeOpenApi(result.document)).toMatchObject({
      title: "Orders",
      version: "2.1.0",
      routeCount: 2,
      schemaCount: 1
    });
  });

  it("preserves unsupported fields and extensions when known fields change", () => {
    const result = parseOpenApiYaml(`openapi: 3.1.0
x-company: retained
info:
  title: Original
  version: 1.0.0
paths:
  /things:
    get:
      x-operation-note: keep me
      callbacks:
        event: { '$ref': '#/components/callbacks/Event' }
      responses: {}
components:
  schemas:
    Thing:
      type: object
      unevaluatedProperties: false
`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    (result.document.info as Record<string, unknown>).title = "Changed";
    const reparsed = parseOpenApiYaml(serializeOpenApiYaml(result.document));
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.document["x-company"]).toBe("retained");
    const get = ((reparsed.document.paths as Record<string, unknown>)["/things"] as Record<string, unknown>)
      .get as Record<string, unknown>;
    expect(get["x-operation-note"]).toBe("keep me");
    expect(get.callbacks).toBeTruthy();
    const thing = (((reparsed.document.components as Record<string, unknown>).schemas as Record<string, unknown>)
      .Thing as Record<string, unknown>);
    expect(thing.unevaluatedProperties).toBe(false);
  });

  it("reports malformed or incomplete input", () => {
    expect(parseOpenApiYaml("openapi: [").ok).toBe(false);
    expect(parseOpenApiYaml("openapi: 3.0.3\ninfo: {}\npaths: {}\n").ok).toBe(false);
    expect(parseOpenApiYaml(DEFAULT_OPENAPI_YAML).ok).toBe(true);
  });

  it("keeps semantic references valid when named entities are renamed", () => {
    const result = parseOpenApiYaml(`openapi: 3.0.3
info: { title: Ref test, version: 1.0.0 }
security: [{ OldKey: [] }]
tags: [{ name: old-tag }]
paths:
  /things:
    get:
      tags: [old-tag]
      security: [{ OldKey: [read] }]
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { '$ref': '#/components/schemas/Old~1Name' }
components:
  schemas:
    Old/Name: { type: object, x-keep: yes }
  securitySchemes:
    OldKey: { type: apiKey, in: header, name: X-Key }
`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    renameOpenApiSchema(result.document, "Old/Name", "New/Name");
    renameOpenApiSecurityScheme(result.document, "OldKey", "NewKey");
    renameOpenApiTag(result.document, "old-tag", "new-tag");
    const yaml = serializeOpenApiYaml(result.document);
    expect(yaml).toContain("#/components/schemas/New~1Name");
    expect(yaml).toContain("x-keep: yes");
    expect(yaml).toContain("NewKey:");
    expect(yaml).not.toContain("OldKey:");
    expect(yaml).toContain("new-tag");
  });

  it("builds a tagged API reference with inherited and operation parameters", () => {
    const result = parseOpenApiYaml(`openapi: 3.0.3
info:
  title: Cash Prices
  version: 1.0.0
  description: Pharmacy cash-price search.
servers:
  - url: https://api.example.test/v1
    description: Production
tags:
  - name: Prices
    description: Cash-price operations
paths:
  /cash-prices/{region}:
    parameters:
      - name: region
        in: path
        description: Region code
        required: true
        schema: { type: string }
    post:
      tags: [Prices]
      operationId: searchCashPrices
      summary: Search cash prices
      description: Finds exact and optimized prices.
      security: [{ ApiKey: [] }]
      parameters:
        - name: limit
          in: query
          schema: { type: integer, format: int32 }
      requestBody:
        required: true
        content:
          application/json:
            schema: { '$ref': '#/components/schemas/SearchRequest' }
      responses:
        '200':
          description: Matching prices
          content:
            application/json:
              schema:
                type: array
                items: { '$ref': '#/components/schemas/Price' }
components:
  schemas:
    SearchRequest:
      type: object
      required: [ndc]
      properties:
        ndc: { type: string, description: National Drug Code }
        quantity: { type: integer, minimum: 1 }
    Price:
      type: object
      properties:
        amount: { type: number, format: double }
`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const preview = buildOpenApiReferencePreview(result.document);
    expect(preview.description).toBe("Pharmacy cash-price search.");
    expect(preview.servers).toEqual([{ url: "https://api.example.test/v1", description: "Production" }]);
    expect(preview.groups).toHaveLength(1);
    expect(preview.groups[0]).toMatchObject({ name: "Prices", description: "Cash-price operations" });
    const operation = preview.groups[0].operations[0];
    expect(operation).toMatchObject({
      method: "post",
      path: "/cash-prices/{region}",
      summary: "Search cash prices",
      security: ["ApiKey"]
    });
    expect(operation.parameters.map(({ name, location, required }) => ({ name, location, required }))).toEqual([
      { name: "region", location: "path", required: true },
      { name: "limit", location: "query", required: false }
    ]);
    expect(operation.requestBody?.content[0].schema).toMatchObject({
      label: "SearchRequest",
      properties: [
        { name: "ndc", required: true, schema: { label: "string" } },
        { name: "quantity", required: false, schema: { label: "integer" } }
      ]
    });
    expect(operation.responses[0].content[0].schema?.label).toBe("Price[]");
  });

  it("lets operation parameters override path-level parameters by semantic identity", () => {
    const result = parseOpenApiYaml(`openapi: 3.0.3
info: { title: Parameters, version: 1.0.0 }
paths:
  /things:
    parameters:
      - { name: locale, in: query, description: Path value, schema: { type: string } }
    get:
      parameters:
        - { name: locale, in: query, description: Operation value, schema: { type: string } }
      responses: { '204': { description: Empty } }
`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parameters = buildOpenApiReferencePreview(result.document).groups[0].operations[0].parameters;
    expect(parameters).toHaveLength(1);
    expect(parameters[0].description).toBe("Operation value");
  });
});
