import { describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ISOFLOW_WINDOW, normalizeSaveResult } = require("./isoflowEmbed.cjs");

describe("normalizeSaveResult", () => {
  it("normalises a valid save payload into a terminal success result", () => {
    const model = { items: [{ id: "a" }], views: [{ id: "v" }] };
    expect(normalizeSaveResult({ dataUrl: "data:image/svg+xml;base64,AAA", model })).toEqual({
      canceled: false,
      dataUrl: "data:image/svg+xml;base64,AAA",
      model
    });
  });

  it("defaults a missing model to null", () => {
    expect(normalizeSaveResult({ dataUrl: "data:image/svg+xml;base64,AAA" })).toEqual({
      canceled: false,
      dataUrl: "data:image/svg+xml;base64,AAA",
      model: null
    });
  });

  it("rejects payloads without a usable data URL", () => {
    expect(normalizeSaveResult(null)).toBeNull();
    expect(normalizeSaveResult(undefined)).toBeNull();
    expect(normalizeSaveResult("nope")).toBeNull();
    expect(normalizeSaveResult({})).toBeNull();
    expect(normalizeSaveResult({ dataUrl: "" })).toBeNull();
    expect(normalizeSaveResult({ dataUrl: 42 })).toBeNull();
  });
});

describe("ISOFLOW_WINDOW", () => {
  it("matches the drawio editor window geometry", () => {
    expect(ISOFLOW_WINDOW).toMatchObject({ width: 1200, height: 820, minWidth: 800, minHeight: 600 });
  });
});
