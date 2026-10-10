import types from "../../electron/documentFileTypes.json";

const basename = (name: string) => name.split(/[\\/]/).pop()!.toLowerCase();
export function isMarkdownFilename(name: string): boolean {
  return types.markdown.some(extension => basename(name).endsWith(extension));
}
/** Shared file types for native opens, the folder tree, and drops. Reads still validate UTF-8. */
export function isOpenableDocumentFilename(name: string): boolean {
  const lower = basename(name);
  return isMarkdownFilename(lower) || types.text.some(extension => lower.endsWith(extension)) || types.names.includes(lower) || lower.startsWith(".env.");
}
