import { describe, expect, it } from "vitest";
import {
  addOpenApiInlineRequestProperty,
  addOpenApiRequestBody,
  addOpenApiRequestMediaType,
  parseOpenApiJsonExample,
  requestMediaTypeGuidance,
  requestMediaTypeOption,
  CUSTOM_REQUEST_MEDIA_TYPE,
  removeOpenApiInlineRequestProperty,
  renameOpenApiInlineRequestProperty,
  renameOpenApiRequestMediaType,
  setOpenApiInlineRequestPropertyRequired,
  setOpenApiInlineRequestSchema,
  setOpenApiRequestSchemaReference
} from "./openapiRequestBody";

describe("OpenAPI request-body helpers", () => {
  it("maps familiar media types to guided choices without changing custom types", () => {
    expect(requestMediaTypeOption("application/json")).toBe("application/json");
    expect(requestMediaTypeOption("multipart/form-data")).toBe("multipart/form-data");
    expect(requestMediaTypeOption("application/vnd.company+json")).toBe(CUSTOM_REQUEST_MEDIA_TYPE);
    expect(requestMediaTypeGuidance("multipart/form-data")).toContain("format binary");
    expect(requestMediaTypeGuidance(CUSTOM_REQUEST_MEDIA_TYPE)).toContain("custom media type");
  });

  it("creates a JSON request body and preserves media extensions while renaming", () => {
    const operation = { "x-operation": "retain" };
    const requestBody = addOpenApiRequestBody(operation);
    const content = requestBody.content as Record<string, unknown>;
    (content["application/json"] as Record<string, unknown>)["x-media"] = "retain";
    expect(renameOpenApiRequestMediaType(requestBody, "application/json", "application/vnd.cash-price+json")).toBe(true);
    expect(requestBody).toMatchObject({
      content: {
        "application/vnd.cash-price+json": { "x-media": "retain" }
      }
    });
    expect(operation["x-operation"]).toBe("retain");
    expect(addOpenApiRequestMediaType(requestBody)).toBe("application/json");
  });

  it("switches explicitly between component references and inline object properties", () => {
    const media: Record<string, unknown> = { "x-media": true, schema: { type: "string" } };
    setOpenApiRequestSchemaReference(media, "Cash/Price");
    expect(media.schema).toEqual({ $ref: "#/components/schemas/Cash~1Price" });

    const schema = setOpenApiInlineRequestSchema(media);
    expect(schema.type).toBe("object");
    const property = addOpenApiInlineRequestProperty(schema);
    (schema.properties as Record<string, unknown>)[property] = { type: "string", "x-property": "retain" };
    setOpenApiInlineRequestPropertyRequired(schema, property, true);
    expect(renameOpenApiInlineRequestProperty(schema, property, "ndc")).toBe(true);
    expect(schema).toMatchObject({
      type: "object",
      properties: { ndc: { "x-property": "retain" } },
      required: ["ndc"]
    });
    removeOpenApiInlineRequestProperty(schema, "ndc");
    expect(schema.properties).toEqual({});
    expect(schema.required).toBeUndefined();
  });

  it("validates JSON examples before they reach the OpenAPI object", () => {
    expect(parseOpenApiJsonExample('{"ndc":"29300042301"}')).toEqual({ ok: true, value: { ndc: "29300042301" } });
    expect(parseOpenApiJsonExample("").ok).toBe(true);
    expect(parseOpenApiJsonExample("{not json}")).toMatchObject({ ok: false, error: expect.stringContaining("Invalid JSON example") });
  });
});
