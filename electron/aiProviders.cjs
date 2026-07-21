// Pure provider adapter for the AI abstraction layer. This module performs no I/O: it turns a
// provider id + non-secret config + messages into a concrete HTTP request descriptor, and turns a
// raw HTTP status + parsed JSON body back into a unified result shape. The Electron main process
// runs it as raw CommonJS (no transpile step), and the `ai:chat` IPC handler is thin glue that
// fetches the descriptor this builds and parses with `parseChatResult`. Keeping it pure makes the
// providers' wire-format differences fully unit-testable (see `aiProviders.test.ts`).
//
// The providers collapse into two wire formats:
//   - OpenAI-compatible Chat Completions: OpenAI, DeepSeek, Azure OpenAI, and local runtimes (Ollama,
//     LM Studio). Azure differs only in URL shape and an `api-key` header instead of
//     `Authorization: Bearer`; local runtimes need no API key, so the Authorization header is omitted
//     when none is set.
//   - Anthropic Messages (`/v1/messages`, `x-api-key`, `anthropic-version`; `system` is a top-level
//     field rather than a message role).

const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_AZURE_API_VERSION = "2024-10-21";
const DEFAULT_MAX_TOKENS = 1024;

// OpenAI-compatible providers share one wire format but default to different base URLs when the user
// leaves the field blank. Local runtimes expose the API on loopback.
const OPENAI_COMPATIBLE_DEFAULT_BASE_URLS = {
  deepseek: "https://api.deepseek.com",
  ollama: "http://localhost:11434/v1",
  "lm-studio": "http://localhost:1234/v1"
};

// Local runtimes accept (and ignore) the Authorization header, so no API key is required to use them.
const KEYLESS_PROVIDER_IDS = new Set(["ollama", "lm-studio", "opencode"]);

function openAiCompatibleDefaultBaseUrl(providerId) {
  return OPENAI_COMPATIBLE_DEFAULT_BASE_URLS[providerId] || "https://api.openai.com/v1";
}

function providerRequiresApiKey(providerId) {
  return !KEYLESS_PROVIDER_IDS.has(providerId);
}

// OpenAI renamed the Chat Completions `max_tokens` field to `max_completion_tokens`; its newer models
// (o-series, gpt-5+) reject the old name with an HTTP 400. Azure OpenAI tracks the same API. Third-
// party OpenAI-compatible servers (DeepSeek) and local runtimes (Ollama, LM Studio) still implement
// the original `max_tokens`, so only the first-party providers switch field names.
const MAX_COMPLETION_TOKENS_PROVIDER_IDS = new Set(["openai", "azure-openai"]);

function maxTokensField(providerId) {
  return MAX_COMPLETION_TOKENS_PROVIDER_IDS.has(providerId) ? "max_completion_tokens" : "max_tokens";
}

// Some OpenAI models (o-series, gpt-5+) only accept the default temperature and return an HTTP 400 for
// any explicit value ("Unsupported value: 'temperature' does not support 0.7 with this model. Only the
// default (1) value is supported."). Detect that specific failure (from a parsed `{ ok:false, error }`
// result) so the chat handlers can transparently retry once without temperature instead of failing.
function isUnsupportedTemperatureError(result) {
  if (!result || result.ok !== false) {
    return false;
  }
  const message = typeof result.error === "string" ? result.error.toLowerCase() : "";
  if (!message.includes("temperature")) {
    return false;
  }
  return (
    message.includes("unsupported value") ||
    message.includes("unsupported parameter") ||
    message.includes("does not support") ||
    message.includes("only the default") ||
    message.includes("only default")
  );
}

function trimTrailingSlashes(value) {
  return typeof value === "string" ? value.replace(/\/+$/, "") : "";
}

function coerceRole(role) {
  return role === "system" || role === "assistant" || role === "user" ? role : "user";
}

// Keep only well-formed content: a non-empty string, or an array of valid text/image blocks (for a
// multimodal turn). Returns null when nothing usable remains so the caller can drop the message.
function normalizeContent(content) {
  if (typeof content === "string") {
    return content ? content : null;
  }
  if (Array.isArray(content)) {
    const blocks = [];
    for (const block of content) {
      if (!block || typeof block !== "object") {
        continue;
      }
      if (block.type === "text" && typeof block.text === "string" && block.text) {
        blocks.push({ type: "text", text: block.text });
      } else if (
        block.type === "image" &&
        typeof block.mediaType === "string" &&
        block.mediaType &&
        typeof block.data === "string" &&
        block.data
      ) {
        blocks.push({ type: "image", mediaType: block.mediaType, data: block.data });
      }
    }
    return blocks.length > 0 ? blocks : null;
  }
  return null;
}

