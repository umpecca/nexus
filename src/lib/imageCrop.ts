export type ImageCropInsets = { left: number; top: number; right: number; bottom: number };

export const EMPTY_IMAGE_CROP: ImageCropInsets = { left: 0, top: 0, right: 0, bottom: 0 };

const MIN_REMAINING_PERCENT = 5;

export function setImageCropEdge(
  crop: ImageCropInsets,
  edge: keyof ImageCropInsets,
  pointerPercent: number
): ImageCropInsets {
  const value = Math.max(0, Math.min(100, pointerPercent));
  if (edge === "left") {
    return { ...crop, left: Math.min(value, 100 - crop.right - MIN_REMAINING_PERCENT) };
  }
  if (edge === "right") {
    return { ...crop, right: Math.min(100 - value, 100 - crop.left - MIN_REMAINING_PERCENT) };
  }
  if (edge === "top") {
    return { ...crop, top: Math.min(value, 100 - crop.bottom - MIN_REMAINING_PERCENT) };
  }
  return { ...crop, bottom: Math.min(100 - value, 100 - crop.top - MIN_REMAINING_PERCENT) };
}

export function imageCropSourceRectangle(
  width: number,
  height: number,
  crop: ImageCropInsets
) {
  const x = Math.round((crop.left / 100) * width);
  const y = Math.round((crop.top / 100) * height);
  const right = Math.round(((100 - crop.right) / 100) * width);
  const bottom = Math.round(((100 - crop.bottom) / 100) * height);
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

export function isCroppableRasterSource(src: string): boolean {
  return !/^data:image\/svg\+xml/i.test(src) && !/\.svg(?:[?#]|$)/i.test(src);
}

export async function cropRasterImage(
  src: string,
  crop: ImageCropInsets
): Promise<string> {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`The image could not be loaded (${response.status}).`);
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const source = imageCropSourceRectangle(bitmap.width, bitmap.height, crop);
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image cropping is not available in this environment.");
    context.drawImage(
      bitmap,
      source.x,
      source.y,
      source.width,
      source.height,
      0,
      0,
      source.width,
      source.height
    );
    return canvas.toDataURL("image/png");
  } finally {
    bitmap.close();
  }
}
