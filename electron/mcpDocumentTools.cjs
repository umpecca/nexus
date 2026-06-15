// Pure, cache-served logic for the read-only MCP document tools (nexus_get_outline,
// nexus_get_section, nexus_search_document). The Electron main process runs this file as raw
// CommonJS with no transpile step, so it cannot import the renderer's TypeScript helpers; the
// heading parser below is kept behaviorally equivalent to `extractOutline` in `src/lib/outline.ts`
// and guarded by a parity test (`src/lib/mcpDocumentTools.test.ts`). Slugging is delegated to the
// shared `headingSlugger.cjs` so section slugs match the table-of-contents anchors and exported ids.

const { createHeadingSlugger, decodeCharacterReferences } = require("./headingSlugger.cjs");

// Mirror of the ATX heading / fence regexes in `src/lib/outline.ts`.
const ATX_HEADING_PATTERN = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const FENCE_BOUNDARY_PATTERN = /^ {0,3}(`{3,}|~{3,})/;

const DEFAULT_SEARCH_MAX_RESULTS = 200;
const SEARCH_MAX_RESULTS_CEILING = 1000;
const PREVIEW_MAX_LENGTH = 240;

// nexus_find returns heavier per-match payloads (surrounding context), so it caps matching lines
// lower than the raw search tool and bounds the context window.
const DEFAULT_FIND_MAX_LINES = 50;
const FIND_MAX_LINES_CEILING = 500;
const DEFAULT_FIND_CONTEXT_LINES = 2;
const FIND_CONTEXT_LINES_CEILING = 10;

// Mirror of `normalizeHeadingText` in `src/lib/outline.ts`: drop the optional closing `#` run, decode
// HTML character references, then trim, so headings render the same here as in the outline sidebar.
function normalizeHeadingText(rawText) {
  const withoutClosingHashes = String(rawText ?? "").replace(/[ \t]+#+[ \t]*$/, "");
  return decodeCharacterReferences(withoutClosingHashes).trim();
}

// Parse ATX headings (skipping fenced code) into records carrying a zero-based source line index for
// slicing plus a deduplicated GitHub-style slug. Internal: callers receive the 1-based `line` shape.
function parseHeadings(markdown) {
  const lines = String(markdown ?? "").split(/\r?\n/);
  const slug = createHeadingSlugger();
  const headings = [];
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

    headings.push({ level, text, slug: slug(text), index: headings.length, line0: lineIndex });
  }

  return headings;
}

function toPublicHeading(heading) {
  return {
    level: heading.level,
    text: heading.text,
    slug: heading.slug,
    index: heading.index,
    line: heading.line0 + 1
  };
}

/**
 * Build the document outline: ATX headings in document order with level, decoded text, a unique
 * slug, the zero-based ordinal `index`, and a 1-based source `line`.
 */
function buildDocumentOutline(markdown) {
  return parseHeadings(markdown).map(toPublicHeading);
}

function resolveTargetHeading(headings, selector) {
  const sel = selector || {};

  if (Number.isInteger(sel.index)) {
    return headings[sel.index] ?? null;
  }

  if (typeof sel.slug === "string" && sel.slug.length > 0) {
    const wanted = sel.slug.toLowerCase();
    return headings.find((heading) => heading.slug.toLowerCase() === wanted) ?? null;
  }

  if (typeof sel.heading === "string" && sel.heading.trim().length > 0) {
    const wantedExact = sel.heading.trim();
    const exact = headings.find((heading) => heading.text === wantedExact);
    if (exact) {
      return exact;
    }
    const wantedLower = wantedExact.toLowerCase();
    return headings.find((heading) => heading.text.toLowerCase() === wantedLower) ?? null;
  }

  return null;
}

/**
 * Resolve a section selector (`index` heading ordinal, `slug`, or `heading` text) to the half-open
 * line range `[startLine0, endLine0)` covering that section — its heading line through the line before
 * the next heading of the same or higher level (deeper subsections included). Shared by
 * `getDocumentSection` (read) and `replaceSection` (write, in `mcpDocumentEdits.cjs`) so both agree on
 * exactly which lines a section spans. Returns the parsed `headings` and split `lines` either way.
 */
function getSectionRange(markdown, selector) {
  const source = String(markdown ?? "");
  const lines = source.split(/\r?\n/);
  const headings = parseHeadings(source);

  if (headings.length === 0) {
    return { found: false, reason: "no-headings", headings, lines };
  }

  const target = resolveTargetHeading(headings, selector);
  if (!target) {
    return { found: false, reason: "not-found", headings, lines };
  }

  let endLine0 = lines.length;
  for (let i = target.index + 1; i < headings.length; i += 1) {
    if (headings[i].level <= target.level) {
      endLine0 = headings[i].line0;
      break;
    }
  }

  return { found: true, target, headings, lines, startLine0: target.line0, endLine0 };
}

/**
 * Return the Markdown of a single section identified by `index` (heading ordinal), `slug`, or
 * `heading` text. The section runs from its heading line through the line before the next heading of
 * the same or higher level (deeper subsections are included), with trailing blank lines trimmed.
 */
function getDocumentSection(markdown, selector) {
  const range = getSectionRange(markdown, selector);

  if (!range.found) {
    return {
      found: false,
      reason: range.reason,
      headingCount: range.headings.length,
      headings: range.reason === "not-found" ? range.headings.map(toPublicHeading) : []
    };
  }

  const { target, lines, startLine0, endLine0 } = range;
  const sectionLines = lines.slice(startLine0, endLine0);
  while (sectionLines.length > 0 && sectionLines[sectionLines.length - 1].trim() === "") {
    sectionLines.pop();
  }

  return {
    found: true,
    index: target.index,
    level: target.level,
    heading: target.text,
    slug: target.slug,
    startLine: startLine0 + 1,
    endLine: startLine0 + sectionLines.length,
    lineCount: sectionLines.length,
    markdown: sectionLines.join("\n")
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clampMaxResults(value) {
  if (!Number.isFinite(value)) {
    return DEFAULT_SEARCH_MAX_RESULTS;
  }
  return Math.min(SEARCH_MAX_RESULTS_CEILING, Math.max(1, Math.floor(value)));
}

function truncatePreview(lineText) {
  if (lineText.length <= PREVIEW_MAX_LENGTH) {
    return lineText;
  }
  return `${lineText.slice(0, PREVIEW_MAX_LENGTH)}…`;
}

/**
 * Search the document line by line. `query` is a literal substring unless `isRegex` is set; matching
 * is case-insensitive unless `caseSensitive` is set. Returns up to `maxResults` matches (each with a
 * 1-based line/column, the matched text, and a line preview) plus the accurate `total` and a
 * `truncated` flag when more matches exist than were returned. Throws on an empty query or an
 * invalid regular expression.
 */
function searchDocument(markdown, options) {
  const opts = options || {};
  const query = typeof opts.query === "string" ? opts.query : "";
  if (query.length === 0) {
    throw new Error("search requires a non-empty 'query' string.");
  }

  const isRegex = Boolean(opts.isRegex);
  const caseSensitive = Boolean(opts.caseSensitive);
  const maxResults = clampMaxResults(opts.maxResults);
  const flags = caseSensitive ? "g" : "gi";

  let pattern;
  try {
    pattern = new RegExp(isRegex ? query : escapeRegExp(query), flags);
  } catch (error) {
    throw new Error(
      `Invalid regular expression: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const lines = String(markdown ?? "").split(/\r?\n/);
  const matches = [];
  let total = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const lineText = lines[lineIndex];
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(lineText)) !== null) {
      total += 1;
      if (matches.length < maxResults) {
        matches.push({
          line: lineIndex + 1,
          column: match.index + 1,
          match: match[0],
          preview: truncatePreview(lineText)
        });
      }
      // Zero-width matches (e.g. an `a*` regex) would otherwise loop forever on the same index.
      if (match[0].length === 0) {
        pattern.lastIndex += 1;
      }
    }
  }

  return {
    query,
    isRegex,
    caseSensitive,
    total,
    truncated: total > matches.length,
    matches
  };
}

function clampFindMaxLines(value) {
  if (!Number.isFinite(value)) {
    return DEFAULT_FIND_MAX_LINES;
  }
  return Math.min(FIND_MAX_LINES_CEILING, Math.max(1, Math.floor(value)));
}

function clampContextLines(value) {
  if (!Number.isFinite(value)) {
    return DEFAULT_FIND_CONTEXT_LINES;
  }
  return Math.min(FIND_CONTEXT_LINES_CEILING, Math.max(0, Math.floor(value)));
}

// The nearest heading at or above a zero-based line, or null when the line precedes every heading.
// `headings` is in document order, so the last one not past the line wins.
function findEnclosingHeading(headings, line0) {
  let enclosing = null;
  for (const heading of headings) {
    if (heading.line0 <= line0) {
      enclosing = heading;
    } else {
      break;
    }
  }
  return enclosing;
}

/**
 * Find occurrences of a query and return them grouped by line, each with the surrounding context
 * lines and the heading the line falls under — so a caller can understand what each match is and
 * where it sits in the document without a separate read. `query` is a literal substring unless
 * `isRegex`; matching is case-insensitive unless `caseSensitive`. Returns up to `maxResults` matching
 * lines (each with the columns and count of occurrences on it), `contextLines` of context on each
 * side, the accurate occurrence `total` and matching-line count, and a `truncated` flag. Throws on an
 * empty query or invalid regular expression.
 */
function findInDocument(markdown, options) {
  const opts = options || {};
  const query = typeof opts.query === "string" ? opts.query : "";
  if (query.length === 0) {
    throw new Error("find requires a non-empty 'query' string.");
  }

  const isRegex = Boolean(opts.isRegex);
  const caseSensitive = Boolean(opts.caseSensitive);
  const maxLines = clampFindMaxLines(opts.maxResults);
  const contextLines = clampContextLines(opts.contextLines);
  const flags = caseSensitive ? "g" : "gi";

  let pattern;
  try {
    pattern = new RegExp(isRegex ? query : escapeRegExp(query), flags);
  } catch (error) {
    throw new Error(
      `Invalid regular expression: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const source = String(markdown ?? "");
  const lines = source.split(/\r?\n/);
  const headings = parseHeadings(source);
  const matches = [];
  let total = 0;
  let matchingLines = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const lineText = lines[lineIndex];
    pattern.lastIndex = 0;
    const columns = [];
    let match;
    while ((match = pattern.exec(lineText)) !== null) {
      total += 1;
      columns.push(match.index + 1);
      // Zero-width matches (e.g. an `a*` regex) would otherwise loop forever on the same index.
      if (match[0].length === 0) {
        pattern.lastIndex += 1;
      }
    }

    if (columns.length === 0) {
      continue;
    }

    matchingLines += 1;
    // Keep counting total/matchingLines past the cap so the summary stays accurate, but stop
    // accumulating heavy context payloads.
    if (matches.length >= maxLines) {
      continue;
    }

    const start0 = Math.max(0, lineIndex - contextLines);
    const end0 = Math.min(lines.length - 1, lineIndex + contextLines);
    const enclosing = findEnclosingHeading(headings, lineIndex);

    matches.push({
      line: lineIndex + 1,
      columns,
      matchCount: columns.length,
      heading: enclosing ? toPublicHeading(enclosing) : null,
      contextStartLine: start0 + 1,
      context: lines.slice(start0, end0 + 1).map(truncatePreview).join("\n")
    });
  }

  return {
    query,
    isRegex,
    caseSensitive,
    total,
    matchingLines,
    truncated: matchingLines > matches.length,
    matches
  };
}

module.exports = {
  buildDocumentOutline,
  getDocumentSection,
  getSectionRange,
  parseHeadings,
  toPublicHeading,
  searchDocument,
  findInDocument
};
