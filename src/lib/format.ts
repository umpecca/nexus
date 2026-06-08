/**
 * Pure Markdown "Clean up formatting" pass used by the source-mode toolbar command.
 *
 * It normalizes the cosmetic shape of a Markdown document without changing its meaning, so a
 * document co-edited by humans and agents converges on a consistent style. The pass:
 *   - normalizes unordered list markers to `- ` and collapses the run of spaces after any list
 *     marker (ordered or unordered) to a single space; ordered list numbers are left untouched so a
 *     deliberately authored sequence is never renumbered;
 *   - normalizes ATX headings — a single space after the `#` run, an optional trailing `###` closer
 *     removed, leading indentation dropped — and guarantees exactly one blank line above and below
 *     each heading;
 *   - re-pads GFM tables so the column pipes line up and the delimiter row reflects each column's
 *     alignment (`:---`, `---:`, `:---:`);
 *   - normalizes thematic breaks (`***`, `___`, `- - -`, ...) to `---`;
 *   - collapses runs of three or more blank lines to one, trims trailing whitespace (preserving a
 *     two-space hard line break), and trims leading/trailing blank lines.
 *
 * Content inside fenced code blocks (``` ``` ``` or `~~~`) and a leading, closed YAML frontmatter
 * block is passed through verbatim. Indented (four-space) code blocks are not tracked, matching the
 * fenced-only convention used by `extractOutline` and the table-of-contents builder; a setext
 * heading underline is also left alone (its `---`/`===` is never reflowed). The transform is
 * idempotent: `cleanupMarkdownFormatting(cleanupMarkdownFormatting(x)) === cleanupMarkdownFormatting(x)`.
 */

type Token =
  | { kind: "code"; text: string }
  | { kind: "blank" }
  | { kind: "heading"; text: string }
  | { kind: "text"; text: string };

type Align = "left" | "right" | "center" | "none";

/** ATX heading: up to three leading spaces, 1–6 `#`, optional space-separated text. */
const ATX_HEADING_PATTERN = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
/** Minimum dash count in a normalized table delimiter cell, for readability. */
const MIN_TABLE_COLUMN_WIDTH = 3;

/** Parse a code-fence line into its marker character and length, or `null` when it is not a fence. */
function parseFence(line: string): { char: string; len: number; rest: string } | null {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match) {
    return null;
  }
  return { char: match[1][0], len: match[1].length, rest: match[2] };
}

/** True for a thematic break: three or more `-`, `*`, or `_` of the same kind, spaces allowed. */
function isThematicBreak(line: string): boolean {
  return /^ {0,3}([-*_])[ \t]*(?:\1[ \t]*){2,}$/.test(line);
}

/**
 * Normalize a list item's marker without touching its content: unordered `*`/`+`/`-` become `-`, and
 * the whitespace after any marker (ordered or unordered) collapses to a single space. Ordered
 * numbers and their `.`/`)` delimiter are preserved. Non-list lines are returned unchanged.
 *
 * The caller must rule out thematic breaks first, so `* * *` is never mistaken for a `*` list item.
 */
function normalizeListMarker(line: string): string {
  const unordered = /^(\s*)[-*+]([ \t]+)(.*)$/.exec(line);
  if (unordered) {
    return `${unordered[1]}- ${unordered[3]}`;
  }
  const ordered = /^(\s*)(\d{1,9})([.)])[ \t]+(.*)$/.exec(line);
  if (ordered) {
    return `${ordered[1]}${ordered[2]}${ordered[3]} ${ordered[4]}`;
  }
  return line;
}

/**
 * Trim trailing whitespace from a line, but keep a GFM hard line break: a non-blank line ending in
 * two or more spaces is normalized to exactly two trailing spaces rather than stripped.
 */
function trimTrailing(line: string): string {
  const trimmed = line.replace(/[ \t]+$/, "");
  if (trimmed === line) {
    return line;
  }
  const isHardBreak = trimmed !== "" && / {2,}$/.test(line);
  return isHardBreak ? `${trimmed}  ` : trimmed;
}

/**
 * Split a table row into trimmed cells, dividing on unescaped `|` and discarding the empty cells
 * produced by an outer leading/trailing pipe. A `\|` is kept inside its cell rather than split on.
 */
