import { Buffer } from "node:buffer";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  prepareDocumentImport,
  validateImportPaths
} from "./documentImport.cjs";

describe("validateImportPaths", () => {
  it("accepts one PDF or ordered images", () => {
    expect(validateImportPaths(["sample.pdf"])).toBeNull();
    expect(validateImportPaths(["one.png", "two.jpg"])).toBeNull();
  });

  it("rejects mixed PDF/image selections and unsupported files", () => {
    expect(validateImportPaths(["sample.pdf", "page.png"])).toContain("not a mixture");
    expect(validateImportPaths(["notes.txt"])).toContain("Only PDF");
  });

  it("caps a multi-image selection at 20 files", () => {
    expect(validateImportPaths(Array.from({ length: 21 }, (_, index) => `${index}.png`))).toContain(
      "no more than 20"
    );
  });
});

describe("prepareDocumentImport", () => {
  it("preserves multiple image file order as vision-only sources", async () => {
    const result = await prepareDocumentImport(["two.png", "one.jpg"], {
      readFile: async (filePath: string) => Buffer.from(path.basename(filePath))
    });

    expect(result.items.map((item: { label: string }) => item.label)).toEqual(["two.png", "one.jpg"]);
    expect(result.items.every((item: { embeddedImages: unknown[] }) => item.embeddedImages.length === 0)).toBe(true);
  });

  it("rejects a source image over the per-image byte limit", async () => {
    await expect(
      prepareDocumentImport(["huge.png"], {
        readFile: async () => Buffer.alloc(8 * 1024 * 1024 + 1)
      })
    ).rejects.toThrow("8 MB per-image limit");
  });

  it("uses local text/images for text pages and vision rendering only for scanned pages", async () => {
    const destroy = vi.fn();
    const extractImages = vi.fn(async () => [
      { key: "figure", width: 100, height: 80, channels: 3, data: new Uint8ClampedArray() },
      { key: "tiny", width: 10, height: 10, channels: 3, data: new Uint8ClampedArray() }
    ]);
    const renderPageAsImage = vi.fn(async () => "data:image/png;base64,SCAN");

    const result = await prepareDocumentImport(["sample.pdf"], {
      readFile: async () => Buffer.from("pdf"),
      getDocumentProxy: async () => ({ numPages: 2, destroy }),
      extractText: async () => ({ totalPages: 2, text: ["Selectable text", ""] }),
      extractImages,
      renderPageAsImage,
      encodeRawImage: () => "data:image/png;base64,FIGURE"
    });

    expect(result.items).toMatchObject([
      {
        id: "page-1",
        text: "Selectable text",
        visionImage: undefined,
        embeddedImages: [{ dataUrl: "data:image/png;base64,FIGURE" }]
      },
      {
        id: "page-2",
        text: "",
        visionImage: { dataUrl: "data:image/png;base64,SCAN" },
        embeddedImages: []
      }
    ]);
    expect(extractImages).toHaveBeenCalledTimes(1);
    expect(renderPageAsImage).toHaveBeenCalledWith(
      expect.anything(),
      2,
      expect.objectContaining({ width: 1600, toDataURL: true })
    );
    expect(destroy).toHaveBeenCalledOnce();
  });
});
