import { describe, expect, it } from "vitest";
import {
  buildIsoflowEditableSvg,
  buildIsoflowImageDataUrl,
  extractIsoflowModel,
  isIsoflowImageUrl,
  isIsoflowSvg
} from "./isoflowSvg";

// A 1x1 transparent PNG — stands in for the diagram snapshot the host window produces.
const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
// A minimal "rendered" SVG with no embedded model — what a non-isoflow image would look like.
const PLAIN_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect/></svg>';
// A drawio editable SVG (source in `content`) — must be rejected by the isoflow detectors.
const DRAWIO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" content="&lt;mxfile&gt;&lt;/mxfile&gt;"></svg>';

// A minimal isoflow Model — only the `items`/`views` arrays the detector keys on, plus extra fields.
const MODEL = {
  title: 'Network "A" & B',
  icons: [],
  colors: [],
  items: [{ id: "item1", name: "Server" }],
  views: [{ id: "view1", name: "Overview", items: [], connectors: [] }]
};

const toBase64SvgUrl = (svg: string) =>
  `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;

describe("buildIsoflowEditableSvg / extractIsoflowModel", () => {
  it("round-trips the source model through the data-isoflow attribute", () => {
    const svg = buildIsoflowEditableSvg(PNG_DATA_URL, 320, 240, MODEL);
    expect(svg).toContain("data-isoflow=");
    expect(svg).toContain("<image");
    // The embedded model is base64, not literal JSON, so the SVG markup stays clean.
    expect(svg).not.toContain('"items"');
    expect(extractIsoflowModel(svg)).toEqual(MODEL);
  });

  it("rounds non-integer dimensions and clamps to a minimum of 1", () => {
    const svg = buildIsoflowEditableSvg(PNG_DATA_URL, 0.2, 99.6, MODEL);
    expect(svg).toContain('width="1"');
    expect(svg).toContain('height="100"');
  });

  it("returns null for a plain SVG, and for a drawio editable SVG", () => {
    expect(extractIsoflowModel(PLAIN_SVG)).toBeNull();
    expect(extractIsoflowModel(DRAWIO_SVG)).toBeNull();
    // A data-isoflow attribute whose payload isn't an isoflow model is rejected.
    expect(extractIsoflowModel('<svg data-isoflow="bm90IGpzb24="></svg>')).toBeNull();
  });
});

describe("isIsoflowSvg", () => {
  it("distinguishes an isoflow editable SVG from a plain or drawio one", () => {
    expect(isIsoflowSvg(buildIsoflowEditableSvg(PNG_DATA_URL, 10, 10, MODEL))).toBe(true);
    expect(isIsoflowSvg(PLAIN_SVG)).toBe(false);
    expect(isIsoflowSvg(DRAWIO_SVG)).toBe(false);
  });
});

describe("isIsoflowImageUrl", () => {
  it("accepts an isoflow editable-SVG data URL (base64 and percent-encoded)", () => {
    const svg = buildIsoflowEditableSvg(PNG_DATA_URL, 10, 10, MODEL);
    expect(isIsoflowImageUrl(toBase64SvgUrl(svg))).toBe(true);
    expect(isIsoflowImageUrl(`data:image/svg+xml,${encodeURIComponent(svg)}`)).toBe(true);
  });

  it("rejects a plain SVG data URL, a PNG data URL, and non-data sources", () => {
    expect(isIsoflowImageUrl(toBase64SvgUrl(PLAIN_SVG))).toBe(false);
    expect(isIsoflowImageUrl("data:image/png;base64,iVBORw0KGgo=")).toBe(false);
    expect(isIsoflowImageUrl("https://example.com/diagram.svg")).toBe(false);
    expect(isIsoflowImageUrl("./diagram.png")).toBe(false);
    expect(isIsoflowImageUrl(undefined)).toBe(false);
  });
});

describe("buildIsoflowImageDataUrl", () => {
  it("produces a data URL whose embedded model is recoverable (incl. non-Latin text)", () => {
    const model = { ...MODEL, title: "café — 日本語" };
    const svg = buildIsoflowEditableSvg(PNG_DATA_URL, 10, 10, model);
    const url = buildIsoflowImageDataUrl(svg);
    expect(url.startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(isIsoflowImageUrl(url)).toBe(true);
    expect(extractIsoflowModel(url)).toEqual(model);
  });
});
