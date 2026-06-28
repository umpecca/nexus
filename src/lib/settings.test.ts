import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultAiSettings,
  createDefaultSettings,
  DEFAULT_EDITOR_FONT_FAMILY,
  DEFAULT_EDITOR_FONT_SIZE_PIXELS,
  DEFAULT_EDITOR_PAGE_MARGIN_INCHES,
  DEFAULT_EDITOR_PAGE_ORIENTATION,
  DEFAULT_EDITOR_PAGE_SIZE,
  DEFAULT_EDITOR_PARAGRAPH_SPACING_PIXELS,
  DEFAULT_EDITOR_THEME_PREFERENCE,
  DEFAULT_OUTLINE_WIDTH_PIXELS,
  EDITOR_FONT_OPTIONS,
  EDITOR_PAGE_ORIENTATION_OPTIONS,
  EDITOR_THEME_OPTIONS,
  getSettingsStorageKey,
  loadSettings,
  readLegacyMcpBearerToken,
  readLegacyQuickConnectToken,
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
      outlineVisible: false,
      outlineWidthPixels: DEFAULT_OUTLINE_WIDTH_PIXELS,
      aiChatVisible: false,
      aiChatWidthPixels: 360,
      showInvisibleCharacters: false,
      spellCheckEnabled: true,
      diagramsAsFiles: false,
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
        bearerToken: "",
        autoApproveWrites: false,
        ngrokEnabled: false,
        ngrokDomain: "",
        ngrokUseCustomPath: false,
        ngrokPath: ""
      },
      publishTarget: {
        host: "",
        port: 22,
        username: "",
        remoteDirectory: "",
        publicBaseUrl: ""
      },
      quickConnect: {
        url: "",
        path: ""
      },
      ai: createDefaultAiSettings()
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
      outlineVisible: false,
      outlineWidthPixels: DEFAULT_OUTLINE_WIDTH_PIXELS,
      aiChatVisible: false,
      aiChatWidthPixels: 360,
      showInvisibleCharacters: false,
      spellCheckEnabled: true,
      diagramsAsFiles: false,
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
        bearerToken: "",
        autoApproveWrites: false,
        ngrokEnabled: false,
        ngrokDomain: "",
        ngrokUseCustomPath: false,
        ngrokPath: ""
      },
      publishTarget: {
        host: "",
        port: 22,
        username: "",
        remoteDirectory: "",
        publicBaseUrl: ""
      },
      quickConnect: {
        url: "",
        path: ""
      },
      ai: createDefaultAiSettings()
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
      "sky",
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

  it("defaults the outline sidebar to hidden", () => {
    expect(createDefaultSettings().outlineVisible).toBe(false);
  });

  it("defaults spell check to on", () => {
    expect(createDefaultSettings().spellCheckEnabled).toBe(true);
  });

  it("keeps spell check on when the stored value is missing, but honors an explicit false", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({ fontFamily: DEFAULT_EDITOR_FONT_FAMILY })
    });
    expect(loadSettings("default").spellCheckEnabled).toBe(true);

    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({ spellCheckEnabled: false })
    });
    expect(loadSettings("default").spellCheckEnabled).toBe(false);
  });

  it("defaults diagrams-as-files to off, but honors an explicit true", () => {
    expect(createDefaultSettings().diagramsAsFiles).toBe(false);

    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({ fontFamily: DEFAULT_EDITOR_FONT_FAMILY })
    });
    expect(loadSettings("default").diagramsAsFiles).toBe(false);

    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({ diagramsAsFiles: true })
    });
    expect(loadSettings("default").diagramsAsFiles).toBe(true);
  });

  it("loads a saved enabled outline sidebar setting", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
        outlineVisible: true,
        pageSize: "Letter"
      })
    });

    expect(loadSettings("default").outlineVisible).toBe(true);
  });

  it("falls back to a hidden outline sidebar when stored setting is invalid", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
        outlineVisible: "nope",
        pageSize: "Letter"
      })
    });

    expect(loadSettings("default").outlineVisible).toBe(false);
  });

  it("defaults the outline width to 256 pixels", () => {
    expect(createDefaultSettings().outlineWidthPixels).toBe(DEFAULT_OUTLINE_WIDTH_PIXELS);
  });

  it("loads and rounds a valid saved outline width", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
        outlineWidthPixels: 320.6,
        pageSize: "Letter"
      })
    });

    expect(loadSettings("default").outlineWidthPixels).toBe(321);
  });

  it("clamps a saved outline width to the supported range", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
        outlineWidthPixels: 5000,
        pageSize: "Letter"
      })
    });
    expect(loadSettings("default").outlineWidthPixels).toBe(560);

    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
        outlineWidthPixels: 40,
        pageSize: "Letter"
      })
    });
    expect(loadSettings("default").outlineWidthPixels).toBe(180);
  });

  it("falls back to the default outline width when stored value is not a number", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
        outlineWidthPixels: "wide",
        pageSize: "Letter"
      })
    });

    expect(loadSettings("default").outlineWidthPixels).toBe(DEFAULT_OUTLINE_WIDTH_PIXELS);
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

  it("defaults the publish target to empty fields on port 22", () => {
    expect(createDefaultSettings().publishTarget).toEqual({
      host: "",
      port: 22,
      username: "",
      remoteDirectory: "",
      publicBaseUrl: ""
    });
  });

  it("loads a valid saved publish target", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
        pageSize: "Letter",
        publishTarget: {
          host: "example.com",
          port: 2222,
          username: "deploy",
          remoteDirectory: "/var/www/html",
          publicBaseUrl: "https://example.com/"
        }
      })
    });

    expect(loadSettings("default").publishTarget).toEqual({
      host: "example.com",
      port: 2222,
      username: "deploy",
      remoteDirectory: "/var/www/html",
      publicBaseUrl: "https://example.com/"
    });
  });

  it("sanitizes an invalid stored publish target", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
        pageSize: "Letter",
        publishTarget: {
          host: 123,
          port: 70000,
          username: null,
          remoteDirectory: "  /srv/site  ",
          publicBaseUrl: 42
        }
      })
    });

    expect(loadSettings("default").publishTarget).toEqual({
      host: "",
      port: 22,
      username: "",
      remoteDirectory: "/srv/site",
      publicBaseUrl: ""
    });
  });

  it("defaults the QuickConnect target to empty fields", () => {
    expect(createDefaultSettings().quickConnect).toEqual({
      url: "",
      path: ""
    });
  });

  it("loads a saved QuickConnect target and drops any legacy plaintext token", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
        pageSize: "Letter",
        quickConnect: {
          url: "https://example.com/quickconnect",
          path: "docs/my-doc.html",
          token: "secret-token"
        }
      })
    });

    expect(loadSettings("default").quickConnect).toEqual({
      url: "https://example.com/quickconnect",
      path: "docs/my-doc.html"
    });
  });

  it("sanitizes an invalid stored QuickConnect target", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
        pageSize: "Letter",
        quickConnect: {
          url: 123,
          path: "  docs/x.html  ",
          token: null
        }
      })
    });

    expect(loadSettings("default").quickConnect).toEqual({
      url: "",
      path: "docs/x.html"
    });
  });

  it("reads a legacy plaintext QuickConnect token for migration", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
        pageSize: "Letter",
        quickConnect: {
          url: "https://example.com/quickconnect",
          path: "docs/my-doc.html",
          token: "legacy-secret"
        }
      })
    });

    expect(readLegacyQuickConnectToken("default")).toBe("legacy-secret");
  });

  it("returns an empty legacy QuickConnect token when none is stored", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
        pageSize: "Letter",
        quickConnect: {
          url: "https://example.com/quickconnect",
          path: "docs/my-doc.html"
        }
      })
    });

    expect(readLegacyQuickConnectToken("default")).toBe("");
  });

  it("returns an empty legacy QuickConnect token for non-string values", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        quickConnect: { token: 123 }
      })
    });

    expect(readLegacyQuickConnectToken("default")).toBe("");
  });

  it("returns an empty legacy QuickConnect token when storage is unavailable", () => {
    expect(readLegacyQuickConnectToken("default")).toBe("");
  });

  it("never persists the MCP bearer token in localStorage", () => {
    const storage = installLocalStorage();
    const settings = createDefaultSettings();
    settings.mcpServer = { ...settings.mcpServer, enabled: true, bearerToken: "super-secret-token" };

    saveSettings("default", settings);

    const written = storage.setItem.mock.calls.at(-1)?.[1] as string;
    expect(written).not.toContain("super-secret-token");
    const parsed = JSON.parse(written);
    expect(parsed.mcpServer.bearerToken).toBe("");
    // The other MCP settings are still persisted as normal.
    expect(parsed.mcpServer.enabled).toBe(true);
  });

  it("reads a legacy plaintext MCP bearer token for migration", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
        pageSize: "Letter",
        mcpServer: { enabled: true, authMode: "bearer", bearerToken: "legacy-bearer" }
      })
    });

    expect(readLegacyMcpBearerToken("default")).toBe("legacy-bearer");
  });

  it("returns an empty legacy MCP bearer token when none is stored or storage is unavailable", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({ mcpServer: { authMode: "bearer" } })
    });
    expect(readLegacyMcpBearerToken("default")).toBe("");

    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({ mcpServer: { bearerToken: 123 } })
    });
    expect(readLegacyMcpBearerToken("default")).toBe("");
  });

  it("loads saved ngrok tunnel MCP settings", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
        pageSize: "Letter",
        mcpServer: {
          enabled: true,
          port: 40000,
          authMode: "bearer",
          bearerToken: "tok",
          ngrokEnabled: true,
          ngrokDomain: "mcp.example.ngrok.app",
          ngrokUseCustomPath: true,
          ngrokPath: "/opt/homebrew/bin/ngrok"
        }
      })
    });

    const mcp = loadSettings("default").mcpServer;
    expect(mcp.ngrokEnabled).toBe(true);
    expect(mcp.ngrokDomain).toBe("mcp.example.ngrok.app");
    expect(mcp.ngrokUseCustomPath).toBe(true);
    expect(mcp.ngrokPath).toBe("/opt/homebrew/bin/ngrok");
  });

  it("sanitizes invalid ngrok MCP settings to safe defaults", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
        pageSize: "Letter",
        mcpServer: {
          ngrokEnabled: "yes",
          ngrokDomain: 456,
          ngrokUseCustomPath: "nope",
          ngrokPath: 789
        }
      })
    });

    const mcp = loadSettings("default").mcpServer;
    expect(mcp.ngrokEnabled).toBe(false);
    expect(mcp.ngrokDomain).toBe("");
    expect(mcp.ngrokUseCustomPath).toBe(false);
    expect(mcp.ngrokPath).toBe("");
  });

  it("loads and sanitizes the MCP auto-approve writes flag", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
        pageSize: "Letter",
        mcpServer: { autoApproveWrites: true }
      })
    });
    expect(loadSettings("default").mcpServer.autoApproveWrites).toBe(true);

    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
        pageSize: "Letter",
        mcpServer: { autoApproveWrites: "yes" }
      })
    });
    expect(loadSettings("default").mcpServer.autoApproveWrites).toBe(false);
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
      outlineVisible: true,
      outlineWidthPixels: 320,
      aiChatVisible: false,
      aiChatWidthPixels: 360,
      showInvisibleCharacters: false,
      spellCheckEnabled: true,
      diagramsAsFiles: false,
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
        bearerToken: "",
        autoApproveWrites: false,
        ngrokEnabled: false,
        ngrokDomain: "",
        ngrokUseCustomPath: false,
        ngrokPath: ""
      },
      publishTarget: {
        host: "",
        port: 22,
        username: "",
        remoteDirectory: "",
        publicBaseUrl: ""
      },
      quickConnect: {
        url: "",
        path: ""
      },
      ai: createDefaultAiSettings()
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
        outlineVisible: true,
        outlineWidthPixels: 320,
        aiChatVisible: false,
        aiChatWidthPixels: 360,
        showInvisibleCharacters: false,
        spellCheckEnabled: true,
        diagramsAsFiles: false,
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
          bearerToken: "",
          autoApproveWrites: false,
          ngrokEnabled: false,
          ngrokDomain: "",
          ngrokUseCustomPath: false,
          ngrokPath: ""
        },
        publishTarget: {
          host: "",
          port: 22,
          username: "",
          remoteDirectory: "",
          publicBaseUrl: ""
        },
        quickConnect: {
          url: "",
          path: ""
        },
        ai: createDefaultAiSettings()
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

  it("defaults AI settings with no default provider and all providers disabled", () => {
    const ai = createDefaultSettings().ai;
    expect(ai.defaultProviderId).toBe("");
    expect(Object.keys(ai.providers)).toEqual([
      "openai",
      "azure-openai",
      "deepseek",
      "anthropic",
      "ollama",
      "lm-studio"
    ]);
    expect(ai.providers.openai).toEqual({
      enabled: false,
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      temperature: 0.7,
      maxTokens: 1024,
      azureResourceUrl: "",
      azureDeployment: "",
      azureApiVersion: ""
    });
    // Azure seeds an api-version (it has no base URL / model default).
    expect(ai.providers["azure-openai"].azureApiVersion).toBe("2024-10-21");
    expect(ai.providers.anthropic.model).toBe("claude-sonnet-4-6");
  });

  it("loads saved AI provider config and the default provider", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        ai: {
          defaultProviderId: "anthropic",
          providers: {
            anthropic: { enabled: true, model: "claude-opus-4-8", maxTokens: 2048 },
            "azure-openai": {
              enabled: true,
              azureResourceUrl: "https://r.openai.azure.com/",
              azureDeployment: "gpt4o",
              azureApiVersion: "2025-01-01"
            }
          }
        }
      })
    });

    const ai = loadSettings("default").ai;
    expect(ai.defaultProviderId).toBe("anthropic");
    expect(ai.providers.anthropic.enabled).toBe(true);
    expect(ai.providers.anthropic.model).toBe("claude-opus-4-8");
    expect(ai.providers.anthropic.maxTokens).toBe(2048);
    // Unspecified fields fall back to the provider defaults.
    expect(ai.providers.anthropic.baseUrl).toBe("https://api.anthropic.com");
    // The stored value is whitespace-trimmed only; the adapter normalizes the trailing slash later.
    expect(ai.providers["azure-openai"].azureResourceUrl).toBe("https://r.openai.azure.com/");
    expect(ai.providers["azure-openai"].azureApiVersion).toBe("2025-01-01");
    // A provider absent from storage keeps its defaults.
    expect(ai.providers.openai.model).toBe("gpt-4o-mini");
  });

  it("sanitizes invalid AI settings (bad provider id, out-of-range numbers)", () => {
    installLocalStorage({
      [getSettingsStorageKey("default")]: JSON.stringify({
        ai: {
          defaultProviderId: "not-a-provider",
          providers: {
            openai: { enabled: "yes", temperature: 99, maxTokens: -5, model: 123 }
          }
        }
      })
    });

    const ai = loadSettings("default").ai;
    expect(ai.defaultProviderId).toBe("");
    expect(ai.providers.openai.enabled).toBe(false);
    // Temperature clamps to the supported range; maxTokens clamps to its minimum.
    expect(ai.providers.openai.temperature).toBe(2);
    expect(ai.providers.openai.maxTokens).toBe(1);
    // A non-string model falls back to the default rather than persisting garbage.
    expect(ai.providers.openai.model).toBe("gpt-4o-mini");
  });

  it("never includes API keys in persisted AI settings", () => {
    const storage = installLocalStorage();
    const settings = createDefaultSettings();
    settings.ai.providers.openai.enabled = true;

    saveSettings("default", settings);

    const written = storage.setItem.mock.calls.at(-1)?.[1] as string;
    const parsed = JSON.parse(written);
    // The AI settings model has no field for secrets — keys live only in the main-process store.
    expect(Object.keys(parsed.ai.providers.openai)).not.toContain("apiKey");
    expect(parsed.ai.providers.openai.enabled).toBe(true);
  });
});
