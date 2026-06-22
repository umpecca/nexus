// Pure provider adapter for the AI abstraction layer. This module performs no I/O: it turns a
// provider id + non-secret config + messages into a concrete HTTP request descriptor, and turns a
// raw HTTP status + parsed JSON body back into a unified result shape. The Electron main process
// runs it as raw CommonJS (no transpile step), and the `ai:chat` IPC handler is thin glue that
// fetches the descriptor this builds and parses with `parseChatResult`. Keeping it pure makes the
// four providers' wire-format differences fully unit-testable (see `aiProviders.test.ts`).
//
// The four providers collapse into two wire formats:
//   - OpenAI-compatible Chat Completions: OpenAI, DeepSeek, and Azure OpenAI (Azure differs only in
//     URL shape and an `api-key` header instead of `Authorization: Bearer`).
//   - Anthropic Messages (`/v1/messages`, `x-api-key`, `anthropic-version`; `system` is a top-level
//     field rather than a message role).

const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_AZURE_API_VERSION = "2024-10-21";
const DEFAULT_MAX_TOKENS = 1024;

function trimTrailingSlashes(value) {
  return typeof value === "string" ? value.replace(/\/+$/, "") : "";
}

function coerceRole(role) {
  return role === "system" || role === "assistant" || role === "user" ? role : "user";
}

// Drop malformed entries and coerce roles, so the request builders only ever see well-formed
// `{ role, content }` messages with string content.
function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  const result = [];
  for (const message of messages) {
    if (!message || typeof message !== "object") {
      continue;
    }
    const content = typeof message.content === "string" ? message.content : "";
    if (!content) {
      continue;
    }
    result.push({ role: coerceRole(message.role), content });
  }
  return result;
}

// Anthropic puts the system prompt in a top-level `system` field, not in `messages`. Pull every
// system-role message out (joined in order) and leave only user/assistant turns in the conversation.
function splitSystemMessages(messages) {
  const systemParts = [];
  const conversation = [];
  for (const message of messages) {
    if (message.role === "system") {
      systemParts.push(message.content);
    } else {
      conversation.push(message);
    }
  }
  return { system: systemParts.join("\n\n"), conversation };
}

function resolveTemperature(temperature) {
  return typeof temperature === "number" && Number.isFinite(temperature) ? temperature : undefined;
}

function resolveMaxTokens(maxTokens) {
  return typeof maxTokens === "number" && Number.isFinite(maxTokens) && maxTokens > 0
    ? Math.floor(maxTokens)
    : undefined;
}

/**
 * Build the HTTP request descriptor for a chat completion. Returns `{ url, method, headers, body }`
 * where `body` is a plain object the caller is expected to JSON-stringify. An explicit `system`
 * string is prepended as a system message and then handled per provider (hoisted for Anthropic,
 * sent inline for OpenAI-compatible providers).
 */
function buildChatHttpRequest({ providerId, config, apiKey, messages, system, temperature, maxTokens }) {
  const cfg = config && typeof config === "object" ? config : {};
  const key = typeof apiKey === "string" ? apiKey : "";
  const normalized = normalizeMessages(messages);
  const allMessages =
    typeof system === "string" && system.trim()
      ? [{ role: "system", content: system }, ...normalized]
      : normalized;

  const resolvedTemperature = resolveTemperature(temperature);
  const resolvedMaxTokens = resolveMaxTokens(maxTokens);

  if (providerId === "anthropic") {
    const baseUrl = trimTrailingSlashes(cfg.baseUrl) || "https://api.anthropic.com";
    const { system: hoistedSystem, conversation } = splitSystemMessages(allMessages);
    const body = {
      model: typeof cfg.model === "string" ? cfg.model : "",
      max_tokens: resolvedMaxTokens ?? DEFAULT_MAX_TOKENS,
      messages: conversation.map((message) => ({ role: message.role, content: message.content }))
    };
    if (hoistedSystem) {
      body.system = hoistedSystem;
    }
    if (resolvedTemperature !== undefined) {
      body.temperature = resolvedTemperature;
    }
    return {
      url: `${baseUrl}/v1/messages`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": ANTHROPIC_VERSION
      },
      body
    };
  }

  const openAiMessages = allMessages.map((message) => ({ role: message.role, content: message.content }));

  if (providerId === "azure-openai") {
    const resourceUrl = trimTrailingSlashes(cfg.azureResourceUrl);
    const deployment = encodeURIComponent(
      typeof cfg.azureDeployment === "string" ? cfg.azureDeployment : ""
    );
    const apiVersion = encodeURIComponent(
      typeof cfg.azureApiVersion === "string" && cfg.azureApiVersion.trim()
        ? cfg.azureApiVersion.trim()
        : DEFAULT_AZURE_API_VERSION
    );
    // Azure selects the model via the deployment in the path, so the body carries no `model`.
    const body = { messages: openAiMessages };
    if (resolvedTemperature !== undefined) {
      body.temperature = resolvedTemperature;
    }
    if (resolvedMaxTokens !== undefined) {
      body.max_tokens = resolvedMaxTokens;
    }
    return {
      url: `${resourceUrl}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": key
      },
      body
    };
  }

  // openai + deepseek: identical wire format, different default base URL.
  const defaultBaseUrl =
    providerId === "deepseek" ? "https://api.deepseek.com" : "https://api.openai.com/v1";
  const baseUrl = trimTrailingSlashes(cfg.baseUrl) || defaultBaseUrl;
  const body = {
    model: typeof cfg.model === "string" ? cfg.model : "",
    messages: openAiMessages
  };
  if (resolvedTemperature !== undefined) {
    body.temperature = resolvedTemperature;
  }
  if (resolvedMaxTokens !== undefined) {
    body.max_tokens = resolvedMaxTokens;
  }
  return {
    url: `${baseUrl}/chat/completions`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`
    },
    body
  };
}