// Drop malformed entries and coerce roles, so the request builders only ever see well-formed
// `{ role, content }` messages whose content is either a string or an array of text/image blocks.
function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  const result = [];
  for (const message of messages) {
    if (!message || typeof message !== "object") {
      continue;
    }
    const content = normalizeContent(message.content);
    if (content === null) {
      continue;
    }
    result.push({ role: coerceRole(message.role), content });
  }
  return result;
}

// Translate neutral content (a string, or text/image blocks) into Anthropic Messages content.
// Anthropic wants an image as a base64 source with a separate `media_type`, not a data: URL.
function toAnthropicContent(content) {
  if (typeof content === "string") {
    return content;
  }
  return content.map((block) =>
    block.type === "image"
      ? { type: "image", source: { type: "base64", media_type: block.mediaType, data: block.data } }
      : { type: "text", text: block.text }
  );
}

// Translate neutral content into OpenAI-compatible Chat Completions content. OpenAI expects an image
// as an `image_url` part whose url is a data: URL.
function toOpenAiContent(content) {
  if (typeof content === "string") {
    return content;
  }
  return content.map((block) =>
    block.type === "image"
      ? { type: "image_url", image_url: { url: `data:${block.mediaType};base64,${block.data}` } }
      : { type: "text", text: block.text }
  );
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
      messages: conversation.map((message) => ({
        role: message.role,
        content: toAnthropicContent(message.content)
      }))
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

  const openAiMessages = allMessages.map((message) => ({
    role: message.role,
    content: toOpenAiContent(message.content)
  }));

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
      body[maxTokensField(providerId)] = resolvedMaxTokens;
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

  // openai + deepseek + local runtimes: identical wire format, different default base URL.
  const baseUrl = trimTrailingSlashes(cfg.baseUrl) || openAiCompatibleDefaultBaseUrl(providerId);
  const body = {
    model: typeof cfg.model === "string" ? cfg.model : "",
    messages: openAiMessages
  };
  if (resolvedTemperature !== undefined) {
    body.temperature = resolvedTemperature;
  }
  if (resolvedMaxTokens !== undefined) {
    body[maxTokensField(providerId)] = resolvedMaxTokens;
  }
  // Local runtimes need no key; only send Authorization when one is configured (a secured proxy).
  const headers = { "Content-Type": "application/json" };
  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }
  return {
    url: `${baseUrl}/chat/completions`,
    method: "POST",
    headers,
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
  if (providerRequiresApiKey(providerId) && (typeof apiKey !== "string" || !apiKey.trim())) {
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

// ---------------------------------------------------------------------------
// Agentic (tool-calling, streaming) path.
//
// The selection features above send one plain text turn and read one text reply, so they keep
// `buildChatHttpRequest` / `parseChatResult` untouched. The in-app AI chat panel instead runs an
// agent loop: each turn may carry tool definitions and prior tool-call/tool-result turns, the
// request is streamed (SSE), and the reply may be either text or a batch of tool calls. The two
// wire formats diverge more here, so this section has its own message normalizers, a provider-
// agnostic SSE decoder + per-provider event parsers, and a reducer that reassembles the streamed
// deltas into the same `{ text, toolCalls, finishReason, usage }` shape the non-stream parser
// returns — so the caller's loop is identical whether the response streamed or not.
// ---------------------------------------------------------------------------

function normalizeToolsForOpenAi(tools) {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: typeof tool.description === "string" ? tool.description : "",
      parameters:
        tool.inputSchema && typeof tool.inputSchema === "object"
          ? tool.inputSchema
          : { type: "object", properties: {} }
    }
  }));
}

function normalizeToolsForAnthropic(tools) {
  return tools.map((tool) => ({
    name: tool.name,
    description: typeof tool.description === "string" ? tool.description : "",
    input_schema:
      tool.inputSchema && typeof tool.inputSchema === "object"
        ? tool.inputSchema
        : { type: "object", properties: {} }
  }));
}

