// Renderer wrapper around the main-process streaming bridge. `ipcMain.handle` can't stream, so a
// single agent turn is driven over an event channel: we generate a requestId, subscribe to
// `ai:chat-stream-event` filtered to it, forward text/tool-call deltas to callbacks, and resolve
// once the `result` (or `error`) event lands. On abort we *immediately* unsubscribe (so any late
// events are dropped and no more tokens render) and tell the main process to cancel the in-flight
// fetch — the UI never waits for the backend to confirm teardown.

import type {
  AiAgentChatPayload,
  AiAgentChatResult,
  AiProviderToolActivity,
  AiToolCall
} from "./providers";

export type RunAiChatStreamParams = {
  payload: AiAgentChatPayload;
  signal?: AbortSignal;
  /** Called for each streamed text fragment of the assistant's reply. */
  onTextDelta?: (text: string) => void;
  /** Called with the tool calls assembled so far (for showing "calling tool…" before the result). */
  onToolCallUpdate?: (toolCalls: AiToolCall[]) => void;
  /** OpenCode executes these tools itself; callers display the lifecycle without invoking MCP. */
  onProviderToolUpdate?: (activity: AiProviderToolActivity) => void;
};

let streamCounter = 0;

function nextRequestId(): string {
  streamCounter += 1;
  const cryptoApi =
    typeof globalThis !== "undefined" ? (globalThis as { crypto?: Crypto }).crypto : undefined;
  const unique = cryptoApi?.randomUUID
    ? cryptoApi.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `ai-chat-${unique}-${streamCounter}`;
}

/**
 * Run one streamed agent turn and resolve with the assembled result. Never rejects: a transport
 * failure resolves as `{ ok: false, error }`, and an abort resolves as `{ ok: false, error: "Stopped." }`
 * (callers check `signal.aborted` to tell a user stop from a real error).
 */
export function runAiChatStream(params: RunAiChatStreamParams): Promise<AiAgentChatResult> {
  const { payload, signal, onTextDelta, onToolCallUpdate, onProviderToolUpdate } = params;

  const nexus = typeof window !== "undefined" ? window.nexus : undefined;
  if (!nexus?.startAiChatStream) {
    return Promise.resolve({ ok: false, error: "AI chat is only available in the desktop app." });
  }
  if (signal?.aborted) {
    return Promise.resolve({ ok: false, error: "Stopped." });
  }

  const requestId = nextRequestId();
  const toolCallsByIndex: AiToolCall[] = [];

  return new Promise<AiAgentChatResult>((resolve) => {
    let settled = false;
    let unsubscribe: (() => void) | null = null;
    let onAbort: (() => void) | null = null;

    const cleanup = () => {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      if (onAbort && signal) {
        signal.removeEventListener("abort", onAbort);
        onAbort = null;
      }
    };

    const settle = (result: AiAgentChatResult) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(result);
    };

    onAbort = () => {
      // Synchronous teardown: stop listening first (drops any in-flight/late events), then ask the
      // main process to abort the fetch. We resolve right away rather than awaiting confirmation.
      cleanup();
      nexus.abortAiChatStream(requestId);
      settle({ ok: false, error: "Stopped." });
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    unsubscribe = nexus.onAiChatStreamEvent(({ requestId: id, event }) => {
      if (id !== requestId || settled) {
        return;
      }
      switch (event.type) {
        case "text":
          onTextDelta?.(event.text);
          break;
        case "tool_call_delta": {
          const index = typeof event.index === "number" ? event.index : 0;
          let slot = toolCallsByIndex[index];
          if (!slot) {
            slot = { id: "", name: "", arguments: "" };
            toolCallsByIndex[index] = slot;
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
          onToolCallUpdate?.(toolCallsByIndex.filter((call): call is AiToolCall => Boolean(call)));
          break;
        }
        case "provider_tool":
          onProviderToolUpdate?.(event);
          break;
        case "result":
          settle(event.result);
          break;
        case "error":
          settle({ ok: false, status: event.status, error: event.error });
          break;
        default:
          break;
      }
    });

    nexus.startAiChatStream(requestId, payload);
  });
}
