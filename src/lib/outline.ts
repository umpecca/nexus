export type OutlineHeading = {
  /** Heading level from 1 (H1) through 6 (H6). */
  level: number;
  /** Trimmed heading text with surrounding `#` markers removed. */
  text: string;
  /** Zero-based ordinal position across all headings in document order. */
  index: number;
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

  for (const line of lines) {
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
    const text = stripTrailingHashes(match[2] ?? "");

    headings.push({ level, text, index: headings.length });
  }

  return headings;
}

/** Remove an optional closing sequence of `#` characters from an ATX heading. */
function stripTrailingHashes(rawText: string) {
  return rawText.replace(/[ \t]+#+[ \t]*$/, "").trim();
}