function toolCallArgumentsString(toolCall) {
  if (typeof toolCall.arguments === "string") {
    return toolCall.arguments;
  }
  try {
    return JSON.stringify(toolCall.arguments ?? {});
  } catch {
    return "{}";
  }
}

function parseToolCallArguments(toolCall) {
  if (toolCall.arguments && typeof toolCall.arguments === "object") {
    return toolCall.arguments;
  }
  if (typeof toolCall.arguments === "string" && toolCall.arguments.trim()) {
    try {
      return JSON.parse(toolCall.arguments);
    } catch {
      return {};
    }
  }
  return {};
}

// Translate the renderer's normalized agent messages into the OpenAI Chat Completions shape:
// assistant turns can carry `tool_calls`, and each tool result is its own `tool`-role message keyed
// by `tool_call_id`.
function toOpenAiAgentMessages(messages, system) {
  const out = [];
  if (typeof system === "string" && system.trim()) {
    out.push({ role: "system", content: system });
  }

  for (const message of messages) {
    if (!message || typeof message !== "object") {
      continue;
    }
    if (message.role === "system") {
      out.push({ role: "system", content: String(message.content ?? "") });
      continue;
    }
    if (message.role === "user") {
      out.push({ role: "user", content: String(message.content ?? "") });
      continue;
    }
    if (message.role === "assistant") {
      const entry = { role: "assistant", content: typeof message.content === "string" ? message.content : "" };
      if (Array.isArray(message.toolCalls) && message.toolCalls.length > 0) {
        entry.tool_calls = message.toolCalls.map((toolCall) => ({
          id: toolCall.id,
          type: "function",
          function: { name: toolCall.name, arguments: toolCallArgumentsString(toolCall) }
        }));
        // OpenAI expects content to be null (not "") on an assistant turn that only calls tools.
        if (!entry.content) {
          entry.content = null;
        }
      }
      out.push(entry);
      continue;
    }
    if (message.role === "tool") {
      out.push({
        role: "tool",
        tool_call_id: message.toolCallId,
        content: typeof message.content === "string" ? message.content : String(message.content ?? "")
      });
    }
  }

  return out;
}

// Translate the renderer's normalized agent messages into Anthropic Messages shape: system is
// hoisted, assistant turns become `content` blocks (text + `tool_use`), and tool results become
// `tool_result` blocks inside a `user` turn — consecutive tool results are merged into one user
// turn, as Anthropic expects all results for a tool-use turn together.
function toAnthropicAgentConversation(messages, explicitSystem) {
  const systemParts = [];
  if (typeof explicitSystem === "string" && explicitSystem.trim()) {
    systemParts.push(explicitSystem);
  }
  const conversation = [];

  for (const message of messages) {
    if (!message || typeof message !== "object") {
      continue;
    }
    if (message.role === "system") {
      if (message.content) {
        systemParts.push(String(message.content));
      }
      continue;
    }
    if (message.role === "user") {
      conversation.push({ role: "user", content: String(message.content ?? "") });
      continue;
    }
    if (message.role === "assistant") {
      const blocks = [];
      if (typeof message.content === "string" && message.content.length > 0) {
        blocks.push({ type: "text", text: message.content });
      }
      if (Array.isArray(message.toolCalls)) {
        for (const toolCall of message.toolCalls) {
          blocks.push({
            type: "tool_use",
            id: toolCall.id,
            name: toolCall.name,
            input: parseToolCallArguments(toolCall)
          });
        }
      }
      conversation.push({ role: "assistant", content: blocks.length > 0 ? blocks : "" });
      continue;
    }
    if (message.role === "tool") {
      const block = {
        type: "tool_result",
        tool_use_id: message.toolCallId,
        content: typeof message.content === "string" ? message.content : String(message.content ?? "")
      };
      if (message.isError) {
        block.is_error = true;
      }
      const last = conversation[conversation.length - 1];
      if (last && last.role === "user" && Array.isArray(last.content)) {
        last.content.push(block);
      } else {
        conversation.push({ role: "user", content: [block] });
      }
    }
  }

  return { system: systemParts.join("\n\n"), conversation };
}

/**
 * Build the streamed, tool-aware chat request descriptor. Same `{ url, method, headers, body }`
 * contract as `buildChatHttpRequest`, but `body.stream` is true, `tools` (when given) are emitted in
 * the provider's format, and `messages` accept the richer agent shape (assistant tool calls + tool
 * results). Azure still selects the model via the deployment path, so no `model` goes in the body.
 */
