import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultSettings,
  DEFAULT_EDITOR_FONT_FAMILY,
  DEFAULT_EDITOR_FONT_SIZE_PIXELS,
  DEFAULT_EDITOR_PAGE_MARGIN_INCHES,
  DEFAULT_EDITOR_PAGE_ORIENTATION,
  DEFAULT_EDITOR_PAGE_SIZE,
  DEFAULT_EDITOR_PARAGRAPH_SPACING_PIXELS,
  DEFAULT_EDITOR_THEME_PREFERENCE,
  EDITOR_FONT_OPTIONS,
  EDITOR_PAGE_ORIENTATION_OPTIONS,
  EDITOR_THEME_OPTIONS,
  getSettingsStorageKey,
  loadSettings,
  resetSettings,
  saveSettings
} from "./settings";

const originalLocalStorage = globalThis.localStorage;

function installLocalStorage(initialValues: Record<string, string> = {}) {
  const values = new Map(Object.entries(initialValues));
  const storage = {
    get length() {
      return values.size;
    },
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => values.delete(key)),
    setItem: vi.fn((key: string, value: string) => values.set(key, value))
  };

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage
  });

  return storage;
}

describe("settings helpers", () => {
  afterEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: originalLocalStorage
    });
  });

  it("creates default settings", () => {
    expect(createDefaultSettings()).toEqual({
      fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
      fontSizePixels: DEFAULT_EDITOR_FONT_SIZE_PIXELS,
      paragraphSpacingPixels: DEFAULT_EDITOR_PARAGRAPH_SPACING_PIXELS,
      themePreference: DEFAULT_EDITOR_THEME_PREFERENCE,
      paperViewEnabled: true,
      responsiveContentWrappingEnabled: true,
      showInvisibleCharacters: false,
      pageSize: DEFAULT_EDITOR_PAGE_SIZE,
      pageOrientation: DEFAULT_EDITOR_PAGE_ORIENTATION,
      pageMargins: {
        top: DEFAULT_EDITOR_PAGE_MARGIN_INCHES,
        right: DEFAULT_EDITOR_PAGE_MARGIN_INCHES,
        bottom: DEFAULT_EDITOR_PAGE_MARGIN_INCHES,
        left: DEFAULT_EDITOR_PAGE_MARGIN_INCHES
      },
      mcpServer: {
        enabled: false,
        port: 39125,
        authMode: "bearer",
        bearerToken: ""
      }
    });
  });

  it("scopes settings storage by profile name", () => {
    expect(getSettingsStorageKey("Jane Doe")).toBe("nexus:settings:v1:Jane%20Doe");
  });

  it("falls back to default settings when storage is unavailable", () => {
    expect(loadSettings("default")).toEqual(createDefaultSettings());
  });

  it("loads existing font-only settings with the default page size", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        fontFamily: "Georgia, \"Times New Roman\", serif"
      })
    });

    expect(loadSettings("default")).toEqual({
      fontFamily: "Georgia, \"Times New Roman\", serif",
      fontSizePixels: 16,
      paragraphSpacingPixels: 16,
      themePreference: "system",
      paperViewEnabled: true,
      responsiveContentWrappingEnabled: true,
      showInvisibleCharacters: false,
      pageSize: "Letter",
      pageOrientation: "portrait",
      pageMargins: {
        top: 1,
        right: 1,
        bottom: 1,
        left: 1
      },
      mcpServer: {
        enabled: false,
        port: 39125,
        authMode: "bearer",
        bearerToken: ""
      }
    });
  });

  it("loads saved bundled web font settings", () => {
    const fontValues = [
      "Roboto, Arial, sans-serif",
      "Merriweather, Georgia, serif",
      '"JetBrains Mono", "Courier New", monospace'
    ];

    expect(EDITOR_FONT_OPTIONS.map((option) => option.value)).toEqual(
      expect.arrayContaining(fontValues)
    );

    fontValues.forEach((fontFamily, index) => {
      installLocalStorage({
        [getSettingsStorageKey("default")]: JSON.stringify({
          fontFamily,
          pageSize: "Letter"
        })
      });

      expect(loadSettings("default").fontFamily).toBe(fontValues[index]);
    });
  });

  it("loads valid saved theme preferences", () => {
    expect(EDITOR_THEME_OPTIONS.map((option) => option.value)).toEqual([
      "system",
      "light",
      "dark"
    ]);

    EDITOR_THEME_OPTIONS.forEach((option) => {
      installLocalStorage({
        [getSettingsStorageKey("default")]: JSON.stringify({
          fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
          themePreference: option.value,
          pageSize: "Letter"
        })
      });

      expect(loadSettings("default").themePreference).toBe(option.value);
    });
  });

  it("falls back to system when stored theme preference is invalid", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
        themePreference: "sepia",
        pageSize: "Letter"
      })
    });

    expect(loadSettings("default").themePreference).toBe(DEFAULT_EDITOR_THEME_PREFERENCE);
  });

  it("loads a valid saved page size", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
        pageSize: "A4"
      })
    });

    expect(loadSettings("default").pageSize).toBe("A4");
  });

  it("loads valid saved page orientations", () => {
    expect(EDITOR_PAGE_ORIENTATION_OPTIONS.map((option) => option.value)).toEqual([
      "portrait",
      "landscape"
    ]);

    EDITOR_PAGE_ORIENTATION_OPTIONS.forEach((option) => {
      installLocalStorage({
        [getSettingsStorageKey("default")]: JSON.stringify({
          fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
          pageSize: "Letter",
          pageOrientation: option.value
        })
      });

      expect(loadSettings("default").pageOrientation).toBe(option.value);
    });
  });

  it("loads a valid saved font size", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
        fontSizePixels: 18,
        pageSize: "Letter"
      })
    });

    expect(loadSettings("default").fontSizePixels).toBe(18);
  });

  it("loads a valid saved paragraph spacing", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
        paragraphSpacingPixels: 20,
        pageSize: "Letter"
      })
    });

    expect(loadSettings("default").paragraphSpacingPixels).toBe(20);
  });

  it("loads a saved disabled paper view setting", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
        fontSizePixels: 16,
        paperViewEnabled: false,
        pageSize: "Letter"
      })
    });

    expect(loadSettings("default").paperViewEnabled).toBe(false);
  });

  it("falls back to paper view enabled when stored paper view setting is invalid", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
        fontSizePixels: 16,
        paperViewEnabled: "nope",
        pageSize: "Letter"
      })
    });

    expect(loadSettings("default").paperViewEnabled).toBe(true);
  });

  it("loads a saved disabled responsive content wrapping setting", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
        fontSizePixels: 16,
        paperViewEnabled: false,
        responsiveContentWrappingEnabled: false,
        pageSize: "Letter"
      })
    });

    expect(loadSettings("default").responsiveContentWrappingEnabled).toBe(false);
  });

  it("falls back to responsive content wrapping enabled when stored setting is invalid", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
        fontSizePixels: 16,
        paperViewEnabled: false,
        responsiveContentWrappingEnabled: "nope",
        pageSize: "Letter"
      })
    });

    expect(loadSettings("default").responsiveContentWrappingEnabled).toBe(true);
  });

  it("falls back to the default font size when stored font size is invalid", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
        fontSizePixels: 42,
        pageSize: "Letter"
      })
    });

    expect(loadSettings("default").fontSizePixels).toBe(DEFAULT_EDITOR_FONT_SIZE_PIXELS);
  });

  it("falls back to the default paragraph spacing when stored spacing is invalid", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
        paragraphSpacingPixels: 48,
        pageSize: "Letter"
      })
    });

    expect(loadSettings("default").paragraphSpacingPixels).toBe(
      DEFAULT_EDITOR_PARAGRAPH_SPACING_PIXELS
    );
  });

  it("falls back to Letter when stored page size is invalid", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
        pageSize: "Poster"
      })
    });

    expect(loadSettings("default").pageSize).toBe("Letter");
  });

  it("falls back to portrait when stored page orientation is invalid", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
        pageSize: "Letter",
        pageOrientation: "sideways"
      })
    });

    expect(loadSettings("default").pageOrientation).toBe("portrait");
  });

  it("loads valid saved page margins", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
        pageSize: "Letter",
        pageMargins: {
          top: 0.5,
          right: 0.75,
          bottom: 1.25,
          left: 1.5
        }
      })
    });

    expect(loadSettings("default").pageMargins).toEqual({
      top: 0.5,
      right: 0.75,
      bottom: 1.25,
      left: 1.5
    });
  });

  it("falls back per side when stored page margins are missing or invalid", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
        pageSize: "Letter",
        pageMargins: {
          top: 0.25,
          right: 4,
          bottom: "large"
        }
      })
    });

    expect(loadSettings("default").pageMargins).toEqual({
      top: 0.25,
      right: 1,
      bottom: 1,
      left: 1
    });
  });

  it("saves the selected paper size", () => {
    const storage = installLocalStorage();

    saveSettings("default", {
      fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
      fontSizePixels: 18,
      paragraphSpacingPixels: 20,
      themePreference: "dark",
      paperViewEnabled: false,
      responsiveContentWrappingEnabled: false,
      showInvisibleCharacters: false,
      pageSize: "A4",
      pageOrientation: "landscape",
      pageMargins: {
        top: 0.5,
        right: 0.75,
        bottom: 1,
        left: 1.25
      },
      mcpServer: {
        enabled: false,
        port: 39125,
        authMode: "bearer",
        bearerToken: ""
      }
    });

    expect(storage.setItem).toHaveBeenCalledWith(
      getSettingsStorageKey("default"),
      JSON.stringify({
        fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
        fontSizePixels: 18,
        paragraphSpacingPixels: 20,
        themePreference: "dark",
        paperViewEnabled: false,
        responsiveContentWrappingEnabled: false,
        showInvisibleCharacters: false,
        pageSize: "A4",
        pageOrientation: "landscape",
        pageMargins: {
          top: 0.5,
          right: 0.75,
          bottom: 1,
          left: 1.25
        },
        mcpServer: {
          enabled: false,
          port: 39125,
          authMode: "bearer",
          bearerToken: ""
        }
      })
    );
  });

  it("resets settings storage for the selected profile", () => {
    const storage = installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
        fontSizePixels: 18,
        themePreference: "dark",
        pageSize: "A4"
      })
    });

    resetSettings("default");

    expect(storage.removeItem).toHaveBeenCalledWith(getSettingsStorageKey("default"));
    expect(loadSettings("default")).toEqual(createDefaultSettings());
  });
});
