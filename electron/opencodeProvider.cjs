// Pure OpenCode Serve adapter. It contains only wire-shape construction/parsing so the Electron
// main process owns network I/O, secrets, session lifecycle, and permission dialogs while this
// module stays straightforward to unit test.

const DEFAULT_BASE_URL = "http://127.0.0.1:4096";
const DEFAULT_USERNAME = "opencode";

function trimTrailingSlashes(value) {
  return typeof value === "string" ? value.trim().replace(/\/+$/, "") : "";
}

function baseUrl(config) {
  return trimTrailingSlashes(config?.baseUrl) || DEFAULT_BASE_URL;
}

function authHeaders(config, password) {
  const headers = { Accept: "application/json" };
  if (typeof password === "string" && password) {
    const username =
      typeof config?.opencodeUsername === "string" && config.opencodeUsername.trim()
        ? config.opencodeUsername.trim()
        : DEFAULT_USERNAME;
    headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
  }
  return headers;
}

function request(config, password, pathname, options = {}) {
  const headers = { ...authHeaders(config, password), ...(options.headers || {}) };
  return {
    url: `${baseUrl(config)}${pathname}`,
    method: options.method || "GET",
    headers,
    ...(options.body === undefined ? {} : { body: options.body })
  };
}

function sessionPath(sessionId, suffix = "") {
  return `/session/${encodeURIComponent(String(sessionId || ""))}${suffix}`;
}

function contentToParts(content) {
  if (typeof content === "string") {
    return content ? [{ type: "text", text: content }] : [];
  }
  if (!Array.isArray(content)) {
    return [];
  }
  const parts = [];
  for (const block of content) {
    if (block?.type === "text" && typeof block.text === "string" && block.text) {
      parts.push({ type: "text", text: block.text });
    } else if (
      block?.type === "image" &&
      typeof block.mediaType === "string" &&
      block.mediaType &&
      typeof block.data === "string" &&
      block.data
    ) {
      parts.push({
        type: "file",
        mime: block.mediaType,
        filename: "nexus-import",
        url: `data:${block.mediaType};base64,${block.data}`
      });
    }
  }
  return parts;
}

function latestUserParts(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") {
      return contentToParts(message.content);
    }
  }
  return [];
}

function buildCreateSessionRequest({ config, password, title }) {
  return request(config, password, "/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: { title: typeof title === "string" && title.trim() ? title.trim() : "Nexus AI" }
  });
}

function buildPromptRequest({ sessionId, config, password, messages, system, asynchronous = false }) {
  const body = { parts: latestUserParts(messages) };
  if (typeof system === "string" && system.trim()) {
    body.system = system;
  }
  if (typeof config?.opencodeAgent === "string" && config.opencodeAgent.trim()) {
    body.agent = config.opencodeAgent.trim();
  }
  const providerID =
    typeof config?.opencodeProviderId === "string" ? config.opencodeProviderId.trim() : "";
  const modelID = typeof config?.model === "string" ? config.model.trim() : "";
  if (providerID && modelID) {
    body.model = { providerID, modelID };
  }
  return request(
    config,
    password,
    sessionPath(sessionId, asynchronous ? "/prompt_async" : "/message"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body
    }
  );
}

function buildSessionActionRequest({ sessionId, config, password, action }) {
  const suffix = action === "delete" ? "" : `/${action}`;
  return request(config, password, sessionPath(sessionId, suffix), {
    method: action === "delete" ? "DELETE" : "POST",
    headers: { "Content-Type": "application/json" }
  });
}

function errorMessage(json, status) {
  const source = json?.error ?? json;
  const message = source?.data?.message ?? source?.message ?? json?.message;
  return typeof message === "string" && message.trim()
    ? message.trim()
    : `OpenCode request failed${status ? ` (HTTP ${status})` : ""}.`;
}

function parseSession(json) {
  const value = json?.data ?? json;
  return value && typeof value.id === "string" ? value : null;
}

function parseMessage(json, status = 200) {
  const value = json?.data ?? json;
  if (status >= 400 || !value || typeof value !== "object") {
    return { ok: false, status, error: errorMessage(json, status) };
  }
  const info = value.info && typeof value.info === "object" ? value.info : {};
  if (info.error) {
    return { ok: false, status, error: errorMessage(info.error, status) };
  }
  const parts = Array.isArray(value.parts) ? value.parts : [];
  const text = parts
    .filter((part) => part?.type === "text" && typeof part.text === "string" && !part.ignored)
    .map((part) => part.text)
    .join("");
  const tokens = info.tokens && typeof info.tokens === "object" ? info.tokens : {};
  const input = Number.isFinite(tokens.input) ? tokens.input : undefined;
  const output = Number.isFinite(tokens.output) ? tokens.output : undefined;
  const usage = {};
  if (input !== undefined) usage.inputTokens = input;
  if (output !== undefined) usage.outputTokens = output;
  if (input !== undefined || output !== undefined) usage.totalTokens = (input || 0) + (output || 0);
  return {
    ok: true,
    text,
    toolCalls: [],
    model: typeof info.modelID === "string" ? info.modelID : "",
    finishReason: typeof info.finish === "string" ? info.finish : undefined,
    usage: Object.keys(usage).length ? usage : undefined
  };
}

