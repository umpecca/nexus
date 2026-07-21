import { describe, expect, it } from "vitest";
import {
  AI_SELECTION_ACTIONS,
  AI_SELECTION_BASE_SYSTEM,
  buildChatSystemPrompt,
  buildDocumentImportPrompt,
  buildSelectionPrompt,
  describeSelectionAction
} from "./prompts";

describe("buildSelectionPrompt", () => {
  it("uses the shared base system instruction and includes the selected text", () => {
    const prompt = buildSelectionPrompt("improve", "the quick brown fox");
    expect(prompt.system).toBe(AI_SELECTION_BASE_SYSTEM);
    expect(prompt.user).toContain("the quick brown fox");
    expect(prompt.user.toLowerCase()).toContain("clearer");
  });

  it("injects the tone into the tone action", () => {
    const prompt = buildSelectionPrompt("tone", "hello", { tone: "formal" });
    expect(prompt.user).toContain("formal tone");
    expect(prompt.user).toContain("hello");
  });

  it("injects the target language into the translate action", () => {
    const prompt = buildSelectionPrompt("translate", "hello", { language: "Spanish" });
    expect(prompt.user).toContain("Spanish");
  });

  it("falls back to neutral/English when options are omitted", () => {
    expect(buildSelectionPrompt("tone", "x").user).toContain("neutral tone");
    expect(buildSelectionPrompt("translate", "x").user).toContain("English");
  });
});

describe("buildDocumentImportPrompt", () => {
  it("requires ordered source markers and Markdown-only transcription", () => {
    const prompt = buildDocumentImportPrompt();
    expect(prompt.system).toContain("exact HTML comment marker");
    expect(prompt.system).toContain("preserve source order");
      expect(prompt.system).toContain("language `math`");
      expect(prompt.system).toContain("inline code span prefixed with `math:`");
      expect(prompt.system).toContain("normalized bounding-box marker");
      expect(prompt.user).toContain("ordered sources");
  });
});

describe("describeSelectionAction", () => {
  it("labels simple actions", () => {
    expect(describeSelectionAction("summarize")).toBe("Summarize");
  });

  it("appends the option for tone and translate", () => {
    expect(describeSelectionAction("tone", { tone: "casual" })).toBe("Change tone · casual");
    expect(describeSelectionAction("translate", { language: "French" })).toBe("Translate · French");
  });
});

describe("buildChatSystemPrompt", () => {
  it("frames the assistant around the nexus_* tools and approval gate", () => {
    const system = buildChatSystemPrompt();
    expect(system).toContain("Nexus AI");
    expect(system).toContain("nexus_get_outline");
    expect(system).toContain("nexus_apply_edits");
    expect(system.toLowerCase()).toContain("approval");
  });

  it("includes the file name when provided", () => {
    expect(buildChatSystemPrompt({ fileName: "notes.md" })).toContain("notes.md");
  });

  it("tells the model tools are scoped to the document so no windowId is needed", () => {
    expect(buildChatSystemPrompt().toLowerCase()).toContain("never need to pass a windowid");
  });

  it("describes an untitled document when no file name is given", () => {
    expect(buildChatSystemPrompt().toLowerCase()).toContain("untitled");
  });
});

describe("AI_SELECTION_ACTIONS", () => {
  it("exposes the simple action catalog with stable ids", () => {
    expect(AI_SELECTION_ACTIONS.map((action) => action.id)).toEqual([
      "improve",
      "shorten",
      "expand",
      "grammar",
      "summarize"
    ]);
  });
});
