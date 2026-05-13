export const DEFAULT_MARKDOWN = "";

const STORAGE_KEY = "nexus:draft:v1";

export type DraftState = {
  markdown: string;
  filePath?: string;
};

export function loadDraft(): DraftState {
  if (typeof localStorage === "undefined") {
    return createDefaultDraft();
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return createDefaultDraft();
    }

    const parsed = JSON.parse(stored) as Partial<DraftState>;
    return {
      markdown: typeof parsed.markdown === "string" ? parsed.markdown : DEFAULT_MARKDOWN,
      filePath: typeof parsed.filePath === "string" ? parsed.filePath : undefined
    };
  } catch {
    return createDefaultDraft();
  }
}

export function saveDraft(draft: DraftState) {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Local persistence is a convenience; editing must continue in memory.
  }
}

export function createDefaultDraft(): DraftState {
  return {
    markdown: DEFAULT_MARKDOWN,
    filePath: undefined
  };
}

export function normalizeMarkdownForDirtyCheck(markdown: string) {
  return markdown.replace(/\r\n?/g, "\n");
}

export function areMarkdownBuffersEquivalent(first: string, second: string) {
  return normalizeMarkdownForDirtyCheck(first) === normalizeMarkdownForDirtyCheck(second);
}
