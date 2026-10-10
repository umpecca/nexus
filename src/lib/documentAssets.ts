import { fromMarkdown } from "mdast-util-from-markdown";

export type AssetOccurrence = { from: number; to: number; syntax: "markdown" | "html" };
export type DocumentAsset = { source: string; name: string; occurrences: AssetOccurrence[]; embedded: boolean; sourceBytes: number };

export const byteSize = (text: string) => new TextEncoder().encode(text).length;
export function formatAssetSize(bytes: number) {
  if (bytes < 1024) return `${bytes.toLocaleString()} B`;
  return `${(bytes / (bytes < 1024 * 1024 ? 1024 : 1024 * 1024)).toFixed(1)} ${bytes < 1024 * 1024 ? "KB" : "MB"}`;
}

/** Parse short stand-ins for base64 data; retain offsets into the original, untouched source. */
export function listDocumentAssets(markdown: string): DocumentAsset[] {
  const chunks: string[] = [];
  const shifts: { at: number; delta: number }[] = [];
  let cursor = 0, length = 0, delta = 0;
  for (const match of markdown.matchAll(/data\\?:image\/[a-z0-9.+-]+(?:;[^,\s]*)?;base64,[a-z0-9+/]+={0,2}/gi)) {
    const before = markdown.slice(cursor, match.index);
    const short = match[0].slice(0, match[0].indexOf(",") + 1) + "A";
    chunks.push(before, short);
    length += before.length + short.length;
    delta += match[0].length - short.length;
    shifts.push({ at: length, delta });
    cursor = match.index! + match[0].length;
  }
  chunks.push(markdown.slice(cursor));
  const compact = chunks.join("");
  const originalOffset = (offset: number) => {
    let extra = 0;
    for (const shift of shifts) { if (shift.at > offset) break; extra = shift.delta; }
    return offset + extra;
  };
  const tree = fromMarkdown(compact);
  type Node = typeof tree | (typeof tree.children)[number];
  const references = new Map<string, { count: number; name: string }>();
  const walk = (node: Node, visitor: (node: Node) => void) => {
    visitor(node);
    if ("children" in node) node.children.forEach(child => walk(child, visitor));
  };
  walk(tree, node => {
    if (node.type === "imageReference") {
      const previous = references.get(node.identifier);
      references.set(node.identifier, { count: (previous?.count ?? 0) + 1, name: previous?.name || node.alt || "Image" });
    }
  });
  const assets = new Map<string, DocumentAsset>();
  const definitions = new Set<string>();
  const add = (start: number, end: number, syntax: AssetOccurrence["syntax"], name: string, decoded?: string) => {
    const from = originalOffset(start), to = originalOffset(end);
    const raw = markdown.slice(from, to);
    let source = raw.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g, "$1");
    if (syntax === "html") {
      const element = document.createElement("textarea");
      element.innerHTML = raw;
      source = element.value;
    }
    if (decoded && !/;base64,/i.test(source)) source = decoded;
    const embedded = /^data:image\//i.test(source);
    const asset = assets.get(source) ?? { source, name: name || "Image", occurrences: [], embedded, sourceBytes: 0 };
    asset.occurrences.push({ from, to, syntax });
    asset.sourceBytes += byteSize(raw);
    assets.set(source, asset);
  };
  walk(tree, node => {
    const start = node.position?.start.offset, end = node.position?.end.offset;
    if (start === undefined || end === undefined) return;
    if (node.type === "image" || (node.type === "definition" && references.has(node.identifier))) {
      if (node.type === "definition") {
        if (definitions.has(node.identifier)) return;
        definitions.add(node.identifier);
      }
      const span = compact.slice(start, end);
      // Destination boundaries come from syntax, not searching for a decoded URL (which may
      // contain entities or escaped punctuation). Balanced parentheses are valid destinations.
      const marker = node.type === "image" ? "](" : "]:";
      let markerAt = -1;
      while ((markerAt = span.indexOf(marker, markerAt + 1)) !== -1) {
        let from = start + markerAt + 2;
        while (/\s/.test(compact[from] ?? "") && from < end) from++;
        let to = from, nesting = 0;
        if (compact[from] === "<") { from++; to = compact.indexOf(">", from); }
        else {
          while (to < end) {
            const char = compact[to];
            if (char === "\\") { to += 2; continue; }
            if (/\s/.test(char) || (char === ")" && nesting === 0)) break;
            if (char === "(") nesting++;
            if (char === ")") nesting--;
            to++;
          }
        }
        if (to <= from) continue;
        const raw = compact.slice(from, to);
        // Ask the Markdown parser to decode escapes and character references consistently.
        const parsed = fromMarkdown(`![x](<${raw}>)`).children[0];
        const image = parsed && "children" in parsed ? parsed.children[0] : undefined;
        if (image?.type !== "image" || image.url !== node.url) continue;
        add(from, to, "markdown", node.type === "image" ? node.alt || "Image" : references.get(node.identifier)!.name, node.url);
        break;
      }
    } else if (node.type === "html") {
      const html = compact.slice(start, end).replace(/<!--[\s\S]*?-->/g, text => " ".repeat(text.length));
      for (const tag of html.matchAll(/<img\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi)) {
        // Consume whole attributes so a src-like string inside alt/title is never a destination.
        const attributes = [...tag[0].slice(4).matchAll(/([^\s"'=<>`/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)];
        const src = attributes.find(attribute => attribute[1].toLowerCase() === "src");
        const url = src?.[2] ?? src?.[3] ?? src?.[4];
        if (!url || !src) continue;
        const to = start + tag.index! + 4 + src.index! + src[0].length - (src[4] ? 0 : 1);
        const alt = attributes.find(attribute => attribute[1].toLowerCase() === "alt");
        add(to - url.length, to, "html", alt?.[2] ?? alt?.[3] ?? alt?.[4] ?? "Image");
      }
    }
  });
  return [...assets.values()];
}

/** Replacing only destination spans preserves titles, alt text, references and surrounding text. */
export function assetReplacementChanges(asset: DocumentAsset, source: string) {
  const markdownSource = source.replace(/[\s<>"()\\]/g, char => encodeURIComponent(char)
    .replace(/[()]/g, value => `%${value.charCodeAt(0).toString(16).toUpperCase()}`)).replace(/^data:/i, "data\\:");
  return asset.occurrences.map(({ from, to, syntax }) => ({ from, to, insert: syntax === "html"
    ? source.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    : markdownSource }));
}
export function replaceDocumentAsset(markdown: string, asset: DocumentAsset, source: string) {
  return assetReplacementChanges(asset, source).sort((a, b) => b.from - a.from)
    .reduce((text, change) => text.slice(0, change.from) + change.insert + text.slice(change.to), markdown);
}
