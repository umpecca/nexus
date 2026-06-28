import { describe, expect, it } from "vitest";
// The pure AI provider adapter used by the "ai:chat" IPC handler. This test lives under electron/
// (outside the tsconfig "src" include) so it can require the raw CommonJS module directly.
import {
  buildChatHttpRequest,
  parseChatResult,
  describeMissingConfig,
  normalizeMessages,
  toAnthropicContent,
  toOpenAiContent,
  isUnsupportedTemperatureError,
  ANTHROPIC_VERSION,
  DEFAULT_AZURE_API_VERSION,
  DEFAULT_MAX_TOKENS
} from "./aiProviders.cjs";

const userMessages = [{ role: "user", content: "Hello" }];

describe("buildChatHttpRequest — OpenAI", () => {
  it("targets the chat/completions endpoint with a Bearer header and model in the body", () => {
    const request = buildChatHttpRequest({
      providerId: "openai",
      config: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
      apiKey: "sk-test",
      messages: userMessages,
      temperature: 0.4,
      maxTokens: 256
    });

    expect(request.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(request.method).toBe("POST");
    expect(request.headers.Authorization).toBe("Bearer sk-test");
    expect(request.headers["Content-Type"]).toBe("application/json");
    expect(request.body).toEqual({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Hello" }],
      temperature: 0.4,
      max_completion_tokens: 256
    });
  });

  it("falls back to the default base URL and trims a trailing slash", () => {
    const request = buildChatHttpRequest({
      providerId: "openai",
      config: { baseUrl: "https://proxy.example.com/v1/", model: "gpt-4o" },
      apiKey: "sk-test",
      messages: userMessages
    });

    expect(request.url).toBe("https://proxy.example.com/v1/chat/completions");
  });

  it("prepends an explicit system string as a system message", () => {
    const request = buildChatHttpRequest({
      providerId: "openai",
      config: { model: "gpt-4o-mini" },
      apiKey: "sk-test",
      system: "You are terse.",
      messages: userMessages
    });

    expect(request.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(request.body.messages).toEqual([
      { role: "system", content: "You are terse." },
      { role: "user", content: "Hello" }
    ]);
  });
});

describe("buildChatHttpRequest — DeepSeek", () => {
  it("uses the DeepSeek default base URL with the OpenAI-compatible shape", () => {
    const request = buildChatHttpRequest({
      providerId: "deepseek",
      config: { model: "deepseek-chat" },
      apiKey: "ds-test",
      messages: userMessages
    });

    expect(request.url).toBe("https://api.deepseek.com/chat/completions");
    expect(request.headers.Authorization).toBe("Bearer ds-test");
    expect(request.body.model).toBe("deepseek-chat");
  });
});

describe("buildChatHttpRequest — local runtimes (Ollama / LM Studio)", () => {
  it("uses the Ollama loopback base URL and omits the Authorization header when no key is set", () => {
    const request = buildChatHttpRequest({
      providerId: "ollama",
      config: { model: "llama3.1" },
      apiKey: "",
      messages: userMessages
    });

    expect(request.url).toBe("http://localhost:11434/v1/chat/completions");
    expect(request.headers.Authorization).toBeUndefined();
    expect(request.body.model).toBe("llama3.1");
  });

  it("uses the LM Studio loopback base URL", () => {
    const request = buildChatHttpRequest({
      providerId: "lm-studio",
      config: { model: "local-model" },
      apiKey: "",
      messages: userMessages
    });

    expect(request.url).toBe("http://localhost:1234/v1/chat/completions");
    expect(request.headers.Authorization).toBeUndefined();
  });

  it("still sends a Bearer header when a key is provided (e.g. a secured proxy)", () => {
    const request = buildChatHttpRequest({
      providerId: "ollama",
      config: { model: "llama3.1" },
      apiKey: "secret",
      messages: userMessages
    });

    expect(request.headers.Authorization).toBe("Bearer secret");
  });
});

describe("describeMissingConfig — local runtimes", () => {
  it("does not require an API key for keyless local providers", () => {
    expect(
      describeMissingConfig({ providerId: "ollama", config: { model: "llama3.1" }, apiKey: "" })
    ).toBeNull();
    expect(
      describeMissingConfig({ providerId: "lm-studio", config: { model: "local-model" }, apiKey: "" })
    ).toBeNull();
  });

  it("still requires a model name for local providers", () => {
    expect(describeMissingConfig({ providerId: "ollama", config: {}, apiKey: "" })).toMatch(/model/i);
  });

  it("still requires an API key for cloud providers", () => {
    expect(
      describeMissingConfig({ providerId: "openai", config: { model: "gpt-4o" }, apiKey: "" })
    ).toMatch(/API key/i);
  });
});

describe("buildChatHttpRequest — Azure OpenAI", () => {
  it("builds the deployment URL, uses an api-key header, and omits model from the body", () => {
    const request = buildChatHttpRequest({
      providerId: "azure-openai",
      config: {
        azureResourceUrl: "https://my-res.openai.azure.com/",
        azureDeployment: "gpt4o-deploy",
        azureApiVersion: "2024-10-21"
      },
      apiKey: "az-test",
      messages: userMessages,
      maxTokens: 128
    });

    expect(request.url).toBe(
      "https://my-res.openai.azure.com/openai/deployments/gpt4o-deploy/chat/completions?api-version=2024-10-21"
    );
    expect(request.headers["api-key"]).toBe("az-test");
    expect(request.headers.Authorization).toBeUndefined();
    expect(request.body).toEqual({
      messages: [{ role: "user", content: "Hello" }],
      max_completion_tokens: 128
    });
  });

  it("defaults the api-version when none is configured", () => {
    const request = buildChatHttpRequest({
      providerId: "azure-openai",
      config: { azureResourceUrl: "https://my-res.openai.azure.com", azureDeployment: "d1" },
      apiKey: "az-test",
      messages: userMessages
    });

    expect(request.url).toContain(`api-version=${DEFAULT_AZURE_API_VERSION}`);
  });
});

describe("buildChatHttpRequest — max tokens field name", () => {
  it("uses max_completion_tokens for OpenAI (newer models reject max_tokens)", () => {
    const request = buildChatHttpRequest({
      providerId: "openai",
      config: { model: "gpt-5.5" },
      apiKey: "sk-test",
      messages: userMessages,
      maxTokens: 321
    });

    expect(request.body.max_completion_tokens).toBe(321);
    expect(request.body.max_tokens).toBeUndefined();
  });

  it("uses max_completion_tokens for Azure OpenAI", () => {
    const request = buildChatHttpRequest({
      providerId: "azure-openai",
      config: { azureResourceUrl: "https://r.openai.azure.com", azureDeployment: "d1" },
      apiKey: "az-test",
      messages: userMessages,
      maxTokens: 222
    });

    expect(request.body.max_completion_tokens).toBe(222);
    expect(request.body.max_tokens).toBeUndefined();
  });

  it("keeps max_tokens for DeepSeek and local runtimes", () => {
    for (const providerId of ["deepseek", "ollama", "lm-studio"]) {
      const request = buildChatHttpRequest({
        providerId,
        config: { model: "m" },
        apiKey: "",
        messages: userMessages,
        maxTokens: 111
      });

      expect(request.body.max_tokens).toBe(111);
      expect(request.body.max_completion_tokens).toBeUndefined();
    }
  });
});

describe("buildChatHttpRequest — Anthropic", () => {
  it("targets /v1/messages with x-api-key + version headers and hoists system messages", () => {
    const request = buildChatHttpRequest({
      providerId: "anthropic",
      config: { model: "claude-sonnet-4-6" },
      apiKey: "ant-test",
      messages: [
        { role: "system", content: "Be brief." },
        { role: "user", content: "Hello" }
      ]
    });

    expect(request.url).toBe("https://api.anthropic.com/v1/messages");
    expect(request.headers["x-api-key"]).toBe("ant-test");
    expect(request.headers["anthropic-version"]).toBe(ANTHROPIC_VERSION);
    expect(request.body.system).toBe("Be brief.");
    expect(request.body.messages).toEqual([{ role: "user", content: "Hello" }]);
    // Anthropic requires max_tokens; the builder supplies a default when none is given.
    expect(request.body.max_tokens).toBe(DEFAULT_MAX_TOKENS);
  });

  it("merges an explicit system string with system-role messages", () => {
    const request = buildChatHttpRequest({
      providerId: "anthropic",
      config: { model: "claude-sonnet-4-6" },
      apiKey: "ant-test",
      system: "Top-level.",
      messages: [
        { role: "system", content: "From message." },
        { role: "user", content: "Hi" }
      ],
      maxTokens: 64
    });

    expect(request.body.system).toBe("Top-level.\n\nFrom message.");
    expect(request.body.max_tokens).toBe(64);
    expect(request.body.messages).toEqual([{ role: "user", content: "Hi" }]);
  });
});

describe("parseChatResult — success", () => {
  it("reads OpenAI-shaped completions (content, finish_reason, usage)", () => {
    const result = parseChatResult({
      providerId: "openai",
      status: 200,
      json: {
        model: "gpt-4o-mini",
        choices: [{ message: { content: "Hi there" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 }
      }
    });

    expect(result).toEqual({
      ok: true,
      text: "Hi there",
      model: "gpt-4o-mini",
      finishReason: "stop",
      usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 }
    });
  });

  it("concatenates Anthropic text blocks and normalizes usage", () => {
    const result = parseChatResult({
      providerId: "anthropic",
      status: 200,
      json: {
        model: "claude-sonnet-4-6",
        stop_reason: "end_turn",
        content: [
          { type: "text", text: "Hello " },
          { type: "text", text: "world" }
        ],
        usage: { input_tokens: 10, output_tokens: 4 }
      }
    });

    expect(result).toEqual({
      ok: true,
      text: "Hello world",
      model: "claude-sonnet-4-6",
      finishReason: "end_turn",
      usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 }
    });
  });
});

describe("parseChatResult — errors", () => {
  it("extracts the provider error message on a 4xx/5xx response", () => {
    const result = parseChatResult({
      providerId: "openai",
      status: 401,
      json: { error: { message: "Incorrect API key provided", type: "invalid_request_error" } }
    });

    expect(result).toEqual({ ok: false, status: 401, error: "Incorrect API key provided" });
  });

  it("reads Anthropic's nested error message", () => {
    const result = parseChatResult({
      providerId: "anthropic",
      status: 400,
      json: { type: "error", error: { type: "invalid_request_error", message: "bad model" } }
    });

    expect(result).toEqual({ ok: false, status: 400, error: "bad model" });
  });

  it("falls back to a generic message when no error field is present", () => {
    const result = parseChatResult({ providerId: "openai", status: 500, json: {} });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("500");
  });
});

describe("describeMissingConfig", () => {
  it("flags a missing API key", () => {
    expect(describeMissingConfig({ providerId: "openai", config: { model: "gpt-4o" }, apiKey: "" })).toMatch(
      /API key/i
    );
  });

  it("flags a missing model for non-Azure providers", () => {
    expect(
      describeMissingConfig({ providerId: "openai", config: { model: "" }, apiKey: "sk-test" })
    ).toMatch(/model/i);
  });

  it("requires Azure resource + deployment instead of a model", () => {
    expect(
      describeMissingConfig({ providerId: "azure-openai", config: {}, apiKey: "az-test" })
    ).toMatch(/resource endpoint/i);
    expect(
      describeMissingConfig({
        providerId: "azure-openai",
        config: { azureResourceUrl: "https://r.openai.azure.com" },
        apiKey: "az-test"
      })
    ).toMatch(/deployment/i);
  });

  it("returns null when the required config is present", () => {
    expect(
      describeMissingConfig({ providerId: "openai", config: { model: "gpt-4o" }, apiKey: "sk-test" })
    ).toBeNull();
    expect(
      describeMissingConfig({
        providerId: "azure-openai",
        config: { azureResourceUrl: "https://r.openai.azure.com", azureDeployment: "d1" },
        apiKey: "az-test"
      })
    ).toBeNull();
  });
});

describe("normalizeMessages", () => {
  it("drops malformed entries and coerces unknown roles to user", () => {
    expect(
      normalizeMessages([
        { role: "user", content: "ok" },
        { role: "weird", content: "coerced" },
        { role: "assistant", content: "" },
        null,
        { role: "user" }
      ])
    ).toEqual([
      { role: "user", content: "ok" },
      { role: "user", content: "coerced" }
    ]);
  });

  it("preserves valid text/image blocks and drops malformed ones (multimodal turn)", () => {
    expect(
      normalizeMessages([
        {
          role: "user",
          content: [
            { type: "text", text: "hi" },
            { type: "image", mediaType: "image/jpeg", data: "ZZ" },
            { type: "image", mediaType: "", data: "ZZ" },
            { type: "text", text: "" },
            { type: "bogus" },
            null
          ]
        }
      ])
    ).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "hi" },
          { type: "image", mediaType: "image/jpeg", data: "ZZ" }
        ]
      }
    ]);
  });

  it("drops a message whose array content has no usable blocks", () => {
    expect(normalizeMessages([{ role: "user", content: [{ type: "bogus" }] }])).toEqual([]);
  });
});

