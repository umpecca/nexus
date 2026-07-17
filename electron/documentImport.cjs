const path = require("node:path");

const MAX_IMPORT_ITEMS = 20;
const MAX_PDF_BYTES = 50 * 1024 * 1024;
const MAX_SOURCE_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_VISION_BYTES = 20 * 1024 * 1024;
const MAX_EMBEDDED_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_EMBEDDED_IMAGE_BYTES = 20 * 1024 * 1024;
const MIN_EMBEDDED_IMAGE_PIXELS = 64 * 64;

const imageMimeTypes = new Map([
  [".bmp", "image/bmp"],
  [".gif", "image/gif"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"]
]);

function decodedDataUrlBytes(dataUrl) {
  const comma = typeof dataUrl === "string" ? dataUrl.indexOf(",") : -1;
  if (comma < 0) {
    return 0;
  }
  return Math.floor((dataUrl.length - comma - 1) * 0.75);
}

function validateImportPaths(filePaths) {
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    return "Choose a PDF or one or more images.";
  }
  if (filePaths.length > MAX_IMPORT_ITEMS) {
    return `Choose no more than ${MAX_IMPORT_ITEMS} images at once.`;
  }

  const extensions = filePaths.map((filePath) => path.extname(filePath).toLowerCase());
  const pdfCount = extensions.filter((extension) => extension === ".pdf").length;
  if (pdfCount > 0 && filePaths.length !== 1) {
    return "Choose either one PDF or one or more images, not a mixture.";
  }
  if (pdfCount === 0 && extensions.some((extension) => !imageMimeTypes.has(extension))) {
    return "Only PDF, PNG, JPEG, GIF, WebP, BMP, and SVG files can be imported.";
  }
  return null;
}

function rawImageToPngDataUrl(image, canvasModule) {
  const { width, height, channels, data } = image;
  const canvas = canvasModule.createCanvas(width, height);
  const context = canvas.getContext("2d");
  const imageData = context.createImageData(width, height);

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const source = pixel * channels;
    const target = pixel * 4;
    if (channels === 1) {
      imageData.data[target] = data[source];
      imageData.data[target + 1] = data[source];
      imageData.data[target + 2] = data[source];
      imageData.data[target + 3] = 255;
    } else {
      imageData.data[target] = data[source];
      imageData.data[target + 1] = data[source + 1];
      imageData.data[target + 2] = data[source + 2];
      imageData.data[target + 3] = channels === 4 ? data[source + 3] : 255;
    }
  }

  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

async function prepareImageFiles(filePaths, dependencies) {
  const items = [];
  let totalBytes = 0;

  for (let index = 0; index < filePaths.length; index += 1) {
    const filePath = filePaths[index];
    const data = await dependencies.readFile(filePath);
    if (data.length > MAX_SOURCE_IMAGE_BYTES) {
      throw new Error(`${path.basename(filePath)} is larger than the 8 MB per-image limit.`);
    }
    totalBytes += data.length;
    if (totalBytes > MAX_TOTAL_VISION_BYTES) {
      throw new Error("The selected images exceed the 20 MB combined import limit.");
    }
    const mimeType = imageMimeTypes.get(path.extname(filePath).toLowerCase());
    items.push({
      id: `image-${index + 1}`,
      label: path.basename(filePath),
      text: "",
      visionImage: { mimeType, dataUrl: `data:${mimeType};base64,${data.toString("base64")}` },
      embeddedImages: []
    });
  }

  return { items, warnings: [] };
}

async function preparePdfFile(filePath, dependencies) {
  const data = await dependencies.readFile(filePath);
  if (data.length > MAX_PDF_BYTES) {
    throw new Error("That PDF is larger than the 50 MB import limit.");
  }

  const pdf = await dependencies.getDocumentProxy(new Uint8Array(data));
  const warnings = [];
  try {
    const totalPages = Number(pdf.numPages) || 0;
    if (totalPages === 0) {
      throw new Error("That PDF has no readable pages.");
    }
    if (totalPages > MAX_IMPORT_ITEMS) {
      throw new Error(`That PDF has ${totalPages} pages; the import limit is ${MAX_IMPORT_ITEMS}.`);
    }

    const extracted = await dependencies.extractText(pdf);
    const pageTexts = Array.isArray(extracted.text) ? extracted.text : [];
    const items = [];
    let totalVisionBytes = 0;
    let totalEmbeddedBytes = 0;

    for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
      const pageNumber = pageIndex + 1;
      const text = String(pageTexts[pageIndex] ?? "").trim();
      const embeddedImages = [];
      let visionImage;

      if (text) {
        const images = await dependencies.extractImages(pdf, pageNumber);
        const seenKeys = new Set();
        for (const image of images) {
          if (
            seenKeys.has(image.key) ||
            image.width * image.height < MIN_EMBEDDED_IMAGE_PIXELS
          ) {
            continue;
          }
          seenKeys.add(image.key);
          const dataUrl = dependencies.encodeRawImage(image);
          const bytes = decodedDataUrlBytes(dataUrl);
          if (
            bytes > MAX_EMBEDDED_IMAGE_BYTES ||
            totalEmbeddedBytes + bytes > MAX_TOTAL_EMBEDDED_IMAGE_BYTES
          ) {
            warnings.push(`Skipped an oversized embedded image on PDF page ${pageNumber}.`);
            continue;
          }
          totalEmbeddedBytes += bytes;
          embeddedImages.push({
            mimeType: "image/png",
            dataUrl,
            alt: `Extracted image from ${path.basename(filePath)}, page ${pageNumber}`
          });
        }
      } else {
        const dataUrl = await dependencies.renderPageAsImage(pdf, pageNumber, {
          canvasImport: dependencies.canvasImport,
          width: 1600,
          toDataURL: true
        });
        const bytes = decodedDataUrlBytes(dataUrl);
        if (bytes > MAX_SOURCE_IMAGE_BYTES || totalVisionBytes + bytes > MAX_TOTAL_VISION_BYTES) {
          throw new Error(`Rendered PDF page ${pageNumber} exceeds the vision import size limit.`);
        }
        totalVisionBytes += bytes;
        visionImage = { mimeType: "image/png", dataUrl };
      }

      items.push({
        id: `page-${pageNumber}`,
        label: `${path.basename(filePath)} — page ${pageNumber}`,
        text,
        visionImage,
        embeddedImages
      });
    }

    return { items, warnings };
  } finally {
    await pdf.destroy?.();
  }
}

async function prepareDocumentImport(filePaths, injectedDependencies = {}) {
  const validationError = validateImportPaths(filePaths);
  if (validationError) {
    throw new Error(validationError);
  }

  const fs = require("node:fs/promises");
  const unpdf = require("unpdf");
  const canvasModule = require("@napi-rs/canvas");
  const dependencies = {
    readFile: fs.readFile,
    getDocumentProxy: unpdf.getDocumentProxy,
    extractText: unpdf.extractText,
    extractImages: unpdf.extractImages,
    renderPageAsImage: unpdf.renderPageAsImage,
    canvasImport: async () => canvasModule,
    encodeRawImage: (image) => rawImageToPngDataUrl(image, canvasModule),
    ...injectedDependencies
  };

  return path.extname(filePaths[0]).toLowerCase() === ".pdf"
    ? preparePdfFile(filePaths[0], dependencies)
    : prepareImageFiles(filePaths, dependencies);
}

module.exports = {
  MAX_IMPORT_ITEMS,
  decodedDataUrlBytes,
  validateImportPaths,
  rawImageToPngDataUrl,
  prepareDocumentImport
};
