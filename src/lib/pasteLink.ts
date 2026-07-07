// Pure helper for the rich-text "paste a URL over selected text → link" nicety. Kept DOM-free here so
// it can be unit-tested; the Lexical wiring lives in components/editor/pasteLinkPlugin.ts.

/**
 * Detects when pasted clipboard text is a single web URL suitable for wrapping a text selection in a
 * link. Returns the trimmed URL for a lone `http`/`https` address, or `null` for anything else — prose,
 * multiple whitespace-separated tokens, bare domains without a scheme, or non-web schemes such as
 * `mailto:`, `ftp:`, or `javascript:` — so the caller falls back to a normal paste.
 */
export function extractPastedUrl(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0 || /\s/.test(trimmed)) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  return trimmed;
}
