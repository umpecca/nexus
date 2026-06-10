// Pure logic for the in-buffer MCP write tools (nexus_apply_edits, nexus_replace_section,
// nexus_set_frontmatter). Each function takes the current Markdown and returns either
// `{ ok: true, markdown }` with the proposed full buffer (which the main process then routes through
// the existing write-confirmation/apply pipeline) or `{ ok: false, reason, ... }` describing why the
// edit could not be located/applied — in which case no confirmation dialog is shown. No Electron
// dependencies, so this runs against the cached document and is unit-tested in
// `src/lib/mcpDocumentEdits.test.ts`.

const mcpDocumentTools = require("./mcpDocumentTools.cjs");

// Leading `---` ... `---` block. Mirrors the boundary handling of `stripMarkdownFrontmatter` in
// `electron/main.cjs`; the trailing group consumes a single newline after the closing fence.
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
// A single `key: value` scalar line. Anything else in the block is treated as unsupported YAML.
const SCALAR_LINE_PATTERN = /^([A-Za-z0-9_][A-Za-z0-9_-]*):[ \t]?(.*)$/;

function countGlobalMatches(source, globalRegex) {
  let count = 0;
  let match;
  globalRegex.lastIndex = 0;
  while ((match = globalRegex.exec(source)) !== null) {
    count += 1;
    // Zero-width matches (e.g. `a*`) would otherwise spin on the same index forever.
    if (match[0].length === 0) {
      globalRegex.lastIndex += 1;
    }
  }
  return count;
}

function applyOneEdit(current, edit, editIndex) {
  const find = typeof edit?.find === "string" ? edit.find : null;
  const replace = typeof edit?.replace === "string" ? edit.replace : null;

  if (find === null || find.length === 0) {
    return {
      ok: false,
      reason: "invalid-edit",
      editIndex,
      message: "Each edit needs a non-empty 'find' string."
    };
  }
  if (replace === null) {
    return {
      ok: false,
      reason: "invalid-edit",
      editIndex,
      message: "Each edit needs a string 'replace' value."
    };
  }

  const all = Boolean(edit.all);
  const isRegex = Boolean(edit.isRegex);

  if (isRegex) {
    let countRegex;
    let replaceRegex;
    try {
      countRegex = new RegExp(find, "g");
      replaceRegex = new RegExp(find, all ? "g" : "");
    } catch (error) {
      return {
        ok: false,
        reason: "invalid-regex",
        editIndex,
        message: error instanceof Error ? error.message : String(error)
      };
    }

    const matchCount = countGlobalMatches(current, countRegex);
    if (matchCount === 0) {
      return { ok: false, reason: "anchor-not-found", editIndex, find };
    }
    if (!all && matchCount > 1) {
      return { ok: false, reason: "ambiguous", editIndex, find, matchCount };
    }
    // Regex mode honors `$1`/`$&` replacement patterns via String.prototype.replace.
    return { ok: true, markdown: current.replace(replaceRegex, replace) };
  }

  // Literal mode: count and replace without interpreting `$` patterns.
  const matchCount = current.split(find).length - 1;
  if (matchCount === 0) {
    return { ok: false, reason: "anchor-not-found", editIndex, find };
  }
  if (!all && matchCount > 1) {
    return { ok: false, reason: "ambiguous", editIndex, find, matchCount };
  }

  if (all) {
    return { ok: true, markdown: current.split(find).join(replace) };
  }

  const index = current.indexOf(find);
  return {
    ok: true,
    markdown: current.slice(0, index) + replace + current.slice(index + find.length)
  };
}

/**
 * Apply an ordered list of find/replace edits to the document. Each edit is `{ find, replace, all?,
 * isRegex? }`; literal by default. An edit whose `find` is missing matches nothing, and (unless
 * `all`) matches more than once, fails the whole batch without mutating the document — this is what
 * keeps edits safe when the caller's read was stale.
 */
function applyEdits(markdown, edits) {
  if (!Array.isArray(edits) || edits.length === 0) {
    return {
      ok: false,
      reason: "invalid-edits",
      message: "apply_edits requires a non-empty 'edits' array."
    };
  }

  let current = String(markdown ?? "");
  for (let i = 0; i < edits.length; i += 1) {
    const result = applyOneEdit(current, edits[i], i);
    if (!result.ok) {
      return result;
    }
    current = result.markdown;
  }

  return { ok: true, markdown: current, editsApplied: edits.length };
}

