// Shared logic for pasting (and dropping) an image straight from the clipboard into the document as
// an embedded base64 image. Both editor modes use this: the rich-text image plugin's upload handler
// and the source-mode CodeMirror paste handler (see components/editor/sourceImagePaste.ts). Keeping
// the decision/markdown helpers pure here lets them be unit-tested without a DOM.

const IMAGE_MARKDOWN_SEPARATOR = "\n";

/**
 * Returns true when every item in a clipboard/drag payload is image data. We mirror the rich-text
 * image plugin's own behavior: a mixed payload — e.g. an image copied from a web page that also
 * carries `text/html` — should paste as text, so only a pure-image payload counts as an image paste.
 */
export function isImageOnlyPayload(itemTypes: readonly string[]): boolean {
  if (itemTypes.length === 0) {
    return false;
  }

  return itemTypes.every((type) => type.includes("image"));
}

/**
 * Pulls the image File objects out of a clipboard/drag payload, but only when the whole payload is
 * image data (see isImageOnlyPayload). Returns an empty array otherwise so the caller can fall back
 * to the editor's normal paste handling.
 */
export function getPasteImageFiles(dataTransfer: DataTransfer | null): File[] {
  const items = dataTransfer ? Array.from(dataTransfer.items) : [];

  if (!isImageOnlyPayload(items.map((item) => item.type))) {
    return [];
  }

  return items
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
}

/** Builds the markdown for a single embedded image, e.g. `![alt](data:image/png;base64,...)`. */
export function buildImageMarkdown(dataUrl: string, altText = ""): string {
  return `![${altText}](${dataUrl})`;
}

/** Joins one or more embedded images into the markdown snippet inserted at the cursor. */
export function buildImagesMarkdown(dataUrls: readonly string[], altText = ""): string {
  return dataUrls.map((dataUrl) => buildImageMarkdown(dataUrl, altText)).join(IMAGE_MARKDOWN_SEPARATOR);
}

/**
 * Reads a pasted/dropped image blob into a base64 `data:` URL so it can be embedded directly in the
 * document without writing a file to disk. The data URL is both what the rich-text image node stores
 * as its `src` and what the source-mode markdown references.
 */
export function readImageFileAsDataUrl(file: Blob | null): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("No image data to read."));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Image could not be read as a data URL."));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image data."));
    reader.readAsDataURL(file);
  });
}