function splitRowCells(row: string): string[] {
  const source = row.trim();
  const cells: string[] = [];
  let buffer = "";

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "\\" && index + 1 < source.length) {
      buffer += char + source[index + 1];
      index += 1;
      continue;
    }
    if (char === "|") {
      cells.push(buffer);
      buffer = "";
      continue;
    }
    buffer += char;
  }
  cells.push(buffer);

  if (cells.length > 1 && cells[0].trim() === "") {
    cells.shift();
  }
  if (cells.length > 1 && cells[cells.length - 1].trim() === "") {
    cells.pop();
  }
  return cells.map((cell) => cell.trim());
}

/** Parse a GFM delimiter row into per-column alignments, or `null` when the line is not one. */
function parseDelimiterRow(row: string): Align[] | null {
  if (!row.includes("|")) {
    return null;
  }
  const cells = splitRowCells(row);
  if (cells.length === 0) {
    return null;
  }

  const aligns: Align[] = [];
  for (const cell of cells) {
    const match = /^(:?)-+(:?)$/.exec(cell);
    if (!match) {
      return null;
    }
    const left = match[1] === ":";
    const right = match[2] === ":";
    aligns.push(left && right ? "center" : right ? "right" : left ? "left" : "none");
  }
  return aligns;
}

/** Pad a cell's text to `width` according to its column alignment. */
function padCell(text: string, width: number, align: Align): string {
  const pad = width - text.length;
  if (pad <= 0) {
    return text;
  }
  if (align === "right") {
    return " ".repeat(pad) + text;
  }
  if (align === "center") {
    const leftPad = Math.floor(pad / 2);
    return " ".repeat(leftPad) + text + " ".repeat(pad - leftPad);
  }
  return text + " ".repeat(pad);
}

/** Build a delimiter cell of `width` dashes carrying the column's alignment colons. */
function delimiterCell(width: number, align: Align): string {
  if (align === "center") {
    return `:${"-".repeat(width - 2)}:`;
  }
  if (align === "left") {
    return `:${"-".repeat(width - 1)}`;
  }
  if (align === "right") {
    return `${"-".repeat(width - 1)}:`;
  }
  return "-".repeat(width);
}

/** Re-render a parsed table (header row first, then body rows) with aligned, padded columns. */
function formatTableBlock(rows: string[][], aligns: Align[]): string[] {
  const columnCount = Math.max(aligns.length, ...rows.map((row) => row.length));
  const columnAligns: Align[] = [];
  const widths: number[] = [];
  for (let column = 0; column < columnCount; column += 1) {
    columnAligns.push(aligns[column] ?? "none");
    let width = MIN_TABLE_COLUMN_WIDTH;
    for (const row of rows) {
      width = Math.max(width, (row[column] ?? "").length);
    }
    widths.push(width);
  }

  const renderRow = (cells: string[]) => {
    const padded: string[] = [];
    for (let column = 0; column < columnCount; column += 1) {
      padded.push(padCell(cells[column] ?? "", widths[column], columnAligns[column]));
    }
    return `| ${padded.join(" | ")} |`;
  };

  const delimiterCells: string[] = [];
  for (let column = 0; column < columnCount; column += 1) {
    delimiterCells.push(delimiterCell(widths[column], columnAligns[column]));
  }

  const output = [renderRow(rows[0]), `| ${delimiterCells.join(" | ")} |`];
  for (let index = 1; index < rows.length; index += 1) {
    output.push(renderRow(rows[index]));
  }
  return output;
}

/**
 * Detect a GFM table starting at `start` (a header line plus a delimiter line). Returns the
 * reformatted lines and the index of the last consumed line, or `null` when there is no table. The
 * table runs until a blank line, a line without a pipe, or a fence boundary.
 */
function tryParseTable(
  lines: string[],
  start: number
): { lines: string[]; endIndex: number } | null {
  const header = lines[start];
  if (!header || !header.includes("|")) {
    return null;
  }
  const aligns = parseDelimiterRow(lines[start + 1] ?? "");
  if (!aligns) {
    return null;
  }

  const rawRows = [header];
  let endIndex = start + 1;
  for (let index = start + 2; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === "" || !line.includes("|") || parseFence(line)) {
      break;
    }
    rawRows.push(line);
    endIndex = index;
  }

  const cellRows = rawRows.map((row) => splitRowCells(row));
  return { lines: formatTableBlock(cellRows, aligns), endIndex };
}