function extractErrorMessage(json, status) {
  if (json && typeof json === "object") {
    const error = json.error;
    if (error && typeof error === "object" && typeof error.message === "string" && error.message) {
      return error.message;
    }
    if (typeof error === "string" && error) {
      return error;
    }
    if (typeof json.message === "string" && json.message) {
      return json.message;
    }
  }
  return `Request failed with HTTP ${status || "error"}`;
}

function normalizeOpenAiUsage(usage) {
  if (!usage || typeof usage !== "object") {
    return undefined;
  }
  const result = {};
  if (typeof usage.prompt_tokens === "number") {
    result.inputTokens = usage.prompt_tokens;
  }
  if (typeof usage.completion_tokens === "number") {
    result.outputTokens = usage.completion_tokens;
  }
  if (typeof usage.total_tokens === "number") {
    result.totalTokens = usage.total_tokens;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeAnthropicUsage(usage) {
  if (!usage || typeof usage !== "object") {
    return undefined;
  }
  const result = {};
  if (typeof usage.input_tokens === "number") {
    result.inputTokens = usage.input_tokens;
  }
  if (typeof usage.output_tokens === "number") {
    result.outputTokens = usage.output_tokens;
  }
  if (result.inputTokens !== undefined || result.outputTokens !== undefined) {
    result.totalTokens = (result.inputTokens ?? 0) + (result.outputTokens ?? 0);
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Parse a raw HTTP status + JSON body into the unified result shape. Any status >= 400 (or a missing
 * body) yields `{ ok: false, status, error }` with a best-effort provider error message; otherwise
 * `{ ok: true, text, model, finishReason?, usage? }`.
 */
function parseChatResult({ providerId, status, json }) {
  const httpStatus = typeof status === "number" ? status : 0;
  if (httpStatus >= 400 || !json || typeof json !== "object") {
    return { ok: false, status: httpStatus, error: extractErrorMessage(json, httpStatus) };
  }

  if (providerId === "anthropic") {
    const blocks = Array.isArray(json.content) ? json.content : [];
    const text = blocks
      .filter((block) => block && block.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("");
    return {
      ok: true,
      text,
      model: typeof json.model === "string" ? json.model : "",
      finishReason: typeof json.stop_reason === "string" ? json.stop_reason : undefined,
      usage: normalizeAnthropicUsage(json.usage)
    };
  }

  const choice = Array.isArray(json.choices) ? json.choices[0] : undefined;
  const message = choice && typeof choice === "object" ? choice.message : undefined;
  const text = message && typeof message.content === "string" ? message.content : "";
  return {
    ok: true,
    text,
    model: typeof json.model === "string" ? json.model : "",
    finishReason:
      choice && typeof choice.finish_reason === "string" ? choice.finish_reason : undefined,
    usage: normalizeOpenAiUsage(json.usage)
  };
}

/**
 * Validate that the minimum config needed to make a request is present. Returns a human-readable
 * reason string when something required is missing, or null when the request can proceed. Lets the
 * `ai:chat` handler fail fast with a clear message instead of firing a doomed request.
 */
function describeMissingConfig({ providerId, config, apiKey }) {
  const cfg = config && typeof config === "object" ? config : {};
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    return "No API key is configured for this provider.";
  }

  if (providerId === "azure-openai") {
    if (!cfg.azureResourceUrl || !String(cfg.azureResourceUrl).trim()) {
      return "An Azure resource endpoint is required (e.g. https://my-resource.openai.azure.com).";
    }
    if (!cfg.azureDeployment || !String(cfg.azureDeployment).trim()) {
      return "An Azure deployment name is required.";
    }
    return null;
  }

  if (!cfg.model || !String(cfg.model).trim()) {
    return "A model name is required.";
  }
  return null;
}

module.exports = {
  ANTHROPIC_VERSION,
  DEFAULT_AZURE_API_VERSION,
  DEFAULT_MAX_TOKENS,
  normalizeMessages,
  buildChatHttpRequest,
  parseChatResult,
  describeMissingConfig
};
