import { describe, expect, it } from "vitest";
import { getSvgDisplaySize, setSvgDisplayWidth } from "./svgImageSize";
import { buildIsoflowEditableSvg, buildIsoflowImageDataUrl, extractIsoflowModel } from "./isoflowSvg";
import { buildDrawioImageDataUrl, embedDrawioXml, extractDrawioXml } from "./drawioSvg";

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const MODEL = { icons: [], colors: [], items: [{ id: "i1" }], views: [{ id: "v1" }] };

describe("getSvgDisplaySize", () => {
  it("reads width/height from the root svg", () => {
    expect(getSvgDisplaySize('<svg width="320" height="240"></svg>')).toEqual({ width: 320, height: 240 });
  });

  it("falls back to the viewBox when width/height are absent", () => {
    expect(getSvgDisplaySize('<svg viewBox="0 0 400 300"></svg>')).toEqual({ width: 400, height: 300 });
  });

  it("strips px units and returns null for unsizable input", () => {
    expect(getSvgDisplaySize('<svg width="100px" height="50px"></svg>')).toEqual({ width: 100, height: 50 });
    expect(getSvgDisplaySize("<svg></svg>")).toBeNull();
  });
});

describe("setSvgDisplayWidth on an isoflow image", () => {
  it("resizes (aspect-preserved) and keeps the embedded model re-editable", () => {
    const url = buildIsoflowImageDataUrl(buildIsoflowEditableSvg(PNG, 400, 200, MODEL));
    const resized = setSvgDisplayWidth(url, 200);
    expect(getSvgDisplaySize(resized)).toEqual({ width: 200, height: 100 }); // 2:1 aspect preserved
    expect(extractIsoflowModel(resized)).toEqual(MODEL); // data-isoflow survived
  });
});

describe("setSvgDisplayWidth on a drawio image", () => {
  it("resizes and keeps the embedded XML re-editable", () => {
    const svg = embedDrawioXml(
      '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"></svg>',
      "<mxfile>diagram</mxfile>"
    );
    const resized = setSvgDisplayWidth(buildDrawioImageDataUrl(svg), 300);
    expect(getSvgDisplaySize(resized)).toEqual({ width: 300, height: 150 });
    expect(extractDrawioXml(resized)).toBe("<mxfile>diagram</mxfile>"); // content attr survived
  });
});

describe("setSvgDisplayWidth edge cases", () => {
  it("returns the input unchanged when it is not an svg data URL", () => {
    expect(setSvgDisplayWidth("data:image/png;base64,AAAA", 100)).toBe("data:image/png;base64,AAAA");
    expect(setSvgDisplayWidth("./diagram.svg", 100)).toBe("./diagram.svg");
  });

  it("clamps to at least 1px", () => {
    const url = buildIsoflowImageDataUrl(buildIsoflowEditableSvg(PNG, 400, 200, MODEL));
    expect(getSvgDisplaySize(setSvgDisplayWidth(url, 0))).toEqual({ width: 1, height: 1 });
  });
});
