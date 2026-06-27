/**
 * Pure helpers for reading and changing the *display* size of an SVG-backed diagram image.
 *
 * Both the drawio and isoflow integrations store a diagram as a `data:image/svg+xml` image whose root
 * `<svg>` carries `width`/`height` (+ `viewBox`). The displayed size of an `<img>` of such an SVG is its
 * intrinsic `width`/`height`, so resizing the picture on the page is just rewriting those two attributes —
 * which keeps the document plain Markdown (`![](data:…)`, so the existing import visitors still match) and
 * leaves the embedded source (drawio's `content` / isoflow's `data-isoflow`) and inner content untouched,
 * so the diagram stays re-editable.
 *
 * DOM/Electron-free so it can be unit-tested in Node (mirrors the regex + base64/UTF-8 style of
 * `lib/drawioSvg.ts`).
 */

const SVG_DATA_URL_PREFIX = "data:image/svg+xml";

export interface SvgSize {
  width: number;
  height: number;
}

/**
 * Reads the intended display size of an SVG (or its `data:` URL): the root `<svg>` `width`/`height`, or
 * the `viewBox` extent when those are missing. Returns `null` when no usable size can be determined.
 */
export function getSvgDisplaySize(svgOrDataUrl: string): SvgSize | null {
  const svg = toSvgString(svgOrDataUrl);
  if (svg === null) {
    return null;
  }
  const open = matchSvgOpenTag(svg);
  if (open === null) {
    return null;
  }
  const w = parseLength(getAttr(open, "width"));
  const h = parseLength(getAttr(open, "height"));
  if (w !== null && h !== null && w > 0 && h > 0) {
    return { width: w, height: h };
  }
  const viewBox = getAttr(open, "viewBox");
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      return { width: parts[2], height: parts[3] };
    }
  }
  return null;
}

/**
 * Returns a new `data:image/svg+xml` URL whose root `<svg>` is resized to `width` px wide, preserving the
 * original aspect ratio. Only the root `width`/`height` attributes change — `viewBox`, the embedded source
 * attributes (drawio `content` / isoflow `data-isoflow`) and the inner content are untouched, so
 * re-editing still works. Returns the input unchanged when it is not a sizable SVG data URL.
 */
export function setSvgDisplayWidth(dataUrl: string, width: number): string {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith(SVG_DATA_URL_PREFIX)) {
    return dataUrl;
  }
  const svg = decodeSvgDataUrl(dataUrl);
  if (svg === null) {
    return dataUrl;
  }
  const size = getSvgDisplaySize(svg);
  if (size === null) {
    return dataUrl;
  }
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round((w * size.height) / size.width));
  const open = matchSvgOpenTag(svg);
  if (open === null) {
    return dataUrl;
  }
  const nextOpen = setAttr(setAttr(open, "width", String(w)), "height", String(h));
  return buildSvgDataUrl(svg.replace(open, nextOpen));
}

// --- internals (mirrors lib/drawioSvg.ts) ---

function toSvgString(svgOrDataUrl: string): string | null {
  if (typeof svgOrDataUrl !== "string") {
    return null;
  }
  return svgOrDataUrl.startsWith("data:") ? decodeSvgDataUrl(svgOrDataUrl) : svgOrDataUrl;
}

/** The first `<svg …>` opening tag. Both drawio (`content`) and isoflow (`data-isoflow`) escape any inner
 * `>` so `[^>]*` never terminates early inside an attribute value. */
function matchSvgOpenTag(svg: string): string | null {
  const match = /<svg\b[^>]*>/i.exec(svg);
  return match ? match[0] : null;
}

function getAttr(openTag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`, "i").exec(openTag);
  return match ? match[1] ?? match[2] ?? null : null;
}

function setAttr(openTag: string, name: string, value: string): string {
  const re = new RegExp(`(\\b${name}=)(?:"[^"]*"|'[^']*')`, "i");
  if (re.test(openTag)) {
    return openTag.replace(re, `$1"${value}"`);
  }
  if (/\/>$/.test(openTag)) {
    return openTag.replace(/\/>$/, ` ${name}="${value}"/>`);
  }
  return openTag.replace(/>$/, ` ${name}="${value}">`);
}

function parseLength(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const n = parseFloat(value.replace(/px$/i, "").trim());
  return Number.isFinite(n) ? n : null;
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

function buildSvgDataUrl(svg: string): string {
  return `${SVG_DATA_URL_PREFIX};base64,${utf8ToBase64(svg)}`;
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
