// Source of truth for the AI selection catalog *in the main process*. The macOS application menu is
// built here (Node/CommonJS) and can't import the renderer's TypeScript module, so this duplicates
// the catalog from src/lib/ai/prompts.ts. aiSelectionCatalog.test.ts asserts the two stay identical
// so a drift can't silently send the renderer an action id / tone / language it doesn't recognize.
const AI_SELECTION_ACTIONS = [
  { id: "improve", label: "Improve writing" },
  { id: "shorten", label: "Make shorter" },
  { id: "expand", label: "Make longer" },
  { id: "grammar", label: "Fix spelling & grammar" },
  { id: "summarize", label: "Summarize" }
];

const AI_TONE_OPTIONS = [
  { label: "Formal", value: "formal" },
  { label: "Casual", value: "casual" },
  { label: "Confident", value: "confident" },
  { label: "Friendly", value: "friendly" }
];

const AI_TRANSLATE_LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Portuguese",
  "Italian",
  "Chinese",
  "Japanese",
  "Korean"
];

module.exports = { AI_SELECTION_ACTIONS, AI_TONE_OPTIONS, AI_TRANSLATE_LANGUAGES };