function buildAgentChatHttpRequest({
  providerId,
  config,
  apiKey,
  messages,
  system,
  tools,
  temperature,
  maxTokens
}) {
  const cfg = config && typeof config === "object" ? config : {};
  const key = typeof apiKey === "string" ? apiKey : "";
  const list = Array.isArray(messages) ? messages : [];
  const toolList = Array.isArray(tools) && tools.length > 0 ? tools : null;
  const resolvedTemperature = resolveTemperature(temperature);
  const resolvedMaxTokens = resolveMaxTokens(maxTokens);

  if (providerId === "anthropic") {
    const baseUrl = trimTrailingSlashes(cfg.baseUrl) || "https://api.anthropic.com";
    const { system: hoistedSystem, conversation } = toAnthropicAgentConversation(list, system);
    const body = {
      model: typeof cfg.model === "string" ? cfg.model : "",
      max_tokens: resolvedMaxTokens ?? DEFAULT_MAX_TOKENS,
      messages: conversation,
      stream: true
    };
    if (hoistedSystem) {
      body.system = hoistedSystem;
    }
    if (resolvedTemperature !== undefined) {
      body.temperature = resolvedTemperature;
    }
    if (toolList) {
      body.tools = normalizeToolsForAnthropic(toolList);
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

  const openAiMessages = toOpenAiAgentMessages(list, system);

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
    const body = { messages: openAiMessages, stream: true, stream_options: { include_usage: true } };
    if (resolvedTemperature !== undefined) {
      body.temperature = resolvedTemperature;
    }
    if (resolvedMaxTokens !== undefined) {
      body[maxTokensField(providerId)] = resolvedMaxTokens;
    }
    if (toolList) {
      body.tools = normalizeToolsForOpenAi(toolList);
    }
    return {
      url: `${resourceUrl}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`,
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": key },
      body
    };
  }

  const baseUrl = trimTrailingSlashes(cfg.baseUrl) || openAiCompatibleDefaultBaseUrl(providerId);
  const body = {
    model: typeof cfg.model === "string" ? cfg.model : "",
    messages: openAiMessages,
    stream: true,
    stream_options: { include_usage: true }
  };
  if (resolvedTemperature !== undefined) {
    body.temperature = resolvedTemperature;
  }
  if (resolvedMaxTokens !== undefined) {
    body[maxTokensField(providerId)] = resolvedMaxTokens;
  }
  if (toolList) {
    body.tools = normalizeToolsForOpenAi(toolList);
  }
  // Local runtimes need no key; only send Authorization when one is configured (a secured proxy).
  const headers = { "Content-Type": "application/json" };
  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }
  return {
    url: `${baseUrl}/chat/completions`,
    method: "POST",
    headers,
    body
  };
}

/**
 * Incremental Server-Sent-Events decoder. `push(chunk)` returns the events completed by that chunk
 * as `{ json }` (a parsed `data:` payload) or `{ done: true }` (the OpenAI `[DONE]` sentinel);
 * incomplete events stay buffered for the next chunk. Newlines are normalized so a `\r\n` split
 * across two chunks still resolves to one event boundary.
 */
function createSseDecoder() {
  let buffer = "";
  return {
    push(chunk) {
      buffer = (buffer + String(chunk ?? "")).replace(/\r\n/g, "\n");
      const events = [];
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const dataLines = [];
        for (const line of rawEvent.split("\n")) {
          if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).replace(/^ /, ""));
          }
        }
        if (dataLines.length === 0) {
          continue;
        }
        const data = dataLines.join("\n");
        if (data === "[DONE]") {
          events.push({ done: true });
          continue;
        }
        try {
          events.push({ json: JSON.parse(data) });
        } catch {
          // Ignore keep-alive comments / non-JSON lines.
        }
      }
      return events;
    }
  };
}

