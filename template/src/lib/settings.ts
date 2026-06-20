// User preferences, persisted to localStorage. Kept deliberately small — extend UserSettings,
// createDefaultSettings, and sanitizeSettings together as you add fields.

export const APP_FONT_OPTIONS = [
  { label: "System Sans", value: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  { label: "Roboto", value: "Roboto, Arial, sans-serif" },
  { label: "Open Sans", value: '"Open Sans", Arial, sans-serif' },
  { label: "Lato", value: "Lato, Arial, sans-serif" },
  { label: "Source Sans 3", value: '"Source Sans 3", Arial, sans-serif' },
  { label: "Segoe UI", value: '"Segoe UI", Arial, sans-serif' },
  { label: "Merriweather", value: "Merriweather, Georgia, serif" },
  { label: "Source Serif 4", value: '"Source Serif 4", Georgia, serif' },
  { label: "Georgia", value: 'Georgia, "Times New Roman", serif' },
  { label: "Cambria", value: "Cambria, Georgia, serif" },
  { label: "JetBrains Mono", value: '"JetBrains Mono", "Courier New", monospace' },
  { label: "Roboto Mono", value: '"Roboto Mono", "Courier New", monospace' },
  { label: "Consolas", value: 'Consolas, "Courier New", monospace' },
  { label: "Courier New", value: '"Courier New", monospace' }
] as const;

export const APP_THEME_OPTIONS = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Sky", value: "sky" },
  { label: "Dark", value: "dark" }
] as const;

export type AppFontFamily = (typeof APP_FONT_OPTIONS)[number]["value"];
export type AppThemePreference = (typeof APP_THEME_OPTIONS)[number]["value"];

export const DEFAULT_APP_FONT_FAMILY: AppFontFamily = APP_FONT_OPTIONS[0].value;
export const DEFAULT_THEME_PREFERENCE: AppThemePreference = "system";

export type UserSettings = {
  themePreference: AppThemePreference;
  fontFamily: AppFontFamily;
  /** A demo boolean wired through the Settings dialog, the View menu, and the menubar checkbox. */
  sampleToggle: boolean;
};

const SETTINGS_KEY = "app-template:settings:v1";

function isAppFontFamily(value: unknown): value is AppFontFamily {
  return APP_FONT_OPTIONS.some((option) => option.value === value);
}

function isAppThemePreference(value: unknown): value is AppThemePreference {
  return APP_THEME_OPTIONS.some((option) => option.value === value);
}

export function createDefaultSettings(): UserSettings {
  return {
    themePreference: DEFAULT_THEME_PREFERENCE,
    fontFamily: DEFAULT_APP_FONT_FAMILY,
    sampleToggle: true
  };
}

/** Coerce arbitrary parsed JSON into valid settings, falling back to defaults per field. */
export function sanitizeSettings(value: unknown): UserSettings {
  const source = typeof value === "object" && value !== null ? (value as Partial<UserSettings>) : {};

  return {
    themePreference: isAppThemePreference(source.themePreference)
      ? source.themePreference
      : DEFAULT_THEME_PREFERENCE,
    fontFamily: isAppFontFamily(source.fontFamily) ? source.fontFamily : DEFAULT_APP_FONT_FAMILY,
    sampleToggle: typeof source.sampleToggle === "boolean" ? source.sampleToggle : true
  };
}

export function loadSettings(): UserSettings {
  if (typeof localStorage === "undefined") {
    return createDefaultSettings();
  }

  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (!stored) {
      return createDefaultSettings();
    }
    return sanitizeSettings(JSON.parse(stored));
  } catch {
    return createDefaultSettings();
  }
}

export function saveSettings(settings: UserSettings) {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Persistence is a convenience; keep the in-memory preference active on failure.
  }
}

export function resetSettings() {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(SETTINGS_KEY);
  } catch {
    // Ignore; the caller still resets in-memory state.
  }
}
