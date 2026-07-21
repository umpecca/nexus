import type { AiContentBlock } from "./ai/providers";

export const DOCUMENT_IMPORT_MARKER_PREFIX = "nexus-import-item";

export type DocumentImportImage = {
  mimeType: string;
  dataUrl: string;
  alt?: string;
  cropRegions?: boolean;
};

export type DocumentImportRegion = { x: number; y: number; width: number; height: number };
export type DocumentImportCropper = (
  image: DocumentImportImage,
  region: DocumentImportRegion
) => Promise<DocumentImportImage>;

export type DocumentImportItem = {
  id: string;
  label: string;
  text: string;
  visionImage?: DocumentImportImage;
  embeddedImages: DocumentImportImage[];
};

function dataUrlBase64(image: DocumentImportImage): string {
  const comma = image.dataUrl.indexOf(",");
  return comma >= 0 ? image.dataUrl.slice(comma + 1) : "";
}

export function documentImportMarker(id: string): string {
  return `<!-- ${DOCUMENT_IMPORT_MARKER_PREFIX}:${id} -->`;
}

function convertMathSegment(segment: string): string {
  const inlineCode: string[] = [];
  const protectedSegment = segment.replace(/(`+)([\s\S]*?)\1/g, (code) => {
    const token = `\uE000nexus-inline-code-${inlineCode.length}\uE001`;
    inlineCode.push(code);
    return token;
  });
  const converted = protectedSegment.replace(
    /\\+\[([\s\S]*?)\\+\]|\\+\(([\s\S]*?)\\+\)|\$\$([\s\S]*?)\$\$|\$([^$\n]+?)\$/g,
    (_match, bracketMath, parenthesisMath, displayMath, dollarMath) => {
      const formula = String(bracketMath ?? parenthesisMath ?? displayMath ?? dollarMath ?? "")
        .trim()
        .replace(/\\\\/g, "\\");
      if (!formula) return "";
      if (bracketMath !== undefined || displayMath !== undefined) {
        return `\n\n\`\`\`math\n${formula}\n\`\`\`\n\n`;
      }
      return `\`math:${formula}\``;
    }
  );
  return converted.replace(/\uE000nexus-inline-code-(\d+)\uE001/g, (_token, index) => {
    return inlineCode[Number(index)] ?? "";
  });
}

/** Convert inline TeX to `math:` code spans and display TeX to fenced Nexus math blocks. */
export function convertDocumentImportMathToFences(markdown: string): string {
  const output: string[] = [];
  let prose: string[] = [];
  let fenceCharacter = "";
  let fenceLength = 0;
  const flushProse = () => {
    if (prose.length > 0) output.push(convertMathSegment(prose.join("\n")));
    prose = [];
  };

  for (const line of markdown.split("\n")) {
    const fence = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fenceCharacter) {
      output.push(line);
      if (fence && fence[1][0] === fenceCharacter && fence[1].length >= fenceLength) {
        fenceCharacter = "";
        fenceLength = 0;
      }
      continue;
    }
    if (fence) {
      flushProse();
      output.push(line);
      fenceCharacter = fence[1][0];
      fenceLength = fence[1].length;
      continue;
    }
    prose.push(line);
  }
  flushProse();
  return output.join("\n");
}

function escapeMdxOutsideInlineCode(line: string): string {
  let output = "";
  let codeDelimiterLength = 0;
  for (let index = 0; index < line.length;) {
    if (line[index] === "`") {
      let end = index + 1;
      while (line[end] === "`") end += 1;
      const runLength = end - index;
      if (codeDelimiterLength === 0) codeDelimiterLength = runLength;
      else if (runLength === codeDelimiterLength) codeDelimiterLength = 0;
      output += line.slice(index, end);
      index = end;
      continue;
    }

    const character = line[index];
    if (codeDelimiterLength === 0 && character === "<") output += "&lt;";
    else if (codeDelimiterLength === 0 && character === "{") output += "&#123;";
    else if (codeDelimiterLength === 0 && character === "}") output += "&#125;";
    else if (
      codeDelimiterLength === 0 &&
      character === ":" &&
      /[A-Za-z_$]/.test(line[index + 1] ?? "")
    ) output += "&#58;";
    else output += character;
    index += 1;
  }
  return output;
}

