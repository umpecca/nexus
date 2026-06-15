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
  { label: "Sky", value: "sky" },
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

export const DEFAULT_OUTLINE_WIDTH_PIXELS = 256;
export const OUTLINE_WIDTH_MIN_PIXELS = 180;
export const OUTLINE_WIDTH_MAX_PIXELS = 560;

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

export const MCP_SERVER_DEFAULT_PORT = 39125;
export const MCP_SERVER_MIN_PORT = 1024;
export const MCP_SERVER_MAX_PORT = 65535;
export const MCP_SERVER_DEFAULT_HOST = "127.0.0.1";

export const MCP_AUTH_MODE_OPTIONS = [
  { label: "Bearer token (recommended)", value: "bearer" },
  { label: "No authentication", value: "none" }
] as const;

export type McpAuthMode = (typeof MCP_AUTH_MODE_OPTIONS)[number]["value"];

export type McpServerSettings = {
  enabled: boolean;
  port: number;
  authMode: McpAuthMode;
  /**
   * The MCP bearer token. Held in memory at runtime, but a secret at rest: it is NOT persisted in
   * localStorage (saveSettings strips it) and is instead encrypted by the main process via Electron
   * safeStorage. See readLegacyMcpBearerToken for the one-time migration of plaintext tokens.
   */
  bearerToken: string;
  /**
   * When true, MCP write tool calls apply immediately without the per-call diff confirmation dialog.
   * Off by default; intended only for trusted local sessions.
   */
  autoApproveWrites: boolean;
  /** Optional ngrok tunnel that exposes the loopback MCP server publicly. Off by default. */
  ngrokEnabled: boolean;
  /** Optional reserved/custom ngrok domain; used when set, otherwise a random URL is assigned. */
  ngrokDomain: string;
  /** When true, spawn the ngrok binary at ngrokPath instead of resolving it from PATH. */
  ngrokUseCustomPath: boolean;
  /** Explicit path to the ngrok executable; used only when ngrokUseCustomPath is true and non-empty. */
  ngrokPath: string;
};

export const PUBLISH_TARGET_DEFAULT_PORT = 22;
export const PUBLISH_TARGET_MIN_PORT = 1;
export const PUBLISH_TARGET_MAX_PORT = 65535;

/**
 * Non-secret SFTP publish target fields persisted per OS profile to pre-fill the
 * Publish as Web dialog. Secrets (password, passphrase, private-key contents) are
 * never stored here.
 */
export type PublishTargetSettings = {
  host: string;
  port: number;
  username: string;
  remoteDirectory: string;
  publicBaseUrl: string;
};

/**
 * Non-secret QuickConnect HTTP publish target fields persisted per OS profile to pre-fill the
 * QuickConnect dialog. The bearer token is NOT stored here; it is encrypted at rest by the main
 * process (Electron safeStorage). See readLegacyQuickConnectToken for the one-time migration of
 * tokens that older versions stored in plaintext alongside these fields.
 */
export type QuickConnectSettings = {
  url: string;
  path: string;
};

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
  outlineVisible: boolean;
  outlineWidthPixels: number;
  showInvisibleCharacters: boolean;
  pageSize: EditorPageSize;
  pageOrientation: EditorPageOrientation;
  pageMargins: EditorPageMargins;
  mcpServer: McpServerSettings;
  publishTarget: PublishTargetSettings;
  quickConnect: QuickConnectSettings;
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

function sanitizeShowInvisibleCharacters(value: unknown) {
  return typeof value === "boolean" ? value : false;
}

function sanitizeOutlineVisible(value: unknown) {
  return typeof value === "boolean" ? value : false;
}

function sanitizeOutlineWidth(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(OUTLINE_WIDTH_MAX_PIXELS, Math.max(OUTLINE_WIDTH_MIN_PIXELS, Math.round(value)));
  }

  return DEFAULT_OUTLINE_WIDTH_PIXELS;
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

export function sanitizeMcpServerPort(value: unknown): number {
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= MCP_SERVER_MIN_PORT &&
    value <= MCP_SERVER_MAX_PORT
  ) {
    return value;
  }

  return MCP_SERVER_DEFAULT_PORT;
}

function sanitizeMcpBearerToken(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function sanitizeMcpAuthMode(value: unknown): McpAuthMode {
  return MCP_AUTH_MODE_OPTIONS.some((option) => option.value === value)
    ? (value as McpAuthMode)
    : "bearer";
}

export function createDefaultMcpServerSettings(): McpServerSettings {
  return {
    enabled: false,
    port: MCP_SERVER_DEFAULT_PORT,
    authMode: "bearer",
    bearerToken: "",
    autoApproveWrites: false,
    ngrokEnabled: false,
    ngrokDomain: "",
    ngrokUseCustomPath: false,
    ngrokPath: ""
  };
}

export function sanitizeMcpServerSettings(value: unknown): McpServerSettings {
  const source = typeof value === "object" && value !== null ? (value as Partial<McpServerSettings>) : {};

  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : false,
    port: sanitizeMcpServerPort(source.port),
    authMode: sanitizeMcpAuthMode(source.authMode),
    bearerToken: sanitizeMcpBearerToken(source.bearerToken),
    autoApproveWrites:
      typeof source.autoApproveWrites === "boolean" ? source.autoApproveWrites : false,
    ngrokEnabled: typeof source.ngrokEnabled === "boolean" ? source.ngrokEnabled : false,
    ngrokDomain: typeof source.ngrokDomain === "string" ? source.ngrokDomain.trim() : "",
    ngrokUseCustomPath:
      typeof source.ngrokUseCustomPath === "boolean" ? source.ngrokUseCustomPath : false,
    ngrokPath: typeof source.ngrokPath === "string" ? source.ngrokPath.trim() : ""
  };
}

