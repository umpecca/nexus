// Renderer-side model for the AI abstraction layer: the provider identifiers, the wire types shared
// across the IPC boundary, and per-provider UI metadata (labels, defaults, suggested models, which
// extra fields each provider needs). The actual request construction/parsing lives in the pure
// main-process adapter `electron/aiProviders.cjs`; this file is what the setup dialog and settings
// persistence build on. Model names are kept as free-text fields seeded by `suggestedModels`, so the
// suggestions can drift without the configured value ever becoming invalid.

export type AiProviderId =
  | "openai"
  | "azure-openai"
  | "deepseek"
  | "anthropic"
  | "ollama"
  | "lm-studio";

export const AI_PROVIDER_IDS: readonly AiProviderId[] = [
  "openai",
  "azure-openai",
  "deepseek",
  "anthropic",
  "ollama",
  "lm-studio"
];

export type AiMessageRole = "system" | "user" | "assistant";

/** A text part of a (possibly multimodal) message. */
export type AiTextContentBlock = { type: "text"; text: string };
/** An image part of a multimodal message. `data` is raw base64 (no data: URL prefix). */
export type AiImageContentBlock = { type: "image"; mediaType: string; data: string };
/** One part of a multimodal message. The adapter translates these per provider wire format. */
export type AiContentBlock = AiTextContentBlock | AiImageContentBlock;

export interface AiMessage {
  role: AiMessageRole;
  /** Either plain text, or an ordered list of content blocks for multimodal (text + image) turns. */
  content: string | AiContentBlock[];
}

export interface AiChatUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

/** Unified result returned by the `ai:chat` IPC handler for every provider. */
export type AiChatResult =
  | { ok: true; text: string; model: string; finishReason?: string; usage?: AiChatUsage }
  | { ok: false; status?: number; error: string };

/** The non-secret config the renderer hands to the main process for a single chat request. */
export interface AiRequestConfig {
  baseUrl?: string;
  model?: string;
  azureResourceUrl?: string;
  azureDeployment?: string;
  azureApiVersion?: string;
}

/** Full payload for the `ai:chat` IPC call. The API key is never included — main reads it from the
 *  encrypted store by (profileName, providerId). */
export interface AiChatPayload {
  profileName: string;
  providerId: AiProviderId;
  config: AiRequestConfig;
  messages: AiMessage[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
}

// --- Agentic (tool-calling, streaming) types, used by the in-app AI chat panel. ---------------

/** A tool the model may call. `inputSchema` is a JSON Schema object (the MCP tool's inputSchema). */
export interface AiToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/** A tool call the model emitted. `arguments` is the raw JSON string the model produced. */
export interface AiToolCall {
  id: string;
  name: string;
  arguments: string;
}

/** The richer message shape the agent loop exchanges (tool calls + tool results, not just text). */
export type AiAgentMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: AiToolCall[] }
  | { role: "tool"; toolCallId: string; toolName: string; content: string; isError?: boolean };

/** Full payload for a single streamed agent turn (the API key is added by the main process). */
export interface AiAgentChatPayload {
  profileName: string;
  providerId: AiProviderId;
  config: AiRequestConfig;
  messages: AiAgentMessage[];
  system?: string;
  tools?: AiToolDefinition[];
  temperature?: number;
  maxTokens?: number;
}

/** Result of one completed agent turn (after the stream is fully assembled). */
export type AiAgentChatResult =
  | {
      ok: true;
      text: string;
      toolCalls: AiToolCall[];
      model: string;
      finishReason?: string;
      usage?: AiChatUsage;
    }
  | { ok: false; status?: number; error: string };

/** A normalized streaming delta forwarded from the main process during an agent turn. */
export type AiChatStreamEvent =
  | { type: "text"; text: string }
  | { type: "tool_call_delta"; index: number; id?: string; name?: string; argsFragment?: string }
  | { type: "result"; result: AiAgentChatResult }
  | { type: "error"; status?: number; error: string };

/** Non-secret, persisted per-provider configuration (see settings.ts for defaults/sanitization). */
export interface AiProviderConfig {
  enabled: boolean;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  azureResourceUrl: string;
  azureDeployment: string;
  azureApiVersion: string;
}

export interface AiSettings {
  defaultProviderId: AiProviderId | "";
  providers: Record<AiProviderId, AiProviderConfig>;
}

