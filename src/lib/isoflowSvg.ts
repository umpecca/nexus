/**
 * Pure, editor-independent helpers for Nexus's isoflow (isometric network diagram) support.
 *
 * Like drawio (see `lib/drawioSvg.ts`), an isoflow diagram is stored in the document as a perfectly
 * ordinary Markdown image whose source is a `data:image/svg+xml` URL — so every other Markdown tool
 * just shows the picture. isoflow is a React component, not a vector exporter, so the picture itself
 * is a PNG snapshot of the rendered diagram wrapped in an `<svg><image …/></svg>`; what makes it
 * *editable* inside Nexus is the diagram's source — isoflow's JSON `Model` — base64-encoded into the
 * root `<svg>` element's `data-isoflow` attribute. A dedicated attribute (rather than drawio's
 * `content`) keeps the two integrations from ever colliding. These helpers detect such an image and
 * pull the model back out so the diagram can be reopened in the isoflow editor — no new Markdown
 * syntax, no sidecar data, a single self-describing source of truth.
 *
 * Deliberately free of DOM, Electron and isoflow imports so the encode/decode/detect logic stays
 * unit-testable in Node and the heavy isoflow bundle is never pulled into the main renderer chunk
 * (only the editor host window imports isoflow). `atob`/`btoa` and `TextEncoder`/`TextDecoder` are
 * available in both the browser renderer and the Node test runner, and the encode/decode here is
 * UTF-8 safe so diagrams with non-Latin labels round-trip.
 */

const SVG_DATA_URL_PREFIX = "data:image/svg+xml";

// isoflow's source model, base64-encoded, lives in this root-<svg> attribute. Distinct from drawio's
// `content` attribute so detection of the two diagram kinds never overlaps.
const ISOFLOW_MODEL_ATTRIBUTE = "data-isoflow";

/**
 * True when `url` is an isoflow *editable* SVG data URL — a `data:image/svg+xml` image whose SVG
 * carries an embedded isoflow model in `data-isoflow`. The cheap prefix check short-circuits every
 * non-SVG image (raster data URLs, `file:`/`http(s)` references) before any decode, so this is safe
 * to call on every image while importing a document; a plain SVG (and a drawio SVG) is rejected.
 */
export function isIsoflowImageUrl(url: unknown): url is string {
  if (typeof url !== "string" || !url.startsWith(SVG_DATA_URL_PREFIX)) {
    return false;
  }
  return extractIsoflowModel(url) !== null;
}

/** True when a raw SVG string is an isoflow editable SVG (carries an embedded isoflow model). */
export function isIsoflowSvg(svg: string): boolean {
  return extractIsoflowModel(svg) !== null;
}

/**
 * Pulls the embedded isoflow `Model` out of an editable SVG (or its `data:` URL), ready to load back
 * into the isoflow editor. Returns the parsed model object, or `null` when the input is not an
 * isoflow editable SVG — no `data-isoflow` attribute, or one that does not base64-decode to JSON with
 * the isoflow shape signature (an object with `items` and `views` arrays).
 */
export function extractIsoflowModel(svgOrDataUrl: string): Record<string, unknown> | null {
  if (typeof svgOrDataUrl !== "string") {
    return null;
  }
  const svg = svgOrDataUrl.startsWith("data:") ? decodeSvgDataUrl(svgOrDataUrl) : svgOrDataUrl;
  if (svg === null) {
    return null;
  }
  const encoded = extractModelAttribute(svg);
  if (encoded === null) {
    return null;
  }
  let model: unknown;
  try {
    model = JSON.parse(base64ToUtf8(unescapeHtml(encoded)));
  } catch {
    return null;
  }
  return isIsoflowModel(model) ? model : null;
}

/**
 * Builds an isoflow editable SVG: a wrapper that renders the diagram's PNG snapshot via an `<image>`
 * and carries the source `model` (JSON-stringified, base64-encoded) in `data-isoflow`. The result is
 * a valid SVG that shows the picture everywhere and reopens in the isoflow editor inside Nexus.
 */
export function buildIsoflowEditableSvg(
  pngDataUrl: string,
  width: number,
  height: number,
  model: unknown
): string {
  const encoded = escapeHtmlAttribute(utf8ToBase64(JSON.stringify(model)));
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" ${ISOFLOW_MODEL_ATTRIBUTE}="${encoded}">` +
    `<image width="${w}" height="${h}" x="0" y="0" preserveAspectRatio="xMidYMid meet" ` +
    `xlink:href="${escapeHtmlAttribute(pngDataUrl)}"/>` +
    `</svg>`
  );
}

/** Wraps an SVG string in a base64 `data:image/svg+xml` URL suitable for a Markdown image `src`. */
export function buildIsoflowImageDataUrl(svg: string): string {
  return `${SVG_DATA_URL_PREFIX};base64,${utf8ToBase64(svg)}`;
}

/** True when `value` looks like an isoflow `Model` (an object with `items` and `views` arrays). */
function isIsoflowModel(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return Array.isArray(record.items) && Array.isArray(record.views);
}

/** Reads the `data-isoflow` attribute off the first `<svg …>` tag (double- or single-quoted). */
function extractModelAttribute(svg: string): string | null {
  const match = new RegExp(
    `<svg\\b[^>]*?\\b${ISOFLOW_MODEL_ATTRIBUTE}=(?:"([^"]*)"|'([^']*)')`,
    "i"
  ).exec(svg);
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
