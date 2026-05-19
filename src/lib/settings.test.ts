import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultSettings,
  DEFAULT_EDITOR_FONT_FAMILY,
  DEFAULT_EDITOR_FONT_SIZE_PIXELS,
  DEFAULT_EDITOR_PAGE_MARGIN_INCHES,
  DEFAULT_EDITOR_PAGE_SIZE,
  getSettingsStorageKey,
  loadSettings,
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
      paperViewEnabled: true,
      responsiveContentWrappingEnabled: true,
      pageSize: DEFAULT_EDITOR_PAGE_SIZE,
      pageMargins: {
        top: DEFAULT_EDITOR_PAGE_MARGIN_INCHES,
        right: DEFAULT_EDITOR_PAGE_MARGIN_INCHES,
        bottom: DEFAULT_EDITOR_PAGE_MARGIN_INCHES,
        left: DEFAULT_EDITOR_PAGE_MARGIN_INCHES
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
      paperViewEnabled: true,
      responsiveContentWrappingEnabled: true,
      pageSize: "Letter",
      pageMargins: {
        top: 1,
        right: 1,
        bottom: 1,
        left: 1
      }
    });
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

  it("falls back to Letter when stored page size is invalid", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
        pageSize: "Poster"
      })
    });

    expect(loadSettings("default").pageSize).toBe("Letter");
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
      paperViewEnabled: false,
      responsiveContentWrappingEnabled: false,
      pageSize: "A4",
      pageMargins: {
        top: 0.5,
        right: 0.75,
        bottom: 1,
        left: 1.25
      }
    });

    expect(storage.setItem).toHaveBeenCalledWith(
      getSettingsStorageKey("default"),
      JSON.stringify({
        fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
        fontSizePixels: 18,
        paperViewEnabled: false,
        responsiveContentWrappingEnabled: false,
        pageSize: "A4",
        pageMargins: {
          top: 0.5,
          right: 0.75,
          bottom: 1,
          left: 1.25
        }
      })
    );
  });
});