export interface AiProviderMeta {
  id: AiProviderId;
  label: string;
  /** Which wire format the provider speaks; mirrors the branching in `electron/aiProviders.cjs`. */
  kind: "openai-compatible" | "anthropic";
  /** Default base URL for providers that use one (empty for Azure, which uses a resource endpoint). */
  defaultBaseUrl: string;
  defaultModel: string;
  suggestedModels: string[];
  /** True when the provider exposes an editable base URL (OpenAI/DeepSeek/Anthropic). */
  usesBaseUrl: boolean;
  /** True when the provider needs the Azure resource/deployment/api-version fields instead. */
  usesAzureFields: boolean;
  /** False for local runtimes (Ollama, LM Studio) that accept requests with no API key. */
  requiresApiKey: boolean;
  keyPlaceholder: string;
}

export const DEFAULT_AI_TEMPERATURE = 0.7;
export const DEFAULT_AI_MAX_TOKENS = 1024;
export const DEFAULT_AZURE_API_VERSION = "2024-10-21";
export const AI_TEMPERATURE_MIN = 0;
export const AI_TEMPERATURE_MAX = 2;
export const AI_MAX_TOKENS_MIN = 1;
export const AI_MAX_TOKENS_MAX = 32000;

export const AI_PROVIDERS: Record<AiProviderId, AiProviderMeta> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    kind: "openai-compatible",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    suggestedModels: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "o4-mini"],
    usesBaseUrl: true,
    usesAzureFields: false,
    requiresApiKey: true,
    keyPlaceholder: "sk-…"
  },
  "azure-openai": {
    id: "azure-openai",
    label: "Azure OpenAI",
    kind: "openai-compatible",
    defaultBaseUrl: "",
    defaultModel: "",
    suggestedModels: [],
    usesBaseUrl: false,
    usesAzureFields: true,
    requiresApiKey: true,
    keyPlaceholder: "Azure API key"
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    kind: "openai-compatible",
    defaultBaseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-v4-flash",
    suggestedModels: ["deepseek-v4-flash", "deepseek-v4-pro"],
    usesBaseUrl: true,
    usesAzureFields: false,
    requiresApiKey: true,
    keyPlaceholder: "sk-…"
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    kind: "anthropic",
    defaultBaseUrl: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-4-6",
    suggestedModels: ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
    usesBaseUrl: true,
    usesAzureFields: false,
    requiresApiKey: true,
    keyPlaceholder: "sk-ant-…"
  },
  // Local runtimes that expose an OpenAI-compatible API on loopback. They need no API key, so the
  // key field is optional and the adapter omits the Authorization header when none is set. Each just
  // defaults the base URL to its server's port; the model is whatever the user has pulled/loaded.
  ollama: {
    id: "ollama",
    label: "Ollama (local)",
    kind: "openai-compatible",
    defaultBaseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.1",
    suggestedModels: ["llama3.1", "llama3.2", "qwen2.5", "mistral", "gemma2", "phi4"],
    usesBaseUrl: true,
    usesAzureFields: false,
    requiresApiKey: false,
    keyPlaceholder: "Not required for local servers"
  },
  "lm-studio": {
    id: "lm-studio",
    label: "LM Studio (local)",
    kind: "openai-compatible",
    defaultBaseUrl: "http://localhost:1234/v1",
    defaultModel: "",
    suggestedModels: [],
    usesBaseUrl: true,
    usesAzureFields: false,
    requiresApiKey: false,
    keyPlaceholder: "Not required for local servers"
  }
};

export const AI_PROVIDER_LIST: readonly AiProviderMeta[] = AI_PROVIDER_IDS.map(
  (id) => AI_PROVIDERS[id]
);

export function isAiProviderId(value: unknown): value is AiProviderId {
  return typeof value === "string" && (AI_PROVIDER_IDS as readonly string[]).includes(value);
}

/**
 * Build the non-secret per-request config the main process needs from a provider's stored config.
 * Drops the persistence-only fields (enabled, temperature, maxTokens) that travel as separate
 * request parameters.
 */
export function toAiRequestConfig(config: AiProviderConfig): AiRequestConfig {
  return {
    baseUrl: config.baseUrl,
    model: config.model,
    azureResourceUrl: config.azureResourceUrl,
    azureDeployment: config.azureDeployment,
    azureApiVersion: config.azureApiVersion
  };
}