// Parse one OpenAI-compatible stream chunk into zero or more normalized events.
function parseOpenAiStreamEvent(json) {
  const events = [];
  if (!json || typeof json !== "object") {
    return events;
  }
  if (typeof json.model === "string" && json.model) {
    events.push({ type: "meta", model: json.model });
  }
  const choice = Array.isArray(json.choices) ? json.choices[0] : undefined;
  if (choice && typeof choice === "object") {
    const delta = choice.delta && typeof choice.delta === "object" ? choice.delta : {};
    if (typeof delta.content === "string" && delta.content.length > 0) {
      events.push({ type: "text", text: delta.content });
    }
    if (Array.isArray(delta.tool_calls)) {
      for (const toolCall of delta.tool_calls) {
        if (!toolCall || typeof toolCall !== "object") {
          continue;
        }
        const event = { type: "tool_call_delta", index: typeof toolCall.index === "number" ? toolCall.index : 0 };
        if (typeof toolCall.id === "string") {
          event.id = toolCall.id;
        }
        if (toolCall.function && typeof toolCall.function === "object") {
          if (typeof toolCall.function.name === "string") {
            event.name = toolCall.function.name;
          }
          if (typeof toolCall.function.arguments === "string") {
            event.argsFragment = toolCall.function.arguments;
          }
        }
        events.push(event);
      }
    }
    if (typeof choice.finish_reason === "string" && choice.finish_reason) {
      events.push({ type: "done", finishReason: choice.finish_reason, usage: normalizeOpenAiUsage(json.usage) });
    }
  } else if (json.usage) {
    // Final usage-only chunk emitted when stream_options.include_usage is set.
    events.push({ type: "usage", usage: normalizeOpenAiUsage(json.usage) });
  }
  return events;
}

// Parse one Anthropic Messages stream event into zero or more normalized events.
function parseAnthropicStreamEvent(json) {
  const events = [];
  if (!json || typeof json !== "object") {
    return events;
  }
  switch (json.type) {
    case "message_start": {
      const message = json.message && typeof json.message === "object" ? json.message : {};
      if (typeof message.model === "string" && message.model) {
        events.push({ type: "meta", model: message.model });
      }
      const usage = normalizeAnthropicUsage(message.usage);
      if (usage) {
        events.push({ type: "usage", usage });
      }
      break;
    }
    case "content_block_start": {
      const block = json.content_block && typeof json.content_block === "object" ? json.content_block : {};
      if (block.type === "tool_use") {
        events.push({
          type: "tool_call_delta",
          index: typeof json.index === "number" ? json.index : 0,
          id: block.id,
          name: block.name,
          argsFragment: ""
        });
      }
      break;
    }
    case "content_block_delta": {
      const delta = json.delta && typeof json.delta === "object" ? json.delta : {};
      if (delta.type === "text_delta" && typeof delta.text === "string") {
        events.push({ type: "text", text: delta.text });
      } else if (delta.type === "input_json_delta" && typeof delta.partial_json === "string") {
        events.push({
          type: "tool_call_delta",
          index: typeof json.index === "number" ? json.index : 0,
          argsFragment: delta.partial_json
        });
      }
      break;
    }
    case "message_delta": {
      const stopReason = json.delta && typeof json.delta === "object" ? json.delta.stop_reason : undefined;
      events.push({
        type: "done",
        finishReason: typeof stopReason === "string" ? stopReason : undefined,
        usage: normalizeAnthropicUsage(json.usage)
      });
      break;
    }
    case "error": {
      const message =
        json.error && typeof json.error === "object" && typeof json.error.message === "string"
          ? json.error.message
          : "The provider reported a streaming error.";
      events.push({ type: "stream_error", message });
      break;
    }
    default:
      break;
  }
  return events;
}

