/**
 * Optional "diagrams as files" support: transforms that move editable drawio/isoflow diagrams between
 * their inline base64 `data:` URL form (what the editor always holds) and `.svg` sidecar files
 * referenced by relative path (what some external Markdown readers prefer over huge inline base64).
 *
 * The editor stays 100% base64 internally; these run only at the document I/O boundary —
 * `inlineDiagrams` on load (sidecar `.svg` → base64 so the diagram stays editable) and
 * `externalizeDiagrams` on save (base64 → sidecar `.svg`). Both rewrite ONLY the image `src` substring
 * (never re-serializing the document) so a base64 → file → base64 round-trip is byte-identical and never
 * spuriously dirties the buffer. Detection/encoding is reused from `drawioSvg.ts` / `isoflowSvg.ts`; file
 * I/O is injected by the caller (the renderer passes IPC-backed read/write closures).
 */
import { fromMarkdown } from "mdast-util-from-markdown";
import {
  buildDrawioImageDataUrl,
  decodeSvgDataUrl,
  isDrawioImageUrl,
  isDrawioSvg
} from "./drawioSvg";
import { buildIsoflowImageDataUrl, isIsoflowImageUrl, isIsoflowSvg } from "./isoflowSvg";

export type DiagramKind = "drawio" | "isoflow";

/** Classify an image `src` that is a `data:` URL as an editable drawio/isoflow diagram, else null. */
export function classifyEditableDiagram(src: string): DiagramKind | null {
  if (isDrawioImageUrl(src)) {
    return "drawio";
  }
  if (isIsoflowImageUrl(src)) {
    return "isoflow";
  }
  return null;
}

/** Classify raw SVG file text as an editable drawio/isoflow diagram, else null. */
export function classifySvgText(svgText: string): DiagramKind | null {
  if (isDrawioSvg(svgText)) {
    return "drawio";
  }
  if (isIsoflowSvg(svgText)) {
    return "isoflow";
  }
  return null;
}

/** True for a local `.svg` reference (relative or absolute path) — not a data:/http(s)/file/blob URL. */
export function isLocalSvgRef(src: string): boolean {
  if (typeof src !== "string") {
    return false;
  }
  const trimmed = src.trim();
  if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#")) {
    return false;
  }
  if (/^(?:data|https?|file|blob):/i.test(trimmed)) {
    return false;
  }
  const pathPart = trimmed.split(/[?#]/)[0];
  return /\.svg$/i.test(pathPart);
}

type SrcTarget = { start: number; end: number; url: string };

type MdastNode = {
  type: string;
  url?: string;
  value?: string;
  position?: { start?: { offset?: number }; end?: { offset?: number } };
  children?: MdastNode[];
};

/** Locate the destination-URL substring inside a Markdown image node's source span (after `](`). */
function locateImageUrl(span: string, url: string): number {
  const open = span.indexOf("](");
  return span.indexOf(url, open === -1 ? 0 : open + 2);
}

/** Find every `<img src="…">` URL (and its offset) inside a raw HTML chunk. */
function findHtmlImgSrcs(html: string): SrcTarget[] {
  const targets: SrcTarget[] = [];
  const re = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const url = match[1] ?? match[2];
    if (url === undefined) {
      continue;
    }
    // The match ends at the closing quote, so the URL ends one char before the match end.
    const end = match.index + match[0].length - 1;
    targets.push({ start: end - url.length, end, url });
  }
  return targets;
}

/**
 * Rewrite image `src`s in `markdown` using `visit`, which returns a replacement URL (or null to leave a
 * src unchanged). Parses with mdast and splices each src by its source offsets, right-to-left, so code
 * blocks (parsed as `code`/`inlineCode`, never `image`) are never touched and earlier offsets stay valid.
 */
async function rewriteImageSrcs(
  markdown: string,
  visit: (url: string) => Promise<string | null>
): Promise<string> {
  const tree = fromMarkdown(markdown) as unknown as MdastNode;
  const targets: SrcTarget[] = [];

  const walk = (node: MdastNode): void => {
    const startOffset = node.position?.start?.offset;
    const endOffset = node.position?.end?.offset;
    if (
      node.type === "image" &&
      typeof node.url === "string" &&
      typeof startOffset === "number" &&
      typeof endOffset === "number"
    ) {
      const rel = locateImageUrl(markdown.slice(startOffset, endOffset), node.url);
      if (rel !== -1) {
        targets.push({ start: startOffset + rel, end: startOffset + rel + node.url.length, url: node.url });
      }
    } else if (node.type === "html" && typeof node.value === "string" && typeof startOffset === "number") {
      for (const found of findHtmlImgSrcs(node.value)) {
        targets.push({ start: startOffset + found.start, end: startOffset + found.end, url: found.url });
      }
    }
    if (node.children) {
      for (const child of node.children) {
        walk(child);
      }
    }
  };
  walk(tree);

  const edits: { start: number; end: number; replacement: string }[] = [];
  for (const target of targets) {
    const replacement = await visit(target.url);
    if (typeof replacement === "string" && replacement !== target.url) {
      edits.push({ start: target.start, end: target.end, replacement });
    }
  }
  edits.sort((a, b) => b.start - a.start);

  let out = markdown;
  for (const edit of edits) {
    out = out.slice(0, edit.start) + edit.replacement + out.slice(edit.end);
  }
  return out;
}

/** Result of writing a diagram sidecar: the relative `src` to reference it and the bare file name. */
export type WrittenDiagramAsset = { src: string; name: string };

/**
 * Replace each inline base64 editable-diagram image with a sidecar `.svg` written via `writeAsset`,
 * returning the rewritten markdown and the set of asset file names now referenced (so the caller can
 * delete orphaned ones). Only `;base64` data URLs are externalized, so the inverse `inlineDiagrams`
 * round-trips byte-identically.
 */
export async function externalizeDiagrams(
  markdown: string,
  writeAsset: (svgText: string, kind: DiagramKind) => Promise<WrittenDiagramAsset | null>
): Promise<{ markdown: string; usedNames: Set<string> }> {
  const usedNames = new Set<string>();
  const rewritten = await rewriteImageSrcs(markdown, async (url) => {
    if (!/^data:image\/svg\+xml;base64,/i.test(url)) {
      return null;
    }
    const kind = classifyEditableDiagram(url);
    if (!kind) {
      return null;
    }
    const svgText = decodeSvgDataUrl(url);
    if (svgText === null) {
      return null;
    }
    const written = await writeAsset(svgText, kind);
    if (!written) {
      return null;
    }
    usedNames.add(written.name);
    return written.src;
  });
  return { markdown: rewritten, usedNames };
}

/**
 * Replace each local `.svg` reference that is an editable drawio/isoflow diagram with its inline base64
 * data URL (read via `readSvg`), so the editor receives editable diagrams. Non-diagram `.svg` references
 * and unreadable files are left untouched.
 */
export async function inlineDiagrams(
  markdown: string,
  readSvg: (src: string) => Promise<string | null>
): Promise<string> {
  return rewriteImageSrcs(markdown, async (url) => {
    if (!isLocalSvgRef(url)) {
      return null;
    }
    const svgText = await readSvg(url);
    if (svgText === null) {
      return null;
    }
    const kind = classifySvgText(svgText);
    if (kind === "drawio") {
      return buildDrawioImageDataUrl(svgText);
    }
    if (kind === "isoflow") {
      return buildIsoflowImageDataUrl(svgText);
    }
    return null;
  });
}
