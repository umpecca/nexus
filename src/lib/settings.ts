export const DEFAULT_EDITOR_FONT_FAMILY =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export const EDITOR_FONT_OPTIONS = [
  { label: "System Sans", value: DEFAULT_EDITOR_FONT_FAMILY },
  { label: "Segoe UI", value: '"Segoe UI", Arial, sans-serif' },
  { label: "Georgia", value: 'Georgia, "Times New Roman", serif' },
  { label: "Cambria", value: 'Cambria, Georgia, serif' },
  { label: "Consolas", value: 'Consolas, "Courier New", monospace' },
  { label: "Courier New", value: '"Courier New", monospace' }
] as const;

export type EditorFontFamily = (typeof EDITOR_FONT_OPTIONS)[number]["value"];

export type UserSettings = {
  fontFamily: EditorFontFamily;
};

const SETTINGS_KEY_PREFIX = "nexus:settings:v1";

function sanitizeProfileName(profileName: string) {
  return encodeURIComponent(profileName.trim() || "default");
}

export function getSettingsStorageKey(profileName: string) {
  return `${SETTINGS_KEY_PREFIX}:${sanitizeProfileName(profileName)}`;
}

function isEditorFontFamily(value: unknown): value is EditorFontFamily {
  return EDITOR_FONT_OPTIONS.some((option) => option.value === value);
}

export function createDefaultSettings(): UserSettings {
  return {
    fontFamily: DEFAULT_EDITOR_FONT_FAMILY
  };
}

export function loadSettings(profileName: string): UserSettings {
  if (typeof localStorage === "undefined") {
    return createDefaultSettings();
  }

  try {
    const stored = localStorage.getItem(getSettingsStorageKey(profileName));
    if (!stored) {
      return createDefaultSettings();
    }

    const parsed = JSON.parse(stored) as Partial<UserSettings>;
    return {
      fontFamily: isEditorFontFamily(parsed.fontFamily)
        ? parsed.fontFamily
        : DEFAULT_EDITOR_FONT_FAMILY
    };
  } catch {
    return createDefaultSettings();
  }
}

export function saveSettings(profileName: string, settings: UserSettings) {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.setItem(getSettingsStorageKey(profileName), JSON.stringify(settings));
  } catch {
    // Settings persistence is a convenience; keep the in-memory preference active.
  }
}
