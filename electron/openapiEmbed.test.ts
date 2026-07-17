import { describe, expect, it } from "vitest";

const { normalizeOpenApiSaveResult } = require("./openapiEmbed.cjs");

describe("OpenAPI editor save payload", () => {
  it("normalizes a valid YAML result", () => {
    expect(normalizeOpenApiSaveResult({ yaml: "openapi: 3.0.3\n" })).toEqual({
      canceled: false,
      yaml: "openapi: 3.0.3\n"
    });
  });

  it("rejects empty or malformed results", () => {
    expect(normalizeOpenApiSaveResult(null)).toBeNull();
    expect(normalizeOpenApiSaveResult({})).toBeNull();
    expect(normalizeOpenApiSaveResult({ yaml: "   " })).toBeNull();
  });
});
