/**
 * Unit tests for the pure footnote helpers — the node guards, the rich-text display
 * label, and the next-identifier picker the toolbar's insert control uses. The
 * Markdown ⇄ MDAST round-trip is covered separately in `footnotes.integration.test.ts`.
 */
import { describe, expect, it } from "vitest";
import type { FootnoteDefinition, FootnoteReference } from "mdast";
import {
  footnoteLabel,
  isFootnoteDefinition,
  isFootnoteReference,
  isValidFootnoteIdentifier,
  nextFootnoteIdentifier,
  normalizeFootnoteIdentifier
} from "./footnotes";

const reference = (identifier: string, label?: string): FootnoteReference => ({
  type: "footnoteReference",
  identifier,
  label
});

const definition = (identifier: string): FootnoteDefinition => ({
  type: "footnoteDefinition",
  identifier,
  children: []
});

describe("footnote node guards", () => {
  it("recognises references and definitions and rejects anything else", () => {
    expect(isFootnoteReference(reference("1"))).toBe(true);
    expect(isFootnoteReference(definition("1"))).toBe(false);
    expect(isFootnoteDefinition(definition("1"))).toBe(true);
    expect(isFootnoteDefinition(reference("1"))).toBe(false);
    expect(isFootnoteReference(null)).toBe(false);
    expect(isFootnoteDefinition({ type: "paragraph" })).toBe(false);
  });
});

describe("footnoteLabel", () => {
  it("prefers the original label and falls back to the identifier", () => {
    expect(footnoteLabel(reference("longnote", "LongNote"))).toBe("LongNote");
    expect(footnoteLabel(reference("2"))).toBe("2");
  });
});

describe("nextFootnoteIdentifier", () => {
  it("starts at 1 for an empty document", () => {
    expect(nextFootnoteIdentifier([])).toBe("1");
  });

  it("returns the next free integer after a contiguous run", () => {
    expect(nextFootnoteIdentifier(["1", "2"])).toBe("3");
  });

  it("fills the lowest gap", () => {
    expect(nextFootnoteIdentifier(["1", "3"])).toBe("2");
  });

  it("steps over non-numeric identifiers without renumbering them", () => {
    expect(nextFootnoteIdentifier(["longnote"])).toBe("1");
    expect(nextFootnoteIdentifier(["1", "longnote", "2"])).toBe("3");
  });
});

describe("normalizeFootnoteIdentifier", () => {
  it("trims and lower-cases so typed names match parsed identifiers", () => {
    expect(normalizeFootnoteIdentifier("LongNote")).toBe("longnote");
    expect(normalizeFootnoteIdentifier("  Intro  ")).toBe("intro");
    expect(normalizeFootnoteIdentifier("note-1")).toBe("note-1");
  });
});

describe("isValidFootnoteIdentifier", () => {
  it("accepts letters, digits, and . - _", () => {
    expect(isValidFootnoteIdentifier("longnote")).toBe(true);
    expect(isValidFootnoteIdentifier("note-1")).toBe(true);
    expect(isValidFootnoteIdentifier("v1.2_final")).toBe(true);
    expect(isValidFootnoteIdentifier("  trimmed  ")).toBe(true);
  });

  it("rejects blanks, whitespace, and bracket/caret characters that would not round-trip", () => {
    expect(isValidFootnoteIdentifier("")).toBe(false);
    expect(isValidFootnoteIdentifier("   ")).toBe(false);
    expect(isValidFootnoteIdentifier("two words")).toBe(false);
    expect(isValidFootnoteIdentifier("a]b")).toBe(false);
    expect(isValidFootnoteIdentifier("a[b")).toBe(false);
    expect(isValidFootnoteIdentifier("a^b")).toBe(false);
  });
});

