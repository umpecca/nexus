import { describe, expect, it } from "vitest";
import {
  DEFAULT_AI_CONTEXT_CHAR_LIMIT,
  isImageUnsupportedError,
  resolveActiveProvider,
  truncateForContext
} from "./client";
import { createDefaultAiSettings } from "../settings";
import type { AiProviderId } from "./providers";

function enable(providerId: AiProviderId) {
  const ai = createDefaultAiSettings();
  ai.providers[providerId].enabled = true;
  return ai;
}

describe("resolveActiveProvider", () => {
  it("returns null when nothing is enabled", () => {
    expect(resolveActiveProvider(createDefaultAiSettings())).toBeNull();
  });

  it("prefers the configured default when it is enabled", () => {
    const ai = enable("anthropic");
    ai.providers.openai.enabled = true;
    ai.defaultProviderId = "anthropic";
    expect(resolveActiveProvider(ai)).toBe("anthropic");
  });

  it("falls back to the first enabled provider when the default is unset", () => {
    const ai = createDefaultAiSettings();
    ai.providers.deepseek.enabled = true;
    ai.providers.anthropic.enabled = true;
    // Catalog order is openai, azure-openai, deepseek, anthropic — so deepseek wins here.
    expect(resolveActiveProvider(ai)).toBe("deepseek");
  });

  it("ignores a default that points at a disabled provider", () => {
    const ai = enable("openai");
    ai.defaultProviderId = "anthropic"; // set but not enabled
    expect(resolveActiveProvider(ai)).toBe("openai");
  });
});

describe("truncateForContext", () => {
  it("returns short text unchanged", () => {
    expect(truncateForContext("hello", 100)).toBe("hello");
  });

  it("truncates the middle of oversized text and stays within the limit budget", () => {
    const text = "A".repeat(500) + "B".repeat(500);
    const result = truncateForContext(text, 200);
    expect(result).toContain("[content truncated]");
    expect(result.startsWith("A")).toBe(true);
    expect(result.endsWith("B")).toBe(true);
    // Head + tail keep the budget; only the elision marker adds a little.
    expect(result.length).toBeLessThan(260);
  });

  it("uses a sane default limit", () => {
    expect(DEFAULT_AI_CONTEXT_CHAR_LIMIT).toBeGreaterThan(1000);
  });
});

describe("isImageUnsupportedError", () => {
  it("flags the OpenAI-compatible image_url schema rejection", () => {
    expect(
      isImageUnsupportedError(
        "Failed to deserialize the JSON body into the target type: messages[1]: unknown variant `image_url`, expected `text` at line 1 column 95695"
      )
    ).toBe(true);
  });

  it("flags explicit 'no image support' phrasings", () => {
    expect(isImageUnsupportedError("This model does not support image input.")).toBe(true);
    expect(isImageUnsupportedError("The model is not multimodal and cannot process images")).toBe(true);
    expect(isImageUnsupportedError("Unsupported content: image")).toBe(true);
  });

  it("does not flag unrelated errors", () => {
    expect(isImageUnsupportedError("Incorrect API key provided")).toBe(false);
    expect(isImageUnsupportedError("Rate limit exceeded")).toBe(false);
    expect(isImageUnsupportedError("Request timed out")).toBe(false);
    expect(isImageUnsupportedError("A model name is required.")).toBe(false);
  });
});
