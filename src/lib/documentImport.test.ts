import { describe, expect, it } from "vitest";
import { fromMarkdown } from "mdast-util-from-markdown";
import { mdxFromMarkdown } from "mdast-util-mdx";
import { mdxjs } from "micromark-extension-mdxjs";
import {
  buildDocumentImportContent,
  convertDocumentImportMathToFences,
  DOCUMENT_IMPORT_MARKER_PREFIX,
  documentImportMarker,
  mergeDocumentImportImages,
  sanitizeDocumentImportMarkdown,
  type DocumentImportItem
} from "./documentImport";

const items: DocumentImportItem[] = [
  {
    id: "page-1",
    label: "sample.pdf — page 1",
    text: "Heading\nBody",
    embeddedImages: [
      {
        mimeType: "image/png",
        dataUrl: "data:image/png;base64,FIGURE",
        alt: "PDF figure"
      }
    ]
  },
  {
    id: "page-2",
    label: "sample.pdf — page 2",
    text: "",
    visionImage: {
      mimeType: "image/png",
      dataUrl: "data:image/png;base64,SCAN",
      alt: "Rendered PDF page",
      cropRegions: true
    },
    embeddedImages: []
  }
];

describe("buildDocumentImportContent", () => {
  it("assembles ordered text and vision blocks in one request", () => {
    expect(buildDocumentImportContent("Transcribe", items)).toEqual([
      { type: "text", text: "Transcribe" },
      {
        type: "text",
        text: expect.stringContaining(`${documentImportMarker("page-1")}\nSource: sample.pdf — page 1`)
      },
      {
        type: "text",
        text: expect.stringContaining(`${documentImportMarker("page-2")}\nSource: sample.pdf — page 2`)
      },
      { type: "image", mediaType: "image/png", data: "SCAN" }
    ]);
    expect(buildDocumentImportContent("Transcribe", items)[2]).toMatchObject({
      type: "text",
      text: expect.stringContaining("nexus-import-region:page-2:x,y,width,height")
    });
  });
});

describe("mergeDocumentImportImages", () => {
  it("places extracted PDF pictures but never appends the full scanned page", async () => {
    const markdown = [
      documentImportMarker("page-1"),
      "# First page",
      documentImportMarker("page-2"),
      "Second page"
    ].join("\n");

    expect(await mergeDocumentImportImages(markdown, items)).toBe(
      "# First page\n\n![PDF figure](data:image/png;base64,FIGURE)\n\nSecond page"
    );
  });

  it("appends extracted pictures without discarding transcription when markers are missing", async () => {
    expect(await mergeDocumentImportImages("Model omitted markers", items)).toBe(
      "Model omitted markers\n\n![PDF figure](data:image/png;base64,FIGURE)"
    );
  });

  it("removes partial source markers when the model omits another marker", async () => {
    expect(
      await mergeDocumentImportImages(`${documentImportMarker("page-1")}\nOnly one page`, items)
    ).not.toContain(DOCUMENT_IMPORT_MARKER_PREFIX);
  });

  it("keeps a standalone SVG alongside the model's description", async () => {
    const svgItem: DocumentImportItem = {
      id: "image-1",
      label: "diagram.svg",
      text: "",
      visionImage: {
        mimeType: "image/svg+xml",
        dataUrl: "data:image/svg+xml;base64,SVG",
        alt: "Imported image: diagram.svg"
      },
      embeddedImages: []
    };

    expect(
      await mergeDocumentImportImages(
        `${documentImportMarker("image-1")}\nA labeled process diagram.`,
        [svgItem]
      )
    ).toBe(
      "A labeled process diagram.\n\n" +
      "![Imported image: diagram.svg](data:image/svg+xml;base64,SVG)"
    );
  });

  it("does not duplicate a source visual already returned by the model", async () => {
    const markdown = [
      documentImportMarker("page-2"),
      "A scanned worksheet.",
      "![Existing scan](data:image/png;base64,SCAN)"
    ].join("\n");

    expect((await mergeDocumentImportImages(markdown, [items[1]])).match(/base64,SCAN/g)).toHaveLength(1);
  });

  it("replaces a scanned-page region marker with a locally cropped image", async () => {
    let croppedRegion: { x: number; y: number; width: number; height: number } | undefined;
    const cropper = async (_image: unknown, region: typeof croppedRegion) => {
      croppedRegion = region;
      return {
        mimeType: "image/png",
        dataUrl: "data:image/png;base64,CROP",
        alt: JSON.stringify(region)
      };
    };
    const markdown = [
      documentImportMarker("page-2"),
      "*[diagram: a triangle with labeled sides]*",
      "<!-- nexus-import-region:page-2:100,200,300,250 -->"
    ].join("\n");

    const merged = await mergeDocumentImportImages(markdown, [items[1]], cropper);
    expect(merged).toContain("*[diagram: a triangle with labeled sides]*");
    expect(merged).toContain("data:image/png;base64,CROP");
    expect(merged).not.toContain("base64,SCAN");
    expect(merged).not.toContain("nexus-import-region");
    expect(croppedRegion).toEqual({ x: 95.5, y: 196, width: 316.5, height: 258 });
  });
});

describe("sanitizeDocumentImportMarkdown", () => {
  it("converts inline/display TeX to the matching Nexus math forms and neutralizes directives", () => {
    const markdown = [
      "For \\(w\\), choose \\(\\\\frac{4}{w}\\).",
      "A. $x < y$",
      "Display: \\[x^2 + y^2 = z^2\\]",
      ":BC is a geometry label.",
      "Inline code `$notMath$` stays code."
    ].join("\n");

    const converted = convertDocumentImportMathToFences(markdown);
    expect(converted.match(/```math/g)).toHaveLength(1);
    expect(converted).toContain("`math:w`");
    expect(converted).toContain("`math:\\frac{4}{w}`");
    expect(converted).toContain("```math\nx^2 + y^2 = z^2\n```");
    expect(converted).toContain("`$notMath$`");

    const sanitized = sanitizeDocumentImportMarkdown(markdown);
    expect(sanitized).toContain("`math:x < y`");
    expect(sanitized).toContain("&#58;BC");
    expect(() =>
      fromMarkdown(sanitized, {
        extensions: [mdxjs()],
        mdastExtensions: [mdxFromMarkdown()]
      })
    ).not.toThrow();
  });

  it("escapes MDX-significant math and prose without changing code", () => {
    const markdown = [
      "For all nonzero values with w < 2, use \\frac{4}{w}.",
      "",
      "Inline: `<Widget value={x} />`",
      "",
      "```jsx",
      "<Widget value={x} />",
      "```"
    ].join("\n");

    const sanitized = sanitizeDocumentImportMarkdown(markdown);
    expect(sanitized).toBe([
      "For all nonzero values with w &lt; 2, use \\frac&#123;4&#125;&#123;w&#125;.",
      "",
      "Inline: `<Widget value={x} />`",
      "",
      "```jsx",
      "<Widget value={x} />",
      "```"
    ].join("\n"));
    expect(() =>
      fromMarkdown(sanitized, {
        extensions: [mdxjs()],
        mdastExtensions: [mdxFromMarkdown()]
      })
    ).not.toThrow();
  });
});
