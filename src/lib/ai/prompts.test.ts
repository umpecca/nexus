import { describe, expect, it } from "vitest";
import {
  AI_SELECTION_ACTIONS,
  AI_SELECTION_BASE_SYSTEM,
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

describe("describeSelectionAction", () => {
  it("labels simple actions", () => {
    expect(describeSelectionAction("summarize")).toBe("Summarize");
  });

  it("appends the option for tone and translate", () => {
    expect(describeSelectionAction("tone", { tone: "casual" })).toBe("Change tone · casual");
    expect(describeSelectionAction("translate", { language: "French" })).toBe("Translate · French");
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
