// Renderer-side model for the AI abstraction layer: the provider identifiers, the wire types shared
// across the IPC boundary, and per-provider UI metadata (labels, defaults, suggested models, which
// extra fields each provider needs). The actual request construction/parsing lives in the pure
// main-process adapter `electron/aiProviders.cjs`; this file is what the setup dialog and settings
// persistence build on. Model names are kept as free-text fields seeded by `suggestedModels`, so the
// suggestions can drift without the configured value ever becoming invalid.

export type AiProviderId = "openai" | "azure-openai" | "deepseek" | "anthropic";

export const AI_PROVIDER_IDS: readonly AiProviderId[] = [
  "openai",
  "azure-openai",
  "deepseek",
  "anthropic"
];

export type AiMessageRole = "system" | "user" | "assistant";

export interface AiMessage {
  role: AiMessageRole;
  content: string;
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
    keyPlaceholder: "sk-ant-…"
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
