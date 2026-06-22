import { describe, expect, it } from "vitest";
// This test lives under electron/ (outside the tsconfig "src" include) so it can import the raw
// CommonJS catalog used by the Electron main process and compare it against the renderer's
// TypeScript source of truth. The macOS application menu is built in the main process and can't
// import prompts.ts, so the catalog is duplicated in aiSelectionCatalog.cjs; if the two ever drift,
// a native-menu click would hand the renderer an action id / tone / language it doesn't recognize.
import {
  AI_SELECTION_ACTIONS as mainSelectionActions,
  AI_TONE_OPTIONS as mainToneOptions,
  AI_TRANSLATE_LANGUAGES as mainTranslateLanguages
} from "./aiSelectionCatalog.cjs";
import {
  AI_SELECTION_ACTIONS as rendererSelectionActions,
  AI_TONE_OPTIONS as rendererToneOptions,
  AI_TRANSLATE_LANGUAGES as rendererTranslateLanguages
} from "../src/lib/ai/prompts";

describe("AI selection catalog (main process) stays in sync with prompts.ts", () => {
  it("matches the selection actions (ids and labels)", () => {
    expect(mainSelectionActions).toEqual(
      rendererSelectionActions.map((action) => ({ id: action.id, label: action.label }))
    );
  });

  it("matches the tone options (labels and values)", () => {
    expect(mainToneOptions).toEqual(
      rendererToneOptions.map((tone) => ({ label: tone.label, value: tone.value }))
    );
  });

  it("matches the translate languages", () => {
    expect(mainTranslateLanguages).toEqual([...rendererTranslateLanguages]);
  });
});