/**
 * Imported model output is data, not executable MDX. Escape JSX/expression delimiters in prose and
 * math so a less-than sign or LaTeX braces cannot make the rich-text parser reject the document.
 * Code remains byte-for-byte intact because those characters are meaningful inside examples.
 */
export function sanitizeDocumentImportMarkdown(markdown: string): string {
  const markdownWithMathFences = convertDocumentImportMathToFences(markdown);
  let fenceCharacter = "";
  let fenceLength = 0;
  return markdownWithMathFences
    .split("\n")
    .map((line) => {
      const fence = line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if (fenceCharacter) {
        if (fence && fence[1][0] === fenceCharacter && fence[1].length >= fenceLength) {
          fenceCharacter = "";
          fenceLength = 0;
        }
        return line;
      }
      if (fence) {
        fenceCharacter = fence[1][0];
        fenceLength = fence[1].length;
        return line;
      }
      return escapeMdxOutsideInlineCode(line);
    })
    .join("\n");
}

/** Build one ordered multimodal request for every selected image/PDF page. */
export function buildDocumentImportContent(
  instruction: string,
  items: DocumentImportItem[]
): AiContentBlock[] {
  const blocks: AiContentBlock[] = [{ type: "text", text: instruction }];

  for (const item of items) {
    const marker = documentImportMarker(item.id);
    const source = item.text
      ? `Format this locally extracted PDF text as faithful Markdown:\n\n${item.text}`
      : "Transcribe the attached source image faithfully.";
    blocks.push({
      type: "text",
      text: [
        `\n\nBegin this source with the exact marker ${marker}`,
        `Source: ${item.label}`,
        source,
        item.visionImage?.cropRegions
          ? `For every pictorial region (photo, illustration, chart, or diagram), write its italic ` +
            `description and immediately follow it with exactly ` +
            `<!-- nexus-import-region:${item.id}:x,y,width,height -->, replacing x, y, width, and ` +
            `height with that region's bounding box on a 0-to-1000 coordinate grid. Exclude ` +
            `surrounding page text, but include a small whitespace margin around the complete artwork ` +
            `so strokes, arrowheads, and labels are not clipped. Do not emit a region marker for ` +
            `text, tables, or math.`
          : ""
      ].filter(Boolean).join("\n")
    });
    if (item.visionImage) {
      const data = dataUrlBase64(item.visionImage);
      if (data) {
        blocks.push({ type: "image", mediaType: item.visionImage.mimeType, data });
      }
    }
  }

  return blocks;
}

function markdownImage(image: DocumentImportImage): string {
  const alt = (image.alt ?? "Extracted image").replaceAll("[", "").replaceAll("]", "");
  return `![${alt}](${image.dataUrl})`;
}

function sourceImages(item: DocumentImportItem): DocumentImportImage[] {
  return [
    ...item.embeddedImages,
    ...(item.visionImage && !item.visionImage.cropRegions ? [item.visionImage] : [])
  ];
}

function missingMarkdownImages(
  images: DocumentImportImage[],
  existingMarkdown: string,
  emittedDataUrls: Set<string>
): string {
  return images
    .filter((image) => {
      if (!image.dataUrl || existingMarkdown.includes(image.dataUrl) || emittedDataUrls.has(image.dataUrl)) {
        return false;
      }
      emittedDataUrls.add(image.dataUrl);
      return true;
    })
    .map(markdownImage)
    .join("\n\n");
}