function providerModels(provider) {
  const models = provider?.models && typeof provider.models === "object" ? provider.models : {};
  return Object.entries(models).map(([key, model]) => ({
    id: typeof model?.id === "string" && model.id ? model.id : key,
    name: typeof model?.name === "string" && model.name ? model.name : key,
    attachment:
      typeof model?.attachment === "boolean"
        ? model.attachment
        : Array.isArray(model?.modalities?.input)
          ? model.modalities.input.includes("image") || model.modalities.input.includes("pdf")
          : undefined
  }));
}

function parseDiscovery({ health, providers, configProviders, agents }) {
  if (!health || health.healthy !== true) {
    return { ok: false, error: "The OpenCode server did not report a healthy status." };
  }
  const providerEnvelope = providers?.data ?? providers ?? {};
  const all = Array.isArray(providerEnvelope.all) ? providerEnvelope.all : [];
  const connected = new Set(
    Array.isArray(providerEnvelope.connected) ? providerEnvelope.connected.filter((id) => typeof id === "string") : []
  );
  const normalizedProviders = all
    .filter((provider) => provider && typeof provider.id === "string")
    .filter((provider) => connected.size === 0 || connected.has(provider.id))
    .map((provider) => ({
      id: provider.id,
      name: typeof provider.name === "string" && provider.name ? provider.name : provider.id,
      models: providerModels(provider)
    }));
  const agentList = agents?.data ?? agents;
  const defaultEnvelope = configProviders?.data ?? configProviders ?? {};
  return {
    ok: true,
    version: typeof health.version === "string" ? health.version : "",
    agents: Array.isArray(agentList)
      ? agentList
          .map((agent) => (typeof agent === "string" ? agent : agent?.name))
          .filter((name) => typeof name === "string" && name)
      : [],
    providers: normalizedProviders,
    defaultModels:
      defaultEnvelope.default && typeof defaultEnvelope.default === "object"
        ? defaultEnvelope.default
        : providerEnvelope.default && typeof providerEnvelope.default === "object"
          ? providerEnvelope.default
          : {}
  };
}

function unwrapEvent(value) {
  const parsed = value?.payload && typeof value.payload === "object" ? value.payload : value;
  return parsed && typeof parsed === "object" ? parsed : null;
}

function parseEvent(value, sessionId) {
  const event = unwrapEvent(value);
  if (!event || typeof event.type !== "string") return [];
  const properties = event.properties && typeof event.properties === "object" ? event.properties : {};
  const eventSessionId = properties.sessionID ?? properties.info?.sessionID ?? properties.part?.sessionID;
  if (eventSessionId && sessionId && eventSessionId !== sessionId) return [];

  if (event.type === "message.part.updated") {
    const part = properties.part;
    if (part?.type === "text" && typeof properties.delta === "string" && properties.delta) {
      return [{ type: "text", text: properties.delta }];
    }
    if (part?.type === "tool") {
      const state = part.state && typeof part.state === "object" ? part.state : {};
      const status =
        state.status === "completed"
          ? "done"
          : state.status === "error"
            ? "error"
            : state.status === "running"
              ? "running"
              : "pending";
      return [{
        type: "provider_tool",
        id: typeof part.callID === "string" ? part.callID : part.id || "",
        name: typeof part.tool === "string" ? part.tool : "tool",
        title: typeof state.title === "string" ? state.title : undefined,
        status,
        input: state.input ? JSON.stringify(state.input) : undefined,
        output:
          typeof state.output === "string"
            ? state.output
            : typeof state.error === "string"
              ? state.error
              : undefined
      }];
    }
  }
  if (event.type === "permission.updated") return [{ type: "permission", permission: properties }];
  if (event.type.includes("question")) return [{ type: "question" }];
  if (event.type === "session.idle") return [{ type: "idle" }];
  if (event.type === "session.error") {
    return [{ type: "error", error: errorMessage(properties.error, 0) }];
  }
  return [];
}

module.exports = {
  DEFAULT_BASE_URL,
  DEFAULT_USERNAME,
  baseUrl,
  authHeaders,
  request,
  contentToParts,
  latestUserParts,
  buildCreateSessionRequest,
  buildPromptRequest,
  buildSessionActionRequest,
  parseSession,
  parseMessage,
  parseDiscovery,
  parseEvent,
  errorMessage
};
