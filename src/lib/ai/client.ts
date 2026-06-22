// Renderer-side entry point every AI feature calls. It picks the active provider from settings,
// builds the `ai:chat` payload (the API key is added by the main process from its encrypted store),
// and returns the unified `AiChatResult`. Keeping provider resolution and context truncation as pure
// functions here means features don't each re-derive "which provider, with what config".

import { AI_PROVIDER_IDS, toAiRequestConfig } from "./providers";
import type { AiChatResult, AiMessage, AiProviderId, AiSettings } from "./providers";

/** Default cap on characters of document/selection context sent in a single request, to bound tokens
 *  (and cost) when a feature passes a large document as context. */
export const DEFAULT_AI_CONTEXT_CHAR_LIMIT = 24000;

/**
 * Choose the provider a feature should use: the configured default if it is set and enabled,
 * otherwise the first enabled provider in catalog order, otherwise null (nothing configured).
 */
export function resolveActiveProvider(ai: AiSettings): AiProviderId | null {
  const preferred = ai.defaultProviderId;
  if (preferred && ai.providers[preferred]?.enabled) {
    return preferred;
  }
  for (const id of AI_PROVIDER_IDS) {
    if (ai.providers[id]?.enabled) {
      return id;
    }
  }
  return null;
}

/**
 * Trim oversized context to `maxChars`, keeping the head and tail (where the relevant material
 * usually sits) and marking the elided middle. Short text is returned unchanged.
 */
export function truncateForContext(text: string, maxChars = DEFAULT_AI_CONTEXT_CHAR_LIMIT): string {
  if (text.length <= maxChars) {
    return text;
  }
  const head = Math.floor(maxChars * 0.6);
  const tail = maxChars - head;
  return `${text.slice(0, head)}\n\n…[content truncated]…\n\n${text.slice(text.length - tail)}`;
}

export type RunAiChatParams = {
  ai: AiSettings;
  profileName: string;
  /** Override the active provider (e.g. the Ask-AI panel's own provider picker). */
  providerId?: AiProviderId;
  system?: string;
  messages: AiMessage[];
  temperature?: number;
  maxTokens?: number;
};

/**
 * Resolve the provider, build the payload, and run a chat completion via the main process. Returns a
 * typed failure (rather than throwing) when no provider is configured or the desktop bridge is
 * unavailable, so callers handle every outcome through the same `AiChatResult` shape.
 */
export async function runAiChat(params: RunAiChatParams): Promise<AiChatResult> {
  const providerId = params.providerId ?? resolveActiveProvider(params.ai);
  if (!providerId) {
    return {
      ok: false,
      error: "No AI provider is configured. Open the AI menu → AI Providers… to set one up."
    };
  }

  const config = params.ai.providers[providerId];
  if (!config) {
    return { ok: false, error: "The selected AI provider is not configured." };
  }

  if (typeof window === "undefined" || !window.nexus?.aiChat) {
    return { ok: false, error: "AI requests are only available in the desktop app." };
  }

  return window.nexus.aiChat({
    profileName: params.profileName,
    providerId,
    config: toAiRequestConfig(config),
    messages: params.messages,
    system: params.system,
    temperature: params.temperature ?? config.temperature,
    maxTokens: params.maxTokens ?? config.maxTokens
  });
}
