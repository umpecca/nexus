import path from "node:path";
import { describe, expect, it } from "vitest";
// The recents list logic is plain CommonJS shared with the Electron main process.
import {
  DEFAULT_RECENT_FILES_LIMIT,
  addRecentFile,
  defaultComparePath,
  removeRecentFile,
  sanitizeRecentFiles
} from "./recentFiles.cjs";

// Resolve the same way the module does so assertions hold on any host OS.
const abs = (value: string) => path.resolve(value);
// Deterministic case-insensitive comparator for platform-independent dedupe tests.
const caseInsensitive = (value: string) => path.resolve(value).toLowerCase();

describe("addRecentFile", () => {
  it("adds a resolved path to the front", () => {
    expect(addRecentFile([abs("a.md")], "b.md")).toEqual([abs("b.md"), abs("a.md")]);
  });

  it("moves an existing entry to the front instead of duplicating it", () => {
    const list = [abs("a.md"), abs("b.md"), abs("c.md")];
    expect(addRecentFile(list, "c.md")).toEqual([abs("c.md"), abs("a.md"), abs("b.md")]);
  });

  it("does not mutate the input list", () => {
    const list = [abs("a.md")];
    addRecentFile(list, "b.md");
    expect(list).toEqual([abs("a.md")]);
  });

  it("caps the list at the limit, dropping the oldest entry", () => {
    const list = [abs("1"), abs("2"), abs("3")];
    expect(addRecentFile(list, "4", { limit: 3 })).toEqual([abs("4"), abs("1"), abs("2")]);
  });

  it("dedupes using the provided comparator", () => {
    const list = [abs("Notes.md"), abs("other.md")];
    expect(addRecentFile(list, "NOTES.MD", { comparePath: caseInsensitive })).toEqual([
      abs("NOTES.MD"),
      abs("other.md")
    ]);
  });

  it("returns the existing list for an empty path", () => {
    expect(addRecentFile([abs("a.md")], "")).toEqual([abs("a.md")]);
  });
});

describe("removeRecentFile", () => {
  it("removes a matching entry", () => {
    expect(removeRecentFile([abs("a.md"), abs("b.md")], "a.md")).toEqual([abs("b.md")]);
  });

  it("is a no-op when the entry is absent", () => {
    expect(removeRecentFile([abs("a.md")], "missing.md")).toEqual([abs("a.md")]);
  });

  it("does not mutate the input list", () => {
    const list = [abs("a.md"), abs("b.md")];
    removeRecentFile(list, "a.md");
    expect(list).toEqual([abs("a.md"), abs("b.md")]);
  });
});

describe("sanitizeRecentFiles", () => {
  it("returns an empty array for non-array input", () => {
    expect(sanitizeRecentFiles(null)).toEqual([]);
    expect(sanitizeRecentFiles("nope")).toEqual([]);
  });

  it("drops non-string and empty entries", () => {
    const input = [abs("a.md"), "", 42, null, abs("b.md")];
    expect(sanitizeRecentFiles(input)).toEqual([abs("a.md"), abs("b.md")]);
  });

  it("dedupes, keeping the first occurrence", () => {
    expect(
      sanitizeRecentFiles([abs("A.md"), abs("a.md")], { comparePath: caseInsensitive })
    ).toEqual([abs("A.md")]);
  });

  it("caps to the limit", () => {
    expect(sanitizeRecentFiles([abs("1"), abs("2"), abs("3")], { limit: 2 })).toEqual([
      abs("1"),
      abs("2")
    ]);
  });
});

describe("defaultComparePath", () => {
  it("ignores case on win32", () => {
    expect(defaultComparePath("C:\\Users\\Doc.md", "win32")).toBe(
      defaultComparePath("c:\\users\\doc.md", "win32")
    );
  });

  it("preserves case on posix", () => {
    expect(defaultComparePath("/Docs/A.md", "linux")).not.toBe(
      defaultComparePath("/docs/a.md", "linux")
    );
  });
});

describe("DEFAULT_RECENT_FILES_LIMIT", () => {
  it("defaults to 10", () => {
    expect(DEFAULT_RECENT_FILES_LIMIT).toBe(10);
  });
});