/**
 * Replace a whole section (heading through the line before the next same-or-higher heading) with
 * caller-supplied Markdown, selected by `index`, `slug`, or `heading`. An empty replacement deletes
 * the section. Reuses `getSectionRange` so the span matches what `nexus_get_section` returns.
 */
function replaceSection(markdown, selector, newMarkdown) {
  if (typeof newMarkdown !== "string") {
    return { ok: false, reason: "invalid-markdown", message: "replace_section requires a string 'markdown'." };
  }

  const range = mcpDocumentTools.getSectionRange(markdown, selector);
  if (!range.found) {
    return {
      ok: false,
      reason: range.reason === "no-headings" ? "no-headings" : "section-not-found",
      headings: range.headings.map(mcpDocumentTools.toPublicHeading)
    };
  }

  const { lines, startLine0, endLine0 } = range;
  const replacement = newMarkdown === "" ? [] : newMarkdown.split(/\r?\n/);
  const nextLines = [...lines.slice(0, startLine0), ...replacement, ...lines.slice(endLine0)];
  return { ok: true, markdown: nextLines.join("\n") };
}

function parseScalarFrontmatter(block) {
  const entries = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.trim() === "") {
      continue;
    }
    const match = SCALAR_LINE_PATTERN.exec(line);
    if (!match) {
      return null;
    }
    entries.push({ key: match[1], value: match[2] });
  }
  return entries;
}

function isSupportedFrontmatterValue(value) {
  if (typeof value === "number" || typeof value === "boolean") {
    return true;
  }
  // Reject newline-bearing strings: they would split into invalid extra block lines.
  return typeof value === "string" && !/[\r\n]/.test(value);
}

/**
 * Merge/set/remove scalar YAML frontmatter fields, creating the `---` block when absent and dropping
 * it when the last field is removed. Existing-key order is preserved and new keys are appended. If the
 * existing frontmatter contains anything beyond simple `key: value` scalars (nested maps, sequences,
 * block scalars) it is left untouched and the call fails with `frontmatter-unsupported` rather than
 * risk corrupting it.
 */
function setFrontmatter(markdown, changes) {
  const source = String(markdown ?? "");
  const set = changes && typeof changes.set === "object" && changes.set !== null ? changes.set : {};
  const remove = Array.isArray(changes?.remove)
    ? changes.remove.filter((key) => typeof key === "string")
    : [];
  const setKeys = Object.keys(set);

  for (const key of setKeys) {
    if (!isSupportedFrontmatterValue(set[key])) {
      return { ok: false, reason: "unsupported-value", key };
    }
  }
  if (setKeys.length === 0 && remove.length === 0) {
    return { ok: false, reason: "no-changes", message: "set_frontmatter needs 'set' and/or 'remove'." };
  }

  const match = FRONTMATTER_PATTERN.exec(source);
  let entries;
  let rest;
  if (match) {
    entries = parseScalarFrontmatter(match[1]);
    if (entries === null) {
      return { ok: false, reason: "frontmatter-unsupported" };
    }
    rest = source.slice(match[0].length);
  } else {
    entries = [];
    rest = source;
  }

  const removeSet = new Set(remove);
  entries = entries.filter((entry) => !removeSet.has(entry.key));

  for (const key of setKeys) {
    const value = typeof set[key] === "string" ? set[key] : String(set[key]);
    const existing = entries.find((entry) => entry.key === key);
    if (existing) {
      existing.value = value;
    } else {
      entries.push({ key, value });
    }
  }

  if (entries.length === 0) {
    // The last field was removed; drop the block and one leading newline from the body.
    return { ok: true, markdown: rest.replace(/^\r?\n/, "") };
  }

  const block = ["---", ...entries.map((entry) => `${entry.key}: ${entry.value}`), "---"].join("\n");
  return { ok: true, markdown: rest.length === 0 ? `${block}\n` : `${block}\n${rest}` };
}

module.exports = {
  applyEdits,
  replaceSection,
  setFrontmatter
};
