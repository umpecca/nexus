// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { assetReplacementChanges, byteSize, listDocumentAssets, replaceDocumentAsset } from "./documentAssets";

describe("document asset inventory", () => {
  it("groups inline, HTML and reference images, ignores code, links and comments", () => {
    const text = ['![One](./a.png "Title")', '![Two](./a.png)', '![Ref][pic]', '[pic]: ./b.png "Other"',
      '<img alt="HTML" data-src="no.png" src="./a.png">', '`![Code](no.png)`',
      '```md\n![Example](no.png)\n```', '[link](no.png)', '<!-- <img src="no.png"> -->'].join("\n\n");
    const assets = listDocumentAssets(text);
    expect(assets.map(asset => asset.source)).toEqual(["./a.png", "./b.png"]);
    expect(assets[0].occurrences).toHaveLength(3);
    const result = replaceDocumentAsset(text, assets[0], "./new%20photo.png");
    expect(result).toContain('![One](./new%20photo.png "Title")');
    expect(result).toContain('data-src="no.png" src="./new%20photo.png"');
    expect(result).toContain('![Example](no.png)');
    expect(replaceDocumentAsset(text, assets[1], "data:image/png;base64,AAAA")).toContain('[pic]: data\\:image/png;base64,AAAA "Other"');
  });
  it("maps compacted payloads back to exact offsets, including repeated escaped data", () => {
    const payload = "A".repeat(2_000_000);
    const source = `data:image/png;base64,${payload}`;
    const text = `![é](data\\:image/png;base64,${payload})\n\n![again](${source})\n\n![last](last.png)`;
    const assets = listDocumentAssets(text);
    expect(assets[0].source).toBe(source);
    expect(assets[0].occurrences).toHaveLength(2);
    expect(assets[0].sourceBytes).toBe(byteSize(source) * 2 + 1);
    expect(text.slice(assets[1].occurrences[0].from, assets[1].occurrences[0].to)).toBe("last.png");
    expect(replaceDocumentAsset(text, assets[0], "./x.png")).toBe('![é](./x.png)\n\n![again](./x.png)\n\n![last](last.png)');
  });
  it("handles escaped punctuation, entities, angle destinations and parenthesis paths", () => {
    const text = '![a](<images/a b.png> "Title")\n\n![b](a\\(b\\).png)\n\n![c](a(b).png)\n\n![d](x&amp;y.png)\n\n<img src="x&amp;y.png">';
    const assets = listDocumentAssets(text);
    expect(assets.map(asset => asset.source)).toEqual(["images/a b.png", "a(b).png", "x&y.png"]);
    expect(assets[1].occurrences).toHaveLength(2);
    expect(assets[2].occurrences).toHaveLength(2);
    expect(replaceDocumentAsset(text, assets[2], './new?a=1&b="yes"')).toContain('<img src="./new?a=1&amp;b=&quot;yes&quot;">');
    expect(assetReplacementChanges(assets[1], './new (1).png')[0].insert).toBe('./new%20%281%29.png');
  });
  it("uses the first reference definition, and excludes unused or undefined definitions", () => {
    const text = '![One][a]\n\n![Two][a]\n\n[a]: first.png\n[a]: second.png\n[b]: unused.png\n\n![missing][no]';
    expect(listDocumentAssets(text).map(asset => asset.source)).toEqual(["first.png"]);
  });
  it("ignores src-like strings in other HTML attributes", () => {
    const text = `<img alt="Example src='fake.png'" title="src='also-fake.png'" src='real.png'>`;
    const assets = listDocumentAssets(text);
    expect(assets.map(asset => asset.source)).toEqual(["real.png"]);
    expect(replaceDocumentAsset(text, assets[0], "new.png")).toBe(text.replace("src='real.png'", "src='new.png'"));
  });
});