/**
 * Tokenize the body lines, applying fence-, table-, heading-, list-, and thematic-break-aware
 * per-line transforms. Code-fence content, frontmatter, and reformatted tables are frozen as `code`
 * tokens so the later structural pass never reflows them.
 */
function tokenizeBody(lines: string[]): Token[] {
  const tokens: Token[] = [];
  let fence: { char: string; len: number } | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (fence) {
      tokens.push({ kind: "code", text: line });
      const close = parseFence(line);
      if (close && close.char === fence.char && close.len >= fence.len && close.rest.trim() === "") {
        fence = null;
      }
      continue;
    }

    const open = parseFence(line);
    if (open) {
      fence = { char: open.char, len: open.len };
      tokens.push({ kind: "code", text: line });
      continue;
    }

    const table = tryParseTable(lines, index);
    if (table) {
      for (const tableLine of table.lines) {
        tokens.push({ kind: "code", text: tableLine });
      }
      index = table.endIndex;
      continue;
    }

    if (line.trim() === "") {
      tokens.push({ kind: "blank" });
      continue;
    }

    if (isThematicBreak(line)) {
      tokens.push({ kind: "text", text: "---" });
      continue;
    }

    const heading = ATX_HEADING_PATTERN.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = (heading[2] ?? "").replace(/[ \t]+#+[ \t]*$/, "").trim();
      tokens.push({ kind: "heading", text: text ? `${"#".repeat(level)} ${text}` : "#".repeat(level) });
      continue;
    }

    tokens.push({ kind: "text", text: trimTrailing(normalizeListMarker(line)) });
  }

  return tokens;
}

/**
 * Collapse consecutive blank tokens to one, guarantee a single blank line on each side of every
 * heading, and trim leading/trailing blank tokens.
 */
function normalizeTokens(tokens: Token[]): Token[] {
  const collapsed: Token[] = [];
  for (const token of tokens) {
    const previous = collapsed[collapsed.length - 1];
    if (token.kind === "blank" && previous && previous.kind === "blank") {
      continue;
    }
    collapsed.push(token);
  }

  const padded: Token[] = [];
  for (let index = 0; index < collapsed.length; index += 1) {
    const token = collapsed[index];
    if (token.kind === "heading") {
      const previous = padded[padded.length - 1];
      if (previous && previous.kind !== "blank") {
        padded.push({ kind: "blank" });
      }
      padded.push(token);
      const next = collapsed[index + 1];
      if (next && next.kind !== "blank") {
        padded.push({ kind: "blank" });
      }
      continue;
    }
    const previous = padded[padded.length - 1];
    if (token.kind === "blank" && previous && previous.kind === "blank") {
      continue;
    }
    padded.push(token);
  }

  let start = 0;
  let end = padded.length;
  while (start < end && padded[start].kind === "blank") {
    start += 1;
  }
  while (end > start && padded[end - 1].kind === "blank") {
    end -= 1;
  }
  return padded.slice(start, end);
}

/**
 * Apply the Nexus "Clean up formatting" pass to a Markdown buffer (see the module comment for the
 * full list of normalizations). Returns the cleaned Markdown; the input is never mutated.
 */
export function cleanupMarkdownFormatting(markdown: string): string {
  const source = String(markdown ?? "");
  const allLines = source.split(/\r?\n/);

  // Freeze a leading, closed YAML frontmatter block so its contents are passed through verbatim.
  let bodyStart = 0;
  let frontmatter: string[] = [];
  if (allLines[0] === "---") {
    for (let index = 1; index < allLines.length; index += 1) {
      if (allLines[index] === "---") {
        frontmatter = allLines.slice(0, index + 1);
        bodyStart = index + 1;
        break;
      }
    }
  }

  const tokens = normalizeTokens(tokenizeBody(allLines.slice(bodyStart)));
  const body = tokens.map((token) => (token.kind === "blank" ? "" : token.text));

  if (frontmatter.length > 0) {
    return body.length > 0 ? [...frontmatter, "", ...body].join("\n") : frontmatter.join("\n");
  }
  return body.join("\n");
}
