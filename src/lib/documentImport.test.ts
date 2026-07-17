import { describe, expect, it } from "vitest";
import {
  buildDocumentImportContent,
  documentImportMarker,
  mergeDocumentImportImages,
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
    visionImage: { mimeType: "image/png", dataUrl: "data:image/png;base64,SCAN" },
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
  });
});

describe("mergeDocumentImportImages", () => {
  it("places extracted PDF pictures with their marked page and removes markers", () => {
    const markdown = [
      documentImportMarker("page-1"),
      "# First page",
      documentImportMarker("page-2"),
      "Second page"
    ].join("\n");

    expect(mergeDocumentImportImages(markdown, items)).toBe(
      "# First page\n\n![PDF figure](data:image/png;base64,FIGURE)\n\nSecond page"
    );
  });

  it("appends extracted pictures without discarding transcription when markers are missing", () => {
    expect(mergeDocumentImportImages("Model omitted markers", items)).toBe(
      "Model omitted markers\n\n![PDF figure](data:image/png;base64,FIGURE)"
    );
  });
});
