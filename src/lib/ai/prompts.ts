// Prompt builders for the AI features, kept in one tested place so prompt wording is consistent and
// changeable without touching UI code. Selection actions all share a base system instruction that
// pins the model to "reply with only the replacement Markdown" — no preamble, no code fences — so the
// result can be dropped straight back into the document.

export type AiPrompt = { system: string; user: string };

export type SelectionActionId =
  | "improve"
  | "shorten"
  | "expand"
  | "grammar"
  | "tone"
  | "translate"
  | "summarize";

export type SelectionActionOptions = {
  /** Target tone for the "tone" action (e.g. "formal"). */
  tone?: string;
  /** Target language for the "translate" action (e.g. "Spanish"). */
  language?: string;
};

export const AI_SELECTION_BASE_SYSTEM =
  "You are a writing assistant embedded in a Markdown editor. You transform the user's selected text " +
  "and reply with ONLY the replacement text as Markdown — no preamble, no explanation, and no " +
  "surrounding code fences. Preserve the original Markdown formatting unless the instruction says " +
  "otherwise.";

/** Tone choices offered in the "Change tone" submenu. */
export const AI_TONE_OPTIONS = [
  { label: "Formal", value: "formal" },
  { label: "Casual", value: "casual" },
  { label: "Confident", value: "confident" },
  { label: "Friendly", value: "friendly" }
] as const;

/** Languages offered in the "Translate" submenu. */
export const AI_TRANSLATE_LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Portuguese",
  "Italian",
  "Chinese",
  "Japanese",
  "Korean"
] as const;

/** Simple (no-option) selection actions, used to build the menu/toolbar entries. */
export const AI_SELECTION_ACTIONS = [
  { id: "improve", label: "Improve writing" },
  { id: "shorten", label: "Make shorter" },
  { id: "expand", label: "Make longer" },
  { id: "grammar", label: "Fix spelling & grammar" },
  { id: "summarize", label: "Summarize" }
] as const satisfies ReadonlyArray<{ id: SelectionActionId; label: string }>;

function selectionInstruction(action: SelectionActionId, options: SelectionActionOptions): string {
  switch (action) {
    case "improve":
      return "Rewrite the text to be clearer, more concise, and well-structured, keeping its original meaning and language.";
    case "shorten":
      return "Make the text shorter and more concise while keeping its key points and language.";
    case "expand":
      return "Expand the text with more detail and supporting points, keeping its meaning, tone, and language.";
    case "grammar":
      return "Correct spelling, grammar, and punctuation. Change wording only where needed for correctness; keep the original meaning, tone, and language.";
    case "tone":
      return `Rewrite the text in a ${options.tone ?? "neutral"} tone, keeping its meaning and language.`;
    case "translate":
      return `Translate the text into ${options.language ?? "English"}, preserving Markdown formatting and meaning. Reply with only the translation.`;
    case "summarize":
      return "Summarize the text concisely, keeping its language. Reply with the summary only.";
    default:
      return "Rewrite the text, keeping its meaning and language.";
  }
}

/** Build the system+user prompt for a selection action over `selectedText`. */
export function buildSelectionPrompt(
  action: SelectionActionId,
  selectedText: string,
  options: SelectionActionOptions = {}
): AiPrompt {
  return {
    system: AI_SELECTION_BASE_SYSTEM,
    user: `${selectionInstruction(action, options)}\n\n---\n${selectedText}`
  };
}

export type ChatPromptContext = {
  /** The open document's file name (or null/undefined for an untitled draft). */
  fileName?: string | null;
};

/**
 * System prompt for the in-app AI chat panel. It frames the model as an assistant embedded in the
 * editor that should reach for the `nexus_*` tools to read and edit the open document rather than
 * guessing, and reminds it that edits are gated by the user's approval. Every tool call is pinned to
 * this panel's own document by the renderer, so the model never needs to deal with windowId.
 */
export function buildChatSystemPrompt(context: ChatPromptContext = {}): string {
  const documentLine = context.fileName
    ? `The user is currently editing the document "${context.fileName}".`
    : "The user is currently editing an untitled document.";

  return [
    "You are Nexus AI, a helpful assistant embedded in the side panel of the Nexus Markdown editor.",
    documentLine +
      " All of your tools operate on this one document automatically, so you never need to pass a windowId.",
    "You have tools (named nexus_*) to read and edit this document. Before answering questions about " +
      "its content or structure, read it with the tools (nexus_get_document, nexus_get_outline, " +
      "nexus_get_section, nexus_search_document, nexus_find, nexus_get_selection) instead of guessing.",
    "To change the document, use the editing tools (nexus_apply_edits for targeted find/replace, " +
      "nexus_replace_section for a whole section, nexus_set_frontmatter for metadata, or " +
      "nexus_replace_document as a last resort). Every edit is shown to the user for approval before " +
      "it is applied, so keep edits focused and briefly explain what you changed.",
    "Reply in concise GitHub-flavored Markdown."
  ].join("\n\n");
}

/** Human-readable label for an action (used in the preview dialog title and status messages). */
export function describeSelectionAction(
  action: SelectionActionId,
  options: SelectionActionOptions = {}
): string {
  switch (action) {
    case "improve":
      return "Improve writing";
    case "shorten":
      return "Make shorter";
    case "expand":
      return "Make longer";
    case "grammar":
      return "Fix spelling & grammar";
    case "tone":
      return `Change tone${options.tone ? ` · ${options.tone}` : ""}`;
    case "translate":
      return `Translate${options.language ? ` · ${options.language}` : ""}`;
    case "summarize":
      return "Summarize";
    default:
      return "Rewrite";
  }
}