export function generateMcpBearerToken(): string {
  const cryptoApi = typeof globalThis !== "undefined" ? (globalThis as { crypto?: Crypto }).crypto : undefined;

  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID().replace(/-/g, "");
  }

  if (cryptoApi?.getRandomValues) {
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  let token = "";
  for (let index = 0; index < 32; index += 1) {
    token += Math.floor(Math.random() * 16).toString(16);
  }
  return token;
}

export function sanitizePublishTargetPort(value: unknown): number {
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= PUBLISH_TARGET_MIN_PORT &&
    value <= PUBLISH_TARGET_MAX_PORT
  ) {
    return value;
  }

  return PUBLISH_TARGET_DEFAULT_PORT;
}

function sanitizePublishTargetString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function createDefaultPublishTarget(): PublishTargetSettings {
  return {
    host: "",
    port: PUBLISH_TARGET_DEFAULT_PORT,
    username: "",
    remoteDirectory: "",
    publicBaseUrl: ""
  };
}

export function sanitizePublishTarget(value: unknown): PublishTargetSettings {
  const source =
    typeof value === "object" && value !== null ? (value as Partial<PublishTargetSettings>) : {};

  return {
    host: sanitizePublishTargetString(source.host),
    port: sanitizePublishTargetPort(source.port),
    username: sanitizePublishTargetString(source.username),
    remoteDirectory: sanitizePublishTargetString(source.remoteDirectory),
    publicBaseUrl: sanitizePublishTargetString(source.publicBaseUrl)
  };
}

export function createDefaultQuickConnect(): QuickConnectSettings {
  return {
    url: "",
    path: ""
  };
}

export function sanitizeQuickConnect(value: unknown): QuickConnectSettings {
  const source =
    typeof value === "object" && value !== null ? (value as Partial<QuickConnectSettings>) : {};

  return {
    url: sanitizePublishTargetString(source.url),
    path: sanitizePublishTargetString(source.path)
  };
}

/**
 * Read a legacy plaintext QuickConnect bearer token that older versions stored inside the settings
 * JSON. Returns "" when none is present. Used once at startup to migrate the token into the
 * main-process encrypted store, after which the token is no longer persisted in localStorage.
 */
export function readLegacyQuickConnectToken(profileName: string): string {
  if (typeof localStorage === "undefined") {
    return "";
  }

  try {
    const stored = localStorage.getItem(getSettingsStorageKey(profileName));
    if (!stored) {
      return "";
    }

    const parsed = JSON.parse(stored) as { quickConnect?: { token?: unknown } };
    const token = parsed?.quickConnect?.token;
    return typeof token === "string" ? token : "";
  } catch {
    return "";
  }
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
    outlineVisible: false,
    outlineWidthPixels: DEFAULT_OUTLINE_WIDTH_PIXELS,
    showInvisibleCharacters: false,
    pageSize: DEFAULT_EDITOR_PAGE_SIZE,
    pageOrientation: DEFAULT_EDITOR_PAGE_ORIENTATION,
    pageMargins: createDefaultPageMargins(),
    mcpServer: createDefaultMcpServerSettings(),
    publishTarget: createDefaultPublishTarget(),
    quickConnect: createDefaultQuickConnect()
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
      outlineVisible: sanitizeOutlineVisible(parsed.outlineVisible),
      outlineWidthPixels: sanitizeOutlineWidth(parsed.outlineWidthPixels),
      showInvisibleCharacters: sanitizeShowInvisibleCharacters(parsed.showInvisibleCharacters),
      pageSize: isEditorPageSize(parsed.pageSize) ? parsed.pageSize : DEFAULT_EDITOR_PAGE_SIZE,
      pageOrientation: isEditorPageOrientation(parsed.pageOrientation)
        ? parsed.pageOrientation
        : DEFAULT_EDITOR_PAGE_ORIENTATION,
      pageMargins: sanitizeEditorPageMargins(parsed.pageMargins),
      mcpServer: sanitizeMcpServerSettings(parsed.mcpServer),
      publishTarget: sanitizePublishTarget(parsed.publishTarget),
      quickConnect: sanitizeQuickConnect(parsed.quickConnect)
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
    // The MCP bearer token is a secret encrypted at rest by the main process (Electron safeStorage);
    // never persist it in plaintext localStorage. Strip it before serializing — the in-memory
    // settings still carry it, and the renderer rehydrates it from the encrypted store on launch.
    const persisted: UserSettings = {
      ...settings,
      mcpServer: { ...settings.mcpServer, bearerToken: "" }
    };
    localStorage.setItem(getSettingsStorageKey(profileName), JSON.stringify(persisted));
  } catch {
    // Settings persistence is a convenience; keep the in-memory preference active.
  }
}

/**
 * Read a legacy plaintext MCP bearer token that older versions stored inside the settings JSON.
 * Returns "" when none is present. Used once at startup to migrate the token into the main-process
 * encrypted store, after which the token is no longer persisted in localStorage.
 */
export function readLegacyMcpBearerToken(profileName: string): string {
  if (typeof localStorage === "undefined") {
    return "";
  }

  try {
    const stored = localStorage.getItem(getSettingsStorageKey(profileName));
    if (!stored) {
      return "";
    }

    const parsed = JSON.parse(stored) as { mcpServer?: { bearerToken?: unknown } };
    const token = parsed?.mcpServer?.bearerToken;
    return typeof token === "string" ? token : "";
  } catch {
    return "";
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
