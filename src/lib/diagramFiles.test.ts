import { describe, expect, it } from "vitest";
import { buildDrawioImageDataUrl, embedDrawioXml } from "./drawioSvg";
import { buildIsoflowEditableSvg, buildIsoflowImageDataUrl } from "./isoflowSvg";
import {
  classifyEditableDiagram,
  classifySvgText,
  externalizeDiagrams,
  inlineDiagrams,
  isLocalSvgRef
} from "./diagramFiles";

const drawioSvg = embedDrawioXml(
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"></svg>',
  "<mxfile><diagram>hello</diagram></mxfile>"
);
const drawioDataUrl = buildDrawioImageDataUrl(drawioSvg);

const isoflowSvg = buildIsoflowEditableSvg("data:image/png;base64,AAAA", 120, 90, {
  items: [],
  views: []
});
const isoflowDataUrl = buildIsoflowImageDataUrl(isoflowSvg);

// A fake sidecar store: externalize writes named SVGs into the map; inline reads them back by src.
function makeFakeStore() {
  const byName = new Map<string, string>();
  let counter = 0;
  const writeAsset = async (svgText: string, kind: "drawio" | "isoflow") => {
    counter += 1;
    const name = `note.${kind}.${counter}.svg`;
    byName.set(name, svgText);
    return { src: `./${name}`, name };
  };
  const readSvg = async (src: string) => byName.get(src.replace(/^\.\//, "")) ?? null;
  return { writeAsset, readSvg };
}

describe("classify + ref helpers", () => {
  it("classifies editable diagram data URLs", () => {
    expect(classifyEditableDiagram(drawioDataUrl)).toBe("drawio");
    expect(classifyEditableDiagram(isoflowDataUrl)).toBe("isoflow");
    expect(classifyEditableDiagram("data:image/png;base64,AAAA")).toBeNull();
  });

  it("classifies raw SVG text", () => {
    expect(classifySvgText(drawioSvg)).toBe("drawio");
    expect(classifySvgText(isoflowSvg)).toBe("isoflow");
    expect(classifySvgText('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>')).toBeNull();
  });

  it("detects local .svg references but not data/http/protocol-relative ones", () => {
    expect(isLocalSvgRef("./diagram.svg")).toBe(true);
    expect(isLocalSvgRef("note.drawio.abc.svg")).toBe(true);
    expect(isLocalSvgRef("../assets/x.svg?v=2")).toBe(true);
    expect(isLocalSvgRef("data:image/svg+xml;base64,AAAA")).toBe(false);
    expect(isLocalSvgRef("https://example.com/x.svg")).toBe(false);
    expect(isLocalSvgRef("//cdn/x.svg")).toBe(false);
    expect(isLocalSvgRef("photo.png")).toBe(false);
  });
});

describe("externalize ↔ inline round-trip", () => {
  it("is byte-identical for a doc with drawio + isoflow diagrams", async () => {
    const original = [
      "# Title",
      "",
      `![drawio diagram](${drawioDataUrl})`,
      "",
      "Some text.",
      "",
      `![iso](${isoflowDataUrl})`,
      ""
    ].join("\n");

    const { writeAsset, readSvg } = makeFakeStore();
    const { markdown: externalized, usedNames } = await externalizeDiagrams(original, writeAsset);

    expect(externalized).not.toContain("data:image/svg+xml");
    expect(externalized).toContain("![drawio diagram](./note.drawio.1.svg)");
    expect(externalized).toContain("![iso](./note.isoflow.2.svg)");
    expect([...usedNames].sort()).toEqual(["note.drawio.1.svg", "note.isoflow.2.svg"]);

    const inlined = await inlineDiagrams(externalized, readSvg);
    expect(inlined).toBe(original);
  });

  it("handles <img> tags too", async () => {
    const original = `<img src="${drawioDataUrl}" alt="d">`;
    const { writeAsset, readSvg } = makeFakeStore();
    const { markdown: externalized } = await externalizeDiagrams(original, writeAsset);
    expect(externalized).toBe('<img src="./note.drawio.1.svg" alt="d">');
    expect(await inlineDiagrams(externalized, readSvg)).toBe(original);
  });
});

describe("externalize guards", () => {
  it("leaves diagram data URLs inside code fences untouched", async () => {
    const original = ["```", `![x](${drawioDataUrl})`, "```", ""].join("\n");
    const { writeAsset } = makeFakeStore();
    const { markdown, usedNames } = await externalizeDiagrams(original, writeAsset);
    expect(markdown).toBe(original);
    expect(usedNames.size).toBe(0);
  });

  it("leaves non-diagram images untouched", async () => {
    const original = "![photo](data:image/png;base64,AAAA) and ![real](logo.png)";
    const { writeAsset } = makeFakeStore();
    const { markdown, usedNames } = await externalizeDiagrams(original, writeAsset);
    expect(markdown).toBe(original);
    expect(usedNames.size).toBe(0);
  });

  it("does not externalize non-base64 (percent-encoded) diagram data URLs", async () => {
    const original = `![d](data:image/svg+xml,${encodeURIComponent(drawioSvg)})`;
    const { writeAsset } = makeFakeStore();
    const { markdown, usedNames } = await externalizeDiagrams(original, writeAsset);
    expect(markdown).toBe(original);
    expect(usedNames.size).toBe(0);
  });
});

describe("inline guards", () => {
  it("leaves non-diagram local .svg references untouched", async () => {
    const original = "![logo](./logo.svg)";
    const inlined = await inlineDiagrams(original, async () => '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');
    expect(inlined).toBe(original);
  });

  it("leaves references untouched when the file cannot be read", async () => {
    const original = "![d](./missing.svg)";
    const inlined = await inlineDiagrams(original, async () => null);
    expect(inlined).toBe(original);
  });
});
