import { describe, expect, it } from "vitest";
import { areMarkdownBuffersEquivalent, createDefaultDraft, loadDraft } from "./markdown";

describe("markdown draft helpers", () => {
  it("creates a default draft", () => {
    expect(createDefaultDraft()).toEqual({
      markdown: "",
      filePath: undefined
    });
  });

  it("falls back to the default draft when storage is unavailable", () => {
    expect(loadDraft()).toEqual(createDefaultDraft());
  });

  it("treats line ending normalization as the same dirty-check content", () => {
    expect(areMarkdownBuffersEquivalent("one\r\ntwo\r\n", "one\ntwo\n")).toBe(true);
  });

  it("detects meaningful content changes after normalization", () => {
    expect(areMarkdownBuffersEquivalent("one\r\ntwo\r\n", "one\ntwo three\n")).toBe(false);
  });
});
