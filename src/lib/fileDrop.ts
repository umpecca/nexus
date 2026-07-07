// Pure helper for the "drag a Markdown file onto the window to open it" feature. The DataTransfer /
// Electron plumbing lives in App.tsx; the extension check is isolated here so it can be unit-tested.

/**
 * File extensions Nexus opens as a document. Kept in sync by hand with the main process'
 * `openableFileExtensions` (electron/main.cjs) and the open-dialog `markdownFilters`.
 */
const OPENABLE_DOCUMENT_EXTENSIONS = [".md", ".markdown", ".mdx", ".txt"];

/** True when a dropped file's name has an extension Nexus knows how to open. Case-insensitive. */
export function isOpenableDocumentFilename(name: string): boolean {
  const lower = name.toLowerCase();
  return OPENABLE_DOCUMENT_EXTENSIONS.some((extension) => lower.endsWith(extension));
}
