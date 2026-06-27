import { describe, expect, it } from "vitest";
import { findOpaqueBounds } from "./pngCrop";

// Build an RGBA array (w*h*4) and set the given pixels fully opaque.
function makeRgba(width: number, height: number, opaque: Array<[number, number]>, alpha = 255): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (const [x, y] of opaque) {
    rgba[(y * width + x) * 4 + 3] = alpha;
  }
  return rgba;
}

describe("findOpaqueBounds", () => {
  it("returns the bounding box of opaque pixels", () => {
    // 5x5, opaque pixels at (1,2) and (3,3) → box from (1,2) to (3,3)
    const rgba = makeRgba(5, 5, [[1, 2], [3, 3]]);
    expect(findOpaqueBounds(rgba, 5, 5)).toEqual({ x: 1, y: 2, width: 3, height: 2 });
  });

  it("returns a 1x1 box for a single opaque pixel", () => {
    expect(findOpaqueBounds(makeRgba(4, 4, [[2, 1]]), 4, 4)).toEqual({ x: 2, y: 1, width: 1, height: 1 });
  });

  it("returns null when every pixel is transparent", () => {
    expect(findOpaqueBounds(new Uint8ClampedArray(4 * 4 * 4), 4, 4)).toBeNull();
  });

  it("ignores pixels at or below the alpha threshold", () => {
    // alpha 8 is below the default threshold (10) → treated as empty
    expect(findOpaqueBounds(makeRgba(3, 3, [[1, 1]], 8), 3, 3)).toBeNull();
    expect(findOpaqueBounds(makeRgba(3, 3, [[1, 1]], 8), 3, 3, 4)).toEqual({ x: 1, y: 1, width: 1, height: 1 });
  });
});
