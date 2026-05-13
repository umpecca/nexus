import { describe, expect, it } from "vitest";
import {
  createDefaultSettings,
  DEFAULT_EDITOR_FONT_FAMILY,
  getSettingsStorageKey,
  loadSettings
} from "./settings";

describe("settings helpers", () => {
  it("creates default settings", () => {
    expect(createDefaultSettings()).toEqual({
      fontFamily: DEFAULT_EDITOR_FONT_FAMILY
    });
  });

  it("scopes settings storage by profile name", () => {
    expect(getSettingsStorageKey("Jane Doe")).toBe("nexus:settings:v1:Jane%20Doe");
  });

  it("falls back to default settings when storage is unavailable", () => {
    expect(loadSettings("default")).toEqual(createDefaultSettings());
  });
});