describe("multimodal content translators", () => {
  it("toOpenAiContent maps image blocks to image_url data: URLs and passes text through", () => {
    expect(
      toOpenAiContent([
        { type: "text", text: "hi" },
        { type: "image", mediaType: "image/png", data: "AAAA" }
      ])
    ).toEqual([
      { type: "text", text: "hi" },
      { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } }
    ]);
  });

  it("toAnthropicContent maps image blocks to base64 source blocks and passes text through", () => {
    expect(
      toAnthropicContent([
        { type: "text", text: "hi" },
        { type: "image", mediaType: "image/png", data: "AAAA" }
      ])
    ).toEqual([
      { type: "text", text: "hi" },
      { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } }
    ]);
  });

  it("leaves plain string content unchanged (regression: text-only turns)", () => {
    expect(toOpenAiContent("plain")).toBe("plain");
    expect(toAnthropicContent("plain")).toBe("plain");
  });
});

describe("buildChatHttpRequest — multimodal (image) content", () => {
  const imageMessages = [
    {
      role: "user",
      content: [
        { type: "text", text: "Transcribe this." },
        { type: "image", mediaType: "image/png", data: "AAAA" }
      ]
    }
  ];

  it("emits OpenAI image_url parts with a data: URL", () => {
    const request = buildChatHttpRequest({
      providerId: "openai",
      config: { model: "gpt-4o" },
      apiKey: "sk-test",
      messages: imageMessages
    });

    expect(request.body.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "Transcribe this." },
          { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } }
        ]
      }
    ]);
  });

  it("emits Anthropic base64 image source blocks", () => {
    const request = buildChatHttpRequest({
      providerId: "anthropic",
      config: { model: "claude-sonnet-4-6" },
      apiKey: "ant-test",
      messages: imageMessages
    });

    expect(request.body.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "Transcribe this." },
          { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } }
        ]
      }
    ]);
  });
});

describe("isUnsupportedTemperatureError", () => {
  it("flags OpenAI's 'only the default temperature' rejection", () => {
    expect(
      isUnsupportedTemperatureError({
        ok: false,
        error:
          "Unsupported value: 'temperature' does not support 0.7 with this model. Only the default (1) value is supported."
      })
    ).toBe(true);
  });

  it("flags an 'Unsupported parameter: temperature' phrasing", () => {
    expect(
      isUnsupportedTemperatureError({ ok: false, error: "Unsupported parameter: 'temperature'." })
    ).toBe(true);
  });

  it("ignores unrelated errors, the max_tokens error, and successful results", () => {
    expect(isUnsupportedTemperatureError({ ok: false, error: "Incorrect API key provided" })).toBe(
      false
    );
    expect(
      isUnsupportedTemperatureError({
        ok: false,
        error: "Unsupported parameter: 'max_tokens' is not supported with this model."
      })
    ).toBe(false);
    expect(isUnsupportedTemperatureError({ ok: true, text: "hi", model: "m" })).toBe(false);
    expect(isUnsupportedTemperatureError(null)).toBe(false);
  });
});
