import { describe, expect, it } from "vitest";
import { DEFAULT_MARKDOWN, createDefaultDraft, loadDraft } from "./markdown";

describe("markdown draft helpers", () => {
  it("creates a default draft", () => {
    expect(createDefaultDraft()).toEqual({
      markdown: DEFAULT_MARKDOWN,
      filePath: undefined
    });
  });

  it("falls back to the default draft when storage is unavailable", () => {
    expect(loadDraft()).toEqual(createDefaultDraft());
  });
});
