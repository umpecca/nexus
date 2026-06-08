// GitHub-style heading slugger shared in spirit with the renderer-side table-of-contents builder
// (`src/lib/toc.ts`). The Electron main process runs this file as raw CommonJS with no transpile
// step, so it cannot import the TypeScript source; the two implementations are kept byte-for-byte
// equivalent in behavior and guarded by a parity test (`src/lib/toc.test.ts`). When the TOC builder
// emits `[Heading](#slug)` links and this module assigns `id="<slug>"` to the exported headings,
// both must produce identical slugs for the anchors to resolve.

const NAMED_CHARACTER_REFERENCES = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"'
};

// Mirror of `decodeCharacterReferences` in `src/lib/outline.ts` so a heading written with HTML
// entities (e.g. `&amp;` or MDXEditor's `&#x20;`) slugs the same whether the caller passes the raw
// or already-decoded text.
function decodeCharacterReferences(text) {
  if (!text.includes("&")) {
    return text;
  }

  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (entity, body) => {
    const reference = body.toLowerCase();

    if (reference[0] === "#") {
      const codePoint =
        reference[1] === "x" ? parseInt(reference.slice(2), 16) : parseInt(reference.slice(1), 10);

      if (Number.isInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff) {
        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return entity;
        }
      }

      return entity;
    }

    return NAMED_CHARACTER_REFERENCES[reference] ?? entity;
  });
}

// Convert heading text into a base slug: decode entities, lowercase, drop everything that is not a
// Unicode letter/number/underscore/space/hyphen, then collapse whitespace and hyphen runs to single
// hyphens and trim. The result only ever contains `[\p{L}\p{N}_-]`, so it is safe to drop straight
// into an `id="..."` attribute without escaping.
function slugifyHeadingText(text) {
  return decodeCharacterReferences(String(text ?? ""))
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Create a stateful slugger that deduplicates repeated slugs by appending `-1`, `-2`, ... in
// document order, matching GitHub's behavior. Headings that slug to an empty string fall back to
// `section` before deduping. Callers MUST run every heading (all levels) through one slugger
// instance in document order so the dedupe counters stay aligned between the TOC links and the
// exported heading ids.
function createHeadingSlugger() {
  const counts = new Map();

  return function slug(text) {
    const base = slugifyHeadingText(text) || "section";
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen}`;
  };
}

module.exports = {
  decodeCharacterReferences,
  slugifyHeadingText,
  createHeadingSlugger
};