/** Crop one model-identified region from a rendered page using normalized 0-1000 coordinates. */
export async function cropDocumentImportImage(
  image: DocumentImportImage,
  region: DocumentImportRegion
): Promise<DocumentImportImage> {
  const response = await fetch(image.dataUrl);
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const sourceX = Math.round((region.x / 1000) * bitmap.width);
    const sourceY = Math.round((region.y / 1000) * bitmap.height);
    const sourceWidth = Math.max(1, Math.round((region.width / 1000) * bitmap.width));
    const sourceHeight = Math.max(1, Math.round((region.height / 1000) * bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(sourceWidth, bitmap.width - sourceX);
    canvas.height = Math.min(sourceHeight, bitmap.height - sourceY);
    const context = canvas.getContext("2d");
    if (!context || canvas.width <= 0 || canvas.height <= 0) {
      throw new Error("The requested image region is outside the rendered page.");
    }
    context.drawImage(
      bitmap,
      sourceX,
      sourceY,
      canvas.width,
      canvas.height,
      0,
      0,
      canvas.width,
      canvas.height
    );
    return { mimeType: "image/png", dataUrl: canvas.toDataURL("image/png"), alt: image.alt };
  } finally {
    bitmap.close();
  }
}

const IMPORT_REGION_PATTERN =
  /<!--\s*nexus-import-region:([^:\s>]+):([\d.]+),([\d.]+),([\d.]+),([\d.]+)\s*-->/g;

function validRegion(values: number[]): DocumentImportRegion | null {
  const [x, y, width, height] = values;
  if (
    values.some((value) => !Number.isFinite(value)) ||
    x < 0 || y < 0 || width <= 0 || height <= 0 ||
    x + width > 1000 || y + height > 1000
  ) return null;
  return { x, y, width, height };
}

function addCropBleed(region: DocumentImportRegion): DocumentImportRegion {
  const left = Math.max(4, region.width * 0.015);
  const right = Math.max(12, region.width * 0.04);
  const vertical = Math.max(4, region.height * 0.015);
  const x = Math.max(0, region.x - left);
  const y = Math.max(0, region.y - vertical);
  const rightEdge = Math.min(1000, region.x + region.width + right);
  const bottomEdge = Math.min(1000, region.y + region.height + vertical);
  return { x, y, width: rightEdge - x, height: bottomEdge - y };
}

async function replaceRegionMarkers(
  transcription: string,
  item: DocumentImportItem,
  cropper: DocumentImportCropper,
  removeUnmatched = true
): Promise<string> {
  const matches = [...transcription.matchAll(IMPORT_REGION_PATTERN)];
  let output = transcription;
  let regionIndex = 0;
  for (const match of matches) {
    let replacement = "";
    if (match[1] === item.id && item.visionImage?.cropRegions) {
      const region = validRegion(match.slice(2).map(Number));
      if (region) {
        regionIndex += 1;
        try {
          // Vision bounds are often tight. A modest bleed, weighted toward the right edge, keeps
          // labels and arrowheads intact without pulling much surrounding page text into the crop.
          const cropped = await cropper(item.visionImage, addCropBleed(region));
          replacement = markdownImage({
            ...cropped,
            alt: `${item.visionImage.alt ?? "Imported illustration"}, region ${regionIndex}`
          });
        } catch {
          // Keep the transcription when a malformed model coordinate cannot be cropped.
        }
      }
    }
    output = output.replace(match[0], replacement);
  }
  return (removeUnmatched
    ? output.replace(/<!--\s*nexus-import-region:[^>]*-->/g, "")
    : output
  ).trim();
}

/**
 * Attach original standalone/embedded images and replace scanned-page region markers with locally
 * cropped PNGs. The full scanned page is model input only and is never inserted into the document.
 */
export async function mergeDocumentImportImages(
  markdown: string,
  items: DocumentImportItem[],
  cropper: DocumentImportCropper = cropDocumentImportImage
): Promise<string> {
  const allMarkersPresent = items.every((item) => markdown.includes(documentImportMarker(item.id)));
  const emittedDataUrls = new Set<string>();

  if (!allMarkersPresent) {
    let withoutMarkers = markdown.replace(/<!--\s*nexus-import-item:[^>]*-->/g, "").trim();
    for (const item of items) {
      withoutMarkers = await replaceRegionMarkers(withoutMarkers, item, cropper, false);
    }
    withoutMarkers = withoutMarkers.replace(/<!--\s*nexus-import-region:[^>]*-->/g, "").trim();
    const images = missingMarkdownImages(
      items.flatMap(sourceImages),
      withoutMarkers,
      emittedDataUrls
    );
    return [withoutMarkers, images].filter(Boolean).join("\n\n");
  }

  const sections: string[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const marker = documentImportMarker(item.id);
    const start = markdown.indexOf(marker) + marker.length;
    const nextMarker = items[index + 1] ? documentImportMarker(items[index + 1].id) : null;
    const end = nextMarker ? markdown.indexOf(nextMarker, start) : markdown.length;
    const transcription = await replaceRegionMarkers(markdown.slice(start, end).trim(), item, cropper);
    const images = missingMarkdownImages(sourceImages(item), markdown, emittedDataUrls);
    sections.push([transcription, images].filter(Boolean).join("\n\n"));
  }
  return sections.filter(Boolean).join("\n\n");
}
