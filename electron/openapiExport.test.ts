import { describe, expect, it } from "vitest";

const { isOpenApiExportFence, renderOpenApiExport } = require("./openapiExport.cjs");

const SAMPLE = `openapi: 3.0.3
info:
  title: Cash <Prices>
  version: 1.2.0
  description: Search & compare pricing.
servers:
  - url: https://api.example.test/v1
    description: Primary
tags:
  - name: Pricing
    description: Cash price routes
paths:
  /cash-prices/search:
    post:
      tags: [Pricing]
      operationId: searchCashPrices
      summary: Search cash prices
      security:
        - ApiKey: []
      parameters:
        - name: Authorization
          in: header
          required: true
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [zip]
              properties:
                zip:
                  type: string
            example:
              zip: "90210"
      responses:
        "200":
          description: Success
          content:
            application/json:
              schema:
                type: object
                properties:
                  price:
                    type: number
`;

describe("OpenAPI export reference", () => {
  it("recognizes only YAML fences explicitly marked as OpenAPI", () => {
    expect(isOpenApiExportFence("yaml openapi")).toBe(true);
    expect(isOpenApiExportFence("yml OPENAPI other")).toBe(true);
    expect(isOpenApiExportFence("yaml")).toBe(false);
    expect(isOpenApiExportFence("json openapi")).toBe(false);
  });

  it("renders an expanded, safe static API reference", () => {
    const html = renderOpenApiExport(SAMPLE);

    expect(html).toContain("Cash &lt;Prices&gt;");
    expect(html).toContain("OpenAPI 3.0.3");
    expect(html).toContain("POST");
    expect(html).toContain("/cash-prices/search");
    expect(html).toContain("Request body");
    expect(html).toContain("application/json");
    expect(html).toContain("Authorization");
    expect(html).toContain("Security:");
    expect(html).toContain("Responses");
    expect(html).toContain("&quot;90210&quot;");
    expect(html).not.toContain("Edit visually");
    expect(html).not.toContain("Hide reference");
    expect(html).not.toContain("<button");
  });

  it("leaves malformed or incomplete OpenAPI source for the normal code renderer", () => {
    expect(renderOpenApiExport("openapi: 3.0.3\ninfo: not-an-object\npaths: {}\n")).toBeNull();
    expect(renderOpenApiExport("not: [valid yaml")).toBeNull();
  });
});
