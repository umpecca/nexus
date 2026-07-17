import type { AiContentBlock } from "./ai/providers";

export const DOCUMENT_IMPORT_MARKER_PREFIX = "nexus-import-item";

export type DocumentImportImage = {
  mimeType: string;
  dataUrl: string;
  alt?: string;
};

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
      text: `\n\nBegin this source with the exact marker ${marker}\nSource: ${item.label}\n${source}`
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

/**
 * Remove the model's stable source markers and attach locally extracted PDF pictures to the page
 * they came from. If a model drops markers, keep its transcription intact and append the pictures
 * in source order rather than losing them.
 */
export function mergeDocumentImportImages(markdown: string, items: DocumentImportItem[]): string {
  const allMarkersPresent = items.every((item) => markdown.includes(documentImportMarker(item.id)));

  if (!allMarkersPresent) {
    const images = items.flatMap((item) => item.embeddedImages).map(markdownImage);
    return [markdown.trim(), images.join("\n\n")].filter(Boolean).join("\n\n");
  }

  const sections: string[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const marker = documentImportMarker(item.id);
    const start = markdown.indexOf(marker) + marker.length;
    const nextMarker = items[index + 1] ? documentImportMarker(items[index + 1].id) : null;
    const end = nextMarker ? markdown.indexOf(nextMarker, start) : markdown.length;
    const transcription = markdown.slice(start, end).trim();
    const images = item.embeddedImages.map(markdownImage).join("\n\n");
    sections.push([transcription, images].filter(Boolean).join("\n\n"));
  }
  return sections.filter(Boolean).join("\n\n");
}