function mergeStreamUsage(existing, incoming) {
  if (!existing && !incoming) {
    return undefined;
  }
  const merged = { ...(existing || {}) };
  if (incoming) {
    if (typeof incoming.inputTokens === "number") {
      merged.inputTokens = incoming.inputTokens;
    }
    if (typeof incoming.outputTokens === "number") {
      merged.outputTokens = incoming.outputTokens;
    }
    if (typeof incoming.totalTokens === "number") {
      merged.totalTokens = incoming.totalTokens;
    }
  }
  if (merged.inputTokens !== undefined || merged.outputTokens !== undefined) {
    merged.totalTokens = (merged.inputTokens ?? 0) + (merged.outputTokens ?? 0);
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function createStreamState() {
  return { text: "", toolCalls: [], model: "", finishReason: undefined, usage: undefined, done: false };
}

/**
 * Fold one normalized stream event into the accumulating state. Tool calls are keyed by their
 * provider index (a sparse array for Anthropic, where text occupies index 0) and compacted by
 * `finalizeStreamState`. Returns the same state object for convenient reduction.
 */
function applyStreamEvent(state, event) {
  if (!event || typeof event !== "object") {
    return state;
  }
  switch (event.type) {
    case "text":
      state.text += event.text || "";
      break;
    case "meta":
      if (event.model) {
        state.model = event.model;
      }
      break;
    case "tool_call_delta": {
      const index = typeof event.index === "number" ? event.index : 0;
      let slot = state.toolCalls[index];
      if (!slot) {
        slot = { id: "", name: "", arguments: "" };
        state.toolCalls[index] = slot;
      }
      if (event.id) {
        slot.id = event.id;
      }
      if (event.name) {
        slot.name = event.name;
      }
      if (event.argsFragment) {
        slot.arguments += event.argsFragment;
      }
      break;
    }
    case "usage":
      state.usage = mergeStreamUsage(state.usage, event.usage);
      break;
    case "done":
      if (event.finishReason) {
        state.finishReason = event.finishReason;
      }
      if (event.usage) {
        state.usage = mergeStreamUsage(state.usage, event.usage);
      }
      state.done = true;
      break;
    default:
      break;
  }
  return state;
}

// Compact the accumulated state into the final result shape (matching `parseAgentChatResult`).
function finalizeStreamState(state) {
  return {
    ok: true,
    text: state.text,
    toolCalls: state.toolCalls.filter((toolCall) => toolCall && toolCall.name),
    model: state.model || "",
    finishReason: state.finishReason,
    usage: state.usage
  };
}

function getStreamEventParser(providerId) {
  return providerId === "anthropic" ? parseAnthropicStreamEvent : parseOpenAiStreamEvent;
}

/**
 * Parse a complete (non-streamed) tool-aware JSON response into the unified agent result shape.
 * Used as a fallback when a provider or proxy ignores `stream: true` and returns one JSON body.
 */
function parseAgentChatResult({ providerId, status, json }) {
  const httpStatus = typeof status === "number" ? status : 0;
  if (httpStatus >= 400 || !json || typeof json !== "object") {
    return { ok: false, status: httpStatus, error: extractErrorMessage(json, httpStatus) };
  }

  if (providerId === "anthropic") {
    const blocks = Array.isArray(json.content) ? json.content : [];
    let text = "";
    const toolCalls = [];
    for (const block of blocks) {
      if (!block || typeof block !== "object") {
        continue;
      }
      if (block.type === "text" && typeof block.text === "string") {
        text += block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({ id: block.id, name: block.name, arguments: JSON.stringify(block.input ?? {}) });
      }
    }
    return {
      ok: true,
      text,
      toolCalls,
      model: typeof json.model === "string" ? json.model : "",
      finishReason: typeof json.stop_reason === "string" ? json.stop_reason : undefined,
      usage: normalizeAnthropicUsage(json.usage)
    };
  }

  const choice = Array.isArray(json.choices) ? json.choices[0] : undefined;
  const message = choice && typeof choice === "object" ? choice.message : undefined;
  const text = message && typeof message.content === "string" ? message.content : "";
  const toolCalls = [];
  if (message && Array.isArray(message.tool_calls)) {
    for (const toolCall of message.tool_calls) {
      if (!toolCall || typeof toolCall !== "object") {
        continue;
      }
      const fn = toolCall.function && typeof toolCall.function === "object" ? toolCall.function : {};
      toolCalls.push({
        id: toolCall.id,
        name: typeof fn.name === "string" ? fn.name : "",
        arguments: typeof fn.arguments === "string" ? fn.arguments : "{}"
      });
    }
  }
  return {
    ok: true,
    text,
    toolCalls,
    model: typeof json.model === "string" ? json.model : "",
    finishReason: choice && typeof choice.finish_reason === "string" ? choice.finish_reason : undefined,
    usage: normalizeOpenAiUsage(json.usage)
  };
}

module.exports = {
  ANTHROPIC_VERSION,
  DEFAULT_AZURE_API_VERSION,
  DEFAULT_MAX_TOKENS,
  normalizeMessages,
  toAnthropicContent,
  toOpenAiContent,
  providerRequiresApiKey,
  buildChatHttpRequest,
  parseChatResult,
  describeMissingConfig,
  isUnsupportedTemperatureError,
  buildAgentChatHttpRequest,
  parseAgentChatResult,
  createSseDecoder,
  parseOpenAiStreamEvent,
  parseAnthropicStreamEvent,
  getStreamEventParser,
  createStreamState,
  applyStreamEvent,
  finalizeStreamState
};
