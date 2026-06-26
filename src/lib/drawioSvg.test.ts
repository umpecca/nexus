import { describe, expect, it } from "vitest";
import {
  buildDrawioImageDataUrl,
  embedDrawioXml,
  extractDrawioXml,
  isDrawioImageUrl,
  isDrawioSvg
} from "./drawioSvg";

// A minimal "rendered" SVG with no embedded source — what a non-drawio image would look like.
const PLAIN_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect/></svg>';
// drawio source XML (the modern <mxfile> wrapper) with characters that must survive escaping.
const MXFILE_XML =
  '<mxfile host="app"><diagram name="Page &amp; 1">data with "quotes" & <angles></diagram></mxfile>';

const toBase64SvgUrl = (svg: string) =>
  `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;

describe("embedDrawioXml / extractDrawioXml", () => {
  it("round-trips the source XML through the SVG content attribute", () => {
    const svg = embedDrawioXml(PLAIN_SVG, MXFILE_XML);
    expect(svg).toContain("content=");
    expect(svg).not.toContain("<mxfile"); // the embedded XML is HTML-escaped, not literal
    expect(extractDrawioXml(svg)).toBe(MXFILE_XML);
  });

  it("replaces an existing content attribute instead of adding a second one", () => {
    const once = embedDrawioXml(PLAIN_SVG, "<mxfile>a</mxfile>");
    const twice = embedDrawioXml(once, MXFILE_XML);
    expect(twice.match(/content=/g)).toHaveLength(1);
    expect(extractDrawioXml(twice)).toBe(MXFILE_XML);
  });

  it("recognises the older bare <mxGraphModel> wrapper", () => {
    const svg = embedDrawioXml(PLAIN_SVG, '<mxGraphModel dx="1"><root/></mxGraphModel>');
    expect(extractDrawioXml(svg)).toBe('<mxGraphModel dx="1"><root/></mxGraphModel>');
  });

  it("returns null for a plain SVG with no embedded source", () => {
    expect(extractDrawioXml(PLAIN_SVG)).toBeNull();
    // An SVG can carry an unrelated content attribute; it still isn't drawio.
    expect(extractDrawioXml('<svg content="just a caption"></svg>')).toBeNull();
  });
});

describe("isDrawioSvg", () => {
  it("distinguishes a drawio editable SVG from a plain one", () => {
    expect(isDrawioSvg(embedDrawioXml(PLAIN_SVG, MXFILE_XML))).toBe(true);
    expect(isDrawioSvg(PLAIN_SVG)).toBe(false);
  });
});

describe("isDrawioImageUrl", () => {
  it("accepts a drawio editable-SVG data URL (base64 and percent-encoded)", () => {
    const svg = embedDrawioXml(PLAIN_SVG, MXFILE_XML);
    expect(isDrawioImageUrl(toBase64SvgUrl(svg))).toBe(true);
    expect(isDrawioImageUrl(`data:image/svg+xml,${encodeURIComponent(svg)}`)).toBe(true);
  });

  it("rejects a plain SVG data URL, a PNG data URL, and non-data sources", () => {
    expect(isDrawioImageUrl(toBase64SvgUrl(PLAIN_SVG))).toBe(false);
    expect(isDrawioImageUrl("data:image/png;base64,iVBORw0KGgo=")).toBe(false);
    expect(isDrawioImageUrl("https://example.com/diagram.svg")).toBe(false);
    expect(isDrawioImageUrl("./diagram.png")).toBe(false);
    expect(isDrawioImageUrl(undefined)).toBe(false);
  });
});

describe("buildDrawioImageDataUrl", () => {
  it("produces a data URL whose embedded XML is recoverable (incl. non-Latin text)", () => {
    const svg = embedDrawioXml(PLAIN_SVG, '<mxfile><diagram>café — 日本語</diagram></mxfile>');
    const url = buildDrawioImageDataUrl(svg);
    expect(url.startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(isDrawioImageUrl(url)).toBe(true);
    expect(extractDrawioXml(url)).toBe('<mxfile><diagram>café — 日本語</diagram></mxfile>');
  });
});
