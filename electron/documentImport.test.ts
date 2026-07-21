import { Buffer } from "node:buffer";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createPdfCanvasFactory,
  prepareDocumentImport,
  resolveImportPaths,
  validateImportPaths
} from "./documentImport.cjs";

function minimalBlankPdf(): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 32 32] /Resources << >> /Contents 4 0 R >>",
    "<< /Length 0 >>\nstream\n\nendstream"
  ];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(source, "ascii"));
    source += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(source, "ascii");
  source += `xref\n0 ${objects.length + 1}\n`;
  source += "0000000000 65535 f \n";
  source += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(source, "ascii");
}

describe("createPdfCanvasFactory", () => {
  it("backs PDF.js document canvases with the real injected canvas module", () => {
    const context = { kind: "2d" };
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => context) };
    const createCanvas = vi.fn(() => canvas);
    const CanvasFactory = createPdfCanvasFactory({ createCanvas });
    const factory = new CanvasFactory();

    const target = factory.create(640, 480);
    expect(createCanvas).toHaveBeenCalledWith(640, 480);
    expect(target).toEqual({ canvas, context });

    factory.reset(target, 320, 240);
    expect(canvas).toMatchObject({ width: 320, height: 240 });

    factory.destroy(target);
    expect(target).toEqual({ canvas: null, context: null });
  });
});

describe("resolveImportPaths", () => {
  it("passes only each selected file path to the path resolver", () => {
    const resolve = vi.fn((filePath: string) => `resolved:${filePath}`);

    expect(resolveImportPaths(["one.png", "two.jpg"], { resolve })).toEqual([
      "resolved:one.png",
      "resolved:two.jpg"
    ]);
    expect(resolve).toHaveBeenNthCalledWith(1, "one.png");
    expect(resolve).toHaveBeenNthCalledWith(2, "two.jpg");
  });
});

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
  it("renders a real textless PDF without selecting unpdf's unavailable canvas mock", async () => {
    const result = await prepareDocumentImport(["scan.pdf"], {
      readFile: async () => minimalBlankPdf()
    });

    expect(result.items).toMatchObject([
      {
        id: "page-1",
        text: "",
        visionImage: { mimeType: "image/png", cropRegions: true }
      }
    ]);
    expect(result.items[0].visionImage.dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("does not load the native PDF canvas module for ordinary image imports", async () => {
    const loadCanvasModule = vi.fn(async () => {
      throw new Error("canvas should not be loaded");
    });

    const result = await prepareDocumentImport(["image.png"], {
      readFile: async () => Buffer.from("image"),
      loadCanvasModule
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].visionImage).toMatchObject({
      mimeType: "image/png",
      alt: "Imported image: image.png"
    });
    expect(loadCanvasModule).not.toHaveBeenCalled();
  });

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
        visionImage: {
          dataUrl: "data:image/png;base64,SCAN",
          alt: "Illustration from sample.pdf, page 2",
          cropRegions: true
        },
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
