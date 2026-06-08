const path = require("node:path");

const DEFAULT_RECENT_FILES_LIMIT = 10;

// Windows filesystems are case-insensitive, so the same file reached via different casing must
// dedupe to one entry; everywhere else paths are compared exactly.
function defaultComparePath(filePath, platform = process.platform) {
  const resolved = path.resolve(filePath);
  return platform === "win32" ? resolved.toLowerCase() : resolved;
}

function resolveOptions(options) {
  return {
    limit: options.limit ?? DEFAULT_RECENT_FILES_LIMIT,
    comparePath: options.comparePath ?? defaultComparePath
  };
}

// Normalize a raw (possibly persisted/corrupt) value into a clean recents list: keep only
// non-empty strings, drop duplicates (most-recent wins), and cap to the limit.
function sanitizeRecentFiles(value, options = {}) {
  const { limit, comparePath } = resolveOptions(options);
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  const result = [];
  for (const entry of value) {
    if (typeof entry !== "string" || entry.length === 0) {
      continue;
    }
    const key = comparePath(entry);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(entry);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}

// Return a new list with filePath promoted to the front (resolved to an absolute path), any prior
// occurrence removed, and the result capped to the limit. The input list is never mutated.
function addRecentFile(list, filePath, options = {}) {
  const { limit, comparePath } = resolveOptions(options);
  const current = Array.isArray(list) ? list : [];
  if (typeof filePath !== "string" || filePath.length === 0) {
    return current.slice(0, limit);
  }

  const resolved = path.resolve(filePath);
  const key = comparePath(resolved);
  const rest = current.filter((entry) => comparePath(entry) !== key);
  return [resolved, ...rest].slice(0, limit);
}

// Return a new list with every occurrence of filePath removed. The input list is never mutated.
function removeRecentFile(list, filePath, options = {}) {
  const { comparePath } = resolveOptions(options);
  const current = Array.isArray(list) ? list : [];
  if (typeof filePath !== "string" || filePath.length === 0) {
    return current.slice();
  }

  const key = comparePath(filePath);
  return current.filter((entry) => comparePath(entry) !== key);
}

module.exports = {
  DEFAULT_RECENT_FILES_LIMIT,
  defaultComparePath,
  sanitizeRecentFiles,
  addRecentFile,
  removeRecentFile
};
