/**
 * Pure, editor-independent helpers for Nexus's drawio diagram support.
 *
 * A drawio diagram is stored in the document as a perfectly ordinary Markdown image whose source
 * is a `data:image/svg+xml` URL — so every other Markdown tool just shows the picture, satisfying
 * the "falls back to an image everywhere" requirement. What makes it *editable* inside Nexus is
 * that drawio's "Editable SVG" export embeds the diagram's source XML (`<mxfile>` / the older
 * `<mxGraphModel>`) in the root `<svg>` element's `content` attribute (HTML-attribute-escaped).
 * These helpers detect such an image and pull the XML back out so the diagram can be reopened in
 * the editor — no new Markdown syntax, no sidecar data, a single self-describing source of truth.
 *
 * Deliberately free of DOM and Electron dependencies so the encode/decode/detect logic can be
 * unit-tested in Node (mirrors the pure-helper style of `imagePaste.ts`). `atob`/`btoa` and
 * `TextEncoder`/`TextDecoder` are available both in the browser renderer and in the Node test
 * runner, and the encode/decode here is UTF-8 safe so diagrams with non-Latin text round-trip.
 */

const SVG_DATA_URL_PREFIX = "data:image/svg+xml";

// drawio editable SVGs carry their source as `<mxfile …>` (the modern wrapper) or, for older
// single-page diagrams, a bare `<mxGraphModel …>`. Either marks the SVG as drawio-editable.
const DRAWIO_XML_SIGNATURE = /<mxfile[\s>]|<mxGraphModel[\s>]/;

/**
 * True when `url` is a drawio *editable* SVG data URL — an `data:image/svg+xml` image whose SVG
 * carries embedded `<mxfile>`/`<mxGraphModel>` source. The cheap prefix check short-circuits every
 * non-SVG image (raster data URLs, `file:`/`http(s)` references) before any decode, so this is safe
 * to call on every image while importing a document; a plain SVG is correctly rejected.
 */
export function isDrawioImageUrl(url: unknown): url is string {
  if (typeof url !== "string" || !url.startsWith(SVG_DATA_URL_PREFIX)) {
    return false;
  }
  return extractDrawioXml(url) !== null;
}

/** True when a raw SVG string is a drawio editable SVG (carries embedded `<mxfile>` source). */
export function isDrawioSvg(svg: string): boolean {
  return extractDrawioXml(svg) !== null;
}

/**
 * Pulls the embedded drawio source XML out of an editable SVG (or its `data:` URL), ready to load
 * back into the drawio editor. Returns `null` when the input is not a drawio editable SVG — no
 * `content` attribute, or one that does not unescape to `<mxfile>`/`<mxGraphModel>`.
 */
export function extractDrawioXml(svgOrDataUrl: string): string | null {
  if (typeof svgOrDataUrl !== "string") {
    return null;
  }
  const svg = svgOrDataUrl.startsWith("data:") ? decodeSvgDataUrl(svgOrDataUrl) : svgOrDataUrl;
  if (svg === null) {
    return null;
  }
  const content = extractContentAttribute(svg);
  if (content === null) {
    return null;
  }
  const xml = unescapeHtml(content);
  return DRAWIO_XML_SIGNATURE.test(xml) ? xml : null;
}

/**
 * Embeds (or replaces) the drawio source XML in an SVG's root `content` attribute, producing an
 * editable SVG. drawio's own `xmlsvg` export already does this, so this is a fallback/robustness
 * helper (and the inverse of {@link extractDrawioXml} for tests).
 */
export function embedDrawioXml(svg: string, xml: string): string {
  const escaped = escapeHtmlAttribute(xml);
  if (/<svg\b[^>]*?\bcontent=(?:"[^"]*"|'[^']*')/i.test(svg)) {
    return svg.replace(/(<svg\b[^>]*?\bcontent=)(?:"[^"]*"|'[^']*')/i, `$1"${escaped}"`);
  }
  return svg.replace(/<svg\b/i, `<svg content="${escaped}"`);
}

/** Wraps an SVG string in a base64 `data:image/svg+xml` URL suitable for a Markdown image `src`. */
export function buildDrawioImageDataUrl(svg: string): string {
  return `${SVG_DATA_URL_PREFIX};base64,${utf8ToBase64(svg)}`;
}

/**
 * Reads the `content` attribute off the first `<svg …>` tag. drawio double-quotes the value and
 * escapes any inner quote as `&quot;`, so a quote-delimited match never terminates early; the
 * single-quote branch is just defensive against hand-edited SVGs.
 */
function extractContentAttribute(svg: string): string | null {
  const match = /<svg\b[^>]*?\bcontent=(?:"([^"]*)"|'([^']*)')/i.exec(svg);
  if (!match) {
    return null;
  }
  return match[1] ?? match[2] ?? null;
}

function decodeSvgDataUrl(url: string): string | null {
  const comma = url.indexOf(",");
  if (comma === -1) {
    return null;
  }
  const meta = url.slice("data:".length, comma);
  const payload = url.slice(comma + 1);
  try {
    return /;base64/i.test(meta) ? base64ToUtf8(payload) : decodeURIComponent(payload);
  } catch {
    return null;
  }
}

function unescapeHtml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#0*39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    // `&amp;` last so a literal "&lt;" written as "&amp;lt;" is not double-decoded.
    .replace(/&amp;/g, "&");
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function base64ToUtf8(base64: string): string {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
