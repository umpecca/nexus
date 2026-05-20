export const DEFAULT_EDITOR_FONT_FAMILY =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
export const DEFAULT_EDITOR_THEME_PREFERENCE = "system";

export const EDITOR_FONT_OPTIONS = [
  { label: "System Sans", value: DEFAULT_EDITOR_FONT_FAMILY },
  { label: "Roboto", value: "Roboto, Arial, sans-serif" },
  { label: "Open Sans", value: '"Open Sans", Arial, sans-serif' },
  { label: "Lato", value: "Lato, Arial, sans-serif" },
  { label: "Source Sans 3", value: '"Source Sans 3", Arial, sans-serif' },
  { label: "Segoe UI", value: '"Segoe UI", Arial, sans-serif' },
  { label: "Merriweather", value: "Merriweather, Georgia, serif" },
  { label: "Source Serif 4", value: '"Source Serif 4", Georgia, serif' },
  { label: "Georgia", value: 'Georgia, "Times New Roman", serif' },
  { label: "Cambria", value: 'Cambria, Georgia, serif' },
  { label: "JetBrains Mono", value: '"JetBrains Mono", "Courier New", monospace' },
  { label: "Roboto Mono", value: '"Roboto Mono", "Courier New", monospace' },
  { label: "Consolas", value: 'Consolas, "Courier New", monospace' },
  { label: "Courier New", value: '"Courier New", monospace' }
] as const;

export const EDITOR_THEME_OPTIONS = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" }
] as const;

export const DEFAULT_EDITOR_PAGE_SIZE = "Letter";
export const DEFAULT_EDITOR_PAGE_ORIENTATION = "portrait";
export const DEFAULT_EDITOR_FONT_SIZE_PIXELS = 16;
export const EDITOR_FONT_SIZE_MIN_PIXELS = 12;
export const EDITOR_FONT_SIZE_MAX_PIXELS = 24;
export const EDITOR_FONT_SIZE_STEP_PIXELS = 1;
export const DEFAULT_EDITOR_PARAGRAPH_SPACING_PIXELS = 16;
export const EDITOR_PARAGRAPH_SPACING_MIN_PIXELS = 0;
export const EDITOR_PARAGRAPH_SPACING_MAX_PIXELS = 32;
export const EDITOR_PARAGRAPH_SPACING_STEP_PIXELS = 1;
export const DEFAULT_EDITOR_PAGE_MARGIN_INCHES = 1;
export const EDITOR_PAGE_MARGIN_MIN_INCHES = 0.25;
export const EDITOR_PAGE_MARGIN_MAX_INCHES = 2;
export const EDITOR_PAGE_MARGIN_STEP_INCHES = 0.25;

export const EDITOR_PAGE_SIZE_OPTIONS = [
  { label: "Letter", value: "Letter", widthInches: 8.5, heightInches: 11 },
  { label: "A4", value: "A4", widthInches: 8.27, heightInches: 11.69 }
] as const;

export const EDITOR_PAGE_ORIENTATION_OPTIONS = [
  { label: "Portrait", value: "portrait" },
  { label: "Landscape", value: "landscape" }
] as const;

export const EDITOR_PAGE_MARGIN_SIDES = [
  { label: "Top", value: "top" },
  { label: "Right", value: "right" },
  { label: "Bottom", value: "bottom" },
  { label: "Left", value: "left" }
] as const;

export type EditorFontFamily = (typeof EDITOR_FONT_OPTIONS)[number]["value"];
export type EditorThemePreference = (typeof EDITOR_THEME_OPTIONS)[number]["value"];
export type EditorPageSize = (typeof EDITOR_PAGE_SIZE_OPTIONS)[number]["value"];
export type EditorPageOrientation = (typeof EDITOR_PAGE_ORIENTATION_OPTIONS)[number]["value"];
export type EditorPageMarginSide = (typeof EDITOR_PAGE_MARGIN_SIDES)[number]["value"];
export type EditorPageMargins = Record<EditorPageMarginSide, number>;

