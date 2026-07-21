import { describe, expect, it } from "vitest";
import {
  EMPTY_IMAGE_CROP,
  imageCropSourceRectangle,
  isCroppableRasterSource,
  setImageCropEdge
} from "./imageCrop";

describe("image cropping", () => {
  it("converts percentage insets into exact source pixels", () => {
    expect(
      imageCropSourceRectangle(1000, 800, { left: 10, top: 5, right: 20, bottom: 15 })
    ).toEqual({ x: 100, y: 40, width: 700, height: 640 });
  });

  it("keeps at least five percent of the image while dragging each edge", () => {
    expect(setImageCropEdge(EMPTY_IMAGE_CROP, "left", 99).left).toBe(95);
    expect(setImageCropEdge({ ...EMPTY_IMAGE_CROP, left: 30 }, "right", 2).right).toBe(65);
    expect(setImageCropEdge(EMPTY_IMAGE_CROP, "top", -5).top).toBe(0);
    expect(setImageCropEdge(EMPTY_IMAGE_CROP, "bottom", 80).bottom).toBe(20);
  });

  it("offers cropping for ordinary images but not SVG diagrams", () => {
    expect(isCroppableRasterSource("data:image/png;base64,ABC")).toBe(true);
    expect(isCroppableRasterSource("https://example.com/photo.webp")).toBe(true);
    expect(isCroppableRasterSource("data:image/svg+xml;base64,ABC")).toBe(false);
    expect(isCroppableRasterSource("diagram.svg?version=2")).toBe(false);
  });
});
