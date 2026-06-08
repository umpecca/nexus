import { decodeCharacterReferences, extractOutline } from "./outline";
import type { OutlineHeading } from "./outline";

/** Heading shown above the generated list; also used to detect a previously-inserted TOC. */
const TOC_HEADING = "## Table of Contents";
/** Matches the heading line of a Nexus-inserted TOC so re-running replaces rather than stacks. */
const TOC_HEADING_PATTERN = /^ {0,3}#{2}[ \t]+Table of Contents[ \t]*$/i;
/** Shown for headings with no text, mirroring the outline sidebar's placeholder. */
const UNTITLED_HEADING_LABEL = "(untitled heading)";
/** A leading H1 is treated as the document title, so the TOC lists H2 and deeper. */
const MIN_TOC_LEVEL = 2;

/**
 * Convert heading text into a base slug: decode entities, lowercase, drop everything that is not a
 * Unicode letter/number/underscore/space/hyphen, then collapse whitespace and hyphen runs to single
 * hyphens and trim. The result only contains `[\p{L}\p{N}_-]`.
 *
 * Mirror of `slugifyHeadingText` in `electron/headingSlugger.cjs`; the two are kept behaviorally
 * identical and guarded by the parity test in `toc.test.ts` so the TOC's `#slug` links always match
 * the `id="<slug>"` the export renderer assigns to headings.
 */
export function slugifyHeadingText(text: string): string {
  return decodeCharacterReferences(String(text ?? ""))
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Create a stateful slugger that deduplicates repeated slugs by appending `-1`, `-2`, ... in
 * document order. Empty slugs fall back to `section`. Every heading (all levels) must pass through
 * one slugger instance in document order so dedupe counters match the export renderer.
 */
export function createHeadingSlugger(): (text: string) => string {
  const counts = new Map<string, number>();

  return function slug(text: string): string {
    const base = slugifyHeadingText(text) || "section";
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen}`;
  };
}

/** Escape the characters that would otherwise break a Markdown link label. */
function escapeLinkText(text: string): string {
  return text.replace(/[\\[\]]/g, "\\$&");
}

/**
 * Build a nested Markdown table of contents from a document outline: a `## Table of Contents`
 * heading followed by a bullet list of `[Heading](#slug)` links for every H2-and-deeper heading,
 * indented by depth. Returns `""` when the document has no such headings (the caller no-ops).
 *
 * All headings are slugged in document order — even the skipped H1 — so the dedupe counters stay in
 * lockstep with the export renderer, which slugs every heading it emits.
 */
export function buildTableOfContents(headings: OutlineHeading[]): string {
  const slug = createHeadingSlugger();
  const slugged = headings.map((heading) => ({ heading, slug: slug(heading.text) }));
  const included = slugged.filter((entry) => entry.heading.level >= MIN_TOC_LEVEL);

  if (included.length === 0) {
    return "";
  }

  // Normalize indentation so the shallowest included heading sits flush-left.
  const minLevel = Math.min(...included.map((entry) => entry.heading.level));
  const items = included.map(({ heading, slug: headingSlug }) => {
    const indent = "  ".repeat(heading.level - minLevel);
    const label = escapeLinkText(heading.text || UNTITLED_HEADING_LABEL);
    return `${indent}- [${label}](#${headingSlug})`;
  });

  return [TOC_HEADING, "", ...items].join("\n");
}

/** True when a line is an ATX H1 (a single leading `#`), matching extractOutline's heading notion. */
function isAtxH1(line: string): boolean {
  const match = /^ {0,3}(#{1,6})(?:[ \t]+.*?)?[ \t]*$/.exec(line);
  return match !== null && match[1].length === 1;
}

/** Drop leading blank lines from a list of lines (returns a new array). */
function dropLeadingBlankLines(lines: string[]): string[] {
  let start = 0;
  while (start < lines.length && lines[start].trim() === "") {
    start += 1;
  }
  return lines.slice(start);
}

/**
 * If the lines begin with a Nexus-inserted TOC block (`## Table of Contents` heading followed by its
 * bullet list), remove that block so a fresh TOC replaces it instead of stacking. Leading blank
 * lines must already be trimmed. Returns the lines unchanged when no TOC block is present.
 */
function dropLeadingTocBlock(lines: string[]): string[] {
  if (lines.length === 0 || !TOC_HEADING_PATTERN.test(lines[0])) {
    return lines;
  }

  let cursor = 1;
  // Consume blank lines, then the contiguous bullet list (with any blanks between items). Match any
  // unordered-list marker (`-`, `*`, `+`) because MDXEditor re-serializes the inserted `- ` bullets
  // as `* ` on round-trip, and a refresh must still recognize (and replace) that list.
  while (cursor < lines.length && lines[cursor].trim() === "") {
    cursor += 1;
  }
  while (
    cursor < lines.length &&
    (/^\s*[-*+]\s+/.test(lines[cursor]) || lines[cursor].trim() === "")
  ) {
    cursor += 1;
  }
  return lines.slice(cursor);
}

/**
 * Insert (or refresh) a table of contents at the top of the document. The TOC is placed after a
 * leading YAML frontmatter block and after a leading H1 title when present, otherwise at the very
 * top. A previously-inserted TOC block at that position is replaced. Returns the buffer unchanged
 * when the document has no H2-or-deeper headings.
 */
export function insertTableOfContentsIntoBuffer(markdown: string): string {
  const source = String(markdown ?? "");
  const lines = source.split("\n");

  // Skip a leading `---` ... `---` frontmatter block so the TOC lands below it.
  let bodyStart = 0;
  if (lines[0] === "---") {
    for (let index = 1; index < lines.length; index += 1) {
      if (lines[index] === "---") {
        bodyStart = index + 1;
        break;
      }
    }
  }

  // Find the first non-blank body line; if it is an H1 title, the TOC goes just after it.
  let firstContent = bodyStart;
  while (firstContent < lines.length && lines[firstContent].trim() === "") {
    firstContent += 1;
  }
  const hasH1 = firstContent < lines.length && isAtxH1(lines[firstContent]);
  const anchor = hasH1 ? firstContent : bodyStart - 1;

  const head = lines.slice(0, anchor + 1);
  // Strip any previously-inserted TOC block first so a re-run refreshes it rather than stacking —
  // and so the stripped heading is never re-extracted into (and listed by) the new TOC.
  let rest = dropLeadingBlankLines(lines.slice(anchor + 1));
  rest = dropLeadingBlankLines(dropLeadingTocBlock(rest));

  // Compute the outline from the cleaned document (old TOC removed) so the inserted heading never
  // lists itself and slug dedupe stays correct.
  const cleanedLines =
    head.length > 0 ? (rest.length > 0 ? [...head, "", ...rest] : head) : rest;
  const toc = buildTableOfContents(extractOutline(cleanedLines.join("\n")));
  if (toc === "") {
    return source;
  }

  const tocLines = toc.split("\n");
  const tail = rest.length > 0 ? ["", ...rest] : [];
  const composed = head.length > 0 ? [...head, "", ...tocLines, ...tail] : [...tocLines, ...tail];

  return composed.join("\n");
}
