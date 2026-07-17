import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseOpenApiYaml } from "../../lib/openapiYaml";
import { OpenApiReferencePreview } from "./OpenApiReferencePreview";

describe("OpenApiReferencePreview", () => {
  it("renders a Swagger-style operation summary and its documented details", () => {
    const parsed = parseOpenApiYaml(`openapi: 3.0.3
info:
  title: Orders
  version: 1.0.0
  description: Order management API
paths:
  /orders/{id}:
    get:
      tags: [Orders]
      summary: Get an order
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string, format: uuid }
      responses:
        '200':
          description: Found
          content:
            application/json:
              schema: { '$ref': '#/components/schemas/Order' }
components:
  schemas:
    Order:
      type: object
      properties:
        id: { type: string, format: uuid }
`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const html = renderToStaticMarkup(<OpenApiReferencePreview document={parsed.document} />);
    expect(html).toContain("OpenAPI reference preview");
    expect(html).toContain("Order management API");
    expect(html).toContain("GET");
    expect(html).toContain("/orders/{id}");
    expect(html).toContain("Parameters");
    expect(html).toContain("string (uuid)");
    expect(html).toContain("Responses");
    expect(html).toContain("application/json");
    expect(html).toContain("Order");
  });

  it("renders an explicit empty state for specifications without operations", () => {
    const parsed = parseOpenApiYaml(`openapi: 3.0.3
info: { title: Empty, version: 1.0.0 }
paths: {}
`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const html = renderToStaticMarkup(<OpenApiReferencePreview document={parsed.document} />);
    expect(html).toContain("No operations are documented");
  });
});