export type UserSettings = {
  fontFamily: EditorFontFamily;
  fontSizePixels: number;
  paragraphSpacingPixels: number;
  themePreference: EditorThemePreference;
  paperViewEnabled: boolean;
  responsiveContentWrappingEnabled: boolean;
  pageSize: EditorPageSize;
  pageOrientation: EditorPageOrientation;
  pageMargins: EditorPageMargins;
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

function isEditorThemePreference(value: unknown): value is EditorThemePreference {
  return EDITOR_THEME_OPTIONS.some((option) => option.value === value);
}

function isEditorPageSize(value: unknown): value is EditorPageSize {
  return EDITOR_PAGE_SIZE_OPTIONS.some((option) => option.value === value);
}

function isEditorPageOrientation(value: unknown): value is EditorPageOrientation {
  return EDITOR_PAGE_ORIENTATION_OPTIONS.some((option) => option.value === value);
}

export function getEditorPageSizeOption(pageSize: EditorPageSize) {
  return (
    EDITOR_PAGE_SIZE_OPTIONS.find((option) => option.value === pageSize) ??
    EDITOR_PAGE_SIZE_OPTIONS[0]
  );
}

export function sanitizeEditorFontSize(value: unknown) {
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= EDITOR_FONT_SIZE_MIN_PIXELS &&
    value <= EDITOR_FONT_SIZE_MAX_PIXELS
  ) {
    return value;
  }

  return DEFAULT_EDITOR_FONT_SIZE_PIXELS;
}

export function sanitizeEditorParagraphSpacing(value: unknown) {
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= EDITOR_PARAGRAPH_SPACING_MIN_PIXELS &&
    value <= EDITOR_PARAGRAPH_SPACING_MAX_PIXELS
  ) {
    return value;
  }

  return DEFAULT_EDITOR_PARAGRAPH_SPACING_PIXELS;
}

function sanitizePaperViewEnabled(value: unknown) {
  return typeof value === "boolean" ? value : true;
}

function sanitizeResponsiveContentWrappingEnabled(value: unknown) {
  return typeof value === "boolean" ? value : true;
}

export function createDefaultPageMargins(): EditorPageMargins {
  return {
    top: DEFAULT_EDITOR_PAGE_MARGIN_INCHES,
    right: DEFAULT_EDITOR_PAGE_MARGIN_INCHES,
    bottom: DEFAULT_EDITOR_PAGE_MARGIN_INCHES,
    left: DEFAULT_EDITOR_PAGE_MARGIN_INCHES
  };
}

function sanitizeEditorPageMargin(value: unknown) {
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= EDITOR_PAGE_MARGIN_MIN_INCHES &&
    value <= EDITOR_PAGE_MARGIN_MAX_INCHES
  ) {
    return value;
  }

  return DEFAULT_EDITOR_PAGE_MARGIN_INCHES;
}

export function sanitizeEditorPageMargins(value: unknown): EditorPageMargins {
  const margins = typeof value === "object" && value !== null ? value : {};

  return {
    top: sanitizeEditorPageMargin((margins as Partial<EditorPageMargins>).top),
    right: sanitizeEditorPageMargin((margins as Partial<EditorPageMargins>).right),
    bottom: sanitizeEditorPageMargin((margins as Partial<EditorPageMargins>).bottom),
    left: sanitizeEditorPageMargin((margins as Partial<EditorPageMargins>).left)
  };
}

export function createDefaultSettings(): UserSettings {
  return {
    fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
    fontSizePixels: DEFAULT_EDITOR_FONT_SIZE_PIXELS,
    paragraphSpacingPixels: DEFAULT_EDITOR_PARAGRAPH_SPACING_PIXELS,
    themePreference: DEFAULT_EDITOR_THEME_PREFERENCE,
    paperViewEnabled: true,
    responsiveContentWrappingEnabled: true,
    pageSize: DEFAULT_EDITOR_PAGE_SIZE,
    pageOrientation: DEFAULT_EDITOR_PAGE_ORIENTATION,
    pageMargins: createDefaultPageMargins()
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
        : DEFAULT_EDITOR_FONT_FAMILY,
      fontSizePixels: sanitizeEditorFontSize(parsed.fontSizePixels),
      paragraphSpacingPixels: sanitizeEditorParagraphSpacing(parsed.paragraphSpacingPixels),
      themePreference: isEditorThemePreference(parsed.themePreference)
        ? parsed.themePreference
        : DEFAULT_EDITOR_THEME_PREFERENCE,
      paperViewEnabled: sanitizePaperViewEnabled(parsed.paperViewEnabled),
      responsiveContentWrappingEnabled: sanitizeResponsiveContentWrappingEnabled(
        parsed.responsiveContentWrappingEnabled
      ),
      pageSize: isEditorPageSize(parsed.pageSize) ? parsed.pageSize : DEFAULT_EDITOR_PAGE_SIZE,
      pageOrientation: isEditorPageOrientation(parsed.pageOrientation)
        ? parsed.pageOrientation
        : DEFAULT_EDITOR_PAGE_ORIENTATION,
      pageMargins: sanitizeEditorPageMargins(parsed.pageMargins)
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

export function resetSettings(profileName: string) {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(getSettingsStorageKey(profileName));
  } catch {
    // Settings persistence is a convenience; the caller can still reset in memory.
  }
}
