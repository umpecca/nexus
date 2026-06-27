/**
 * Crop a (transparent-background) PNG data URL down to its visible content, with a little padding —
 * used to turn isoflow's editor-canvas-sized snapshot into a tight image of just the diagram.
 *
 * The pixel scan ({@link findOpaqueBounds}) is pure and unit-tested in Node; the canvas glue
 * ({@link cropToContent}) is browser-only (it runs in the isoflow editor host window).
 */

export interface OpaqueBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Bounding box of the pixels whose alpha exceeds `alphaThreshold`, over an RGBA byte array (row-major,
 * length `4 * width * height`). Returns `null` when every pixel is (near-)transparent.
 */
export function findOpaqueBounds(
  rgba: Uint8ClampedArray | Uint8Array | number[],
  width: number,
  height: number,
  alphaThreshold = 10
): OpaqueBounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (rgba[(y * width + x) * 4 + 3] > alphaThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) {
    return null;
  }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Crops `pngDataUrl` to its content bounds plus `padding` px (in source pixels). `scale` is the capture
 * supersampling factor: the cropped PNG keeps the full `scale`× pixels (for crisp upscaling), while the
 * returned `width`/`height` are the 1× *display* dimensions. Falls back to the original image (at 1×
 * size) when it has no opaque content or a canvas is unavailable.
 */
export async function cropToContent(
  pngDataUrl: string,
  options: { padding?: number; scale?: number } = {}
): Promise<{ dataUrl: string; width: number; height: number }> {
  const padding = options.padding ?? 24;
  const scale = options.scale ?? 1;
  const image = await loadImage(pngDataUrl);
  const sw = image.naturalWidth || image.width;
  const sh = image.naturalHeight || image.height;
  const fallback = {
    dataUrl: pngDataUrl,
    width: Math.max(1, Math.round(sw / scale)),
    height: Math.max(1, Math.round(sh / scale))
  };

  const source = document.createElement("canvas");
  source.width = sw;
  source.height = sh;
  const sourceCtx = source.getContext("2d");
  if (!sourceCtx) {
    return fallback;
  }
  sourceCtx.drawImage(image, 0, 0);
  let pixels: ImageData;
  try {
    pixels = sourceCtx.getImageData(0, 0, sw, sh);
  } catch {
    return fallback;
  }
  const bounds = findOpaqueBounds(pixels.data, sw, sh);
  if (!bounds) {
    return fallback;
  }

  const pad = padding * scale;
  const x = Math.max(0, bounds.x - pad);
  const y = Math.max(0, bounds.y - pad);
  const w = Math.min(sw - x, bounds.width + pad * 2);
  const h = Math.min(sh - y, bounds.height + pad * 2);

  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(w));
  out.height = Math.max(1, Math.round(h));
  const outCtx = out.getContext("2d");
  if (!outCtx) {
    return fallback;
  }
  outCtx.drawImage(source, x, y, w, h, 0, 0, out.width, out.height);
  return {
    dataUrl: out.toDataURL("image/png"),
    width: Math.max(1, Math.round(w / scale)),
    height: Math.max(1, Math.round(h / scale))
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}
