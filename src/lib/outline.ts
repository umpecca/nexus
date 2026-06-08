export type OutlineHeading = {
  /** Heading level from 1 (H1) through 6 (H6). */
  level: number;
  /** Trimmed heading text with surrounding `#` markers removed. */
  text: string;
  /** Zero-based ordinal position across all headings in document order. */
  index: number;
  /** Zero-based line index of the heading in the source Markdown, for source-mode navigation. */
  line: number;
};

const ATX_HEADING_PATTERN = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const FENCE_BOUNDARY_PATTERN = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Extract the document outline from a Markdown buffer.
 *
 * Returns ATX headings (`#` through `######`) in document order, skipping any
 * heading-like lines inside fenced code blocks so code comments are not treated
 * as headings. This mirrors the fenced-code handling used by the export renderer.
 */
export function extractOutline(markdown: string): OutlineHeading[] {
  const lines = String(markdown ?? "").split(/\r?\n/);
  const headings: OutlineHeading[] = [];
  let isInFence = false;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";

    if (FENCE_BOUNDARY_PATTERN.test(line)) {
      isInFence = !isInFence;
      continue;
    }

    if (isInFence) {
      continue;
    }

    const match = ATX_HEADING_PATTERN.exec(line);
    if (!match) {
      continue;
    }

    const level = match[1].length;
    const text = normalizeHeadingText(match[2] ?? "");

    headings.push({ level, text, index: headings.length, line: lineIndex });
  }

  return headings;
}

/**
 * Pick the outline entry to highlight for scroll-spy given each heading's top
 * offset within the scroll content (in document order) and the current scroll
 * viewport. Returns -1 when there are no headings.
 *
 * The active heading is the last one whose top sits at or above an activation line
 * a little below the viewport top. Scrolled to the very bottom, the final heading
 * wins so short trailing sections can still activate; above the first heading, the
 * first heading stays active. `headingTops` must be in non-decreasing document
 * order (entries that cannot be resolved should be `Infinity` so they never win).
 */
export function getActiveHeadingIndex(
  headingTops: number[],
  viewport: { scrollTop: number; clientHeight: number; scrollHeight: number },
  activationOffset: number
): number {
  if (headingTops.length === 0) {
    return -1;
  }

  const { scrollTop, clientHeight, scrollHeight } = viewport;
  if (scrollTop + clientHeight >= scrollHeight - 2) {
    return headingTops.length - 1;
  }

  const activationLine = scrollTop + activationOffset;
  let activeIndex = 0;
  for (let index = 0; index < headingTops.length; index += 1) {
    if (headingTops[index] <= activationLine) {
      activeIndex = index;
    } else {
      break;
    }
  }

  return activeIndex;
}

const NAMED_CHARACTER_REFERENCES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"'
};

/**
 * Normalize raw ATX heading text for display: drop the optional closing `#`
 * sequence, decode HTML character references, then trim. Hashes are stripped
 * before decoding so an encoded `#` (`&#x23;`) is treated as content rather than
 * a closing marker.
 */
function normalizeHeadingText(rawText: string) {
  const withoutClosingHashes = rawText.replace(/[ \t]+#+[ \t]*$/, "");
  return decodeCharacterReferences(withoutClosingHashes).trim();
}

/**
 * Decode the HTML character references the Markdown serializer can emit so the
 * outline shows real characters instead of raw entities. MDXEditor encodes
 * preserved spaces as numeric references such as `&#x20;`, which would otherwise
 * appear literally in the heading list. Unknown references are left untouched.
 *
 * Exported so the table-of-contents slugger (`src/lib/toc.ts`) can decode the same
 * way before slugging, keeping anchor slugs consistent with the displayed outline.
 * The CommonJS export renderer mirrors this logic in `electron/headingSlugger.cjs`.
 */
export function decodeCharacterReferences(text: string) {
  if (!text.includes("&")) {
    return text;
  }

  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (entity, body: string) => {
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
