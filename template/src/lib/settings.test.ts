import { describe, expect, it } from "vitest";
import { createDefaultSettings, sanitizeSettings } from "./settings";

describe("sanitizeSettings", () => {
  it("returns defaults for missing or unknown input", () => {
    expect(sanitizeSettings(undefined)).toEqual(createDefaultSettings());
    expect(
      sanitizeSettings({ themePreference: "bogus", fontFamily: 123, sampleToggle: "nope" })
    ).toEqual(createDefaultSettings());
  });

  it("preserves valid values", () => {
    const custom = {
      themePreference: "dark" as const,
      fontFamily: "Roboto, Arial, sans-serif" as const,
      sampleToggle: false
    };
    expect(sanitizeSettings(custom)).toEqual(custom);
  });
});
