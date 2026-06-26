import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Hammer,
  Loader2,
  Send,
  Sparkles,
  Square,
  TextQuote,
  Trash2,
  X
} from "lucide-react";
import { runAgent, type AgentEvent, type ChatStreamRunner, type ToolRunner } from "../../lib/ai/agent";
import { runAiChatStream } from "../../lib/ai/streamClient";
import { renderChatMarkdown } from "../../lib/ai/markdownToHtml";
import { buildChatSystemPrompt } from "../../lib/ai/prompts";
import { resolveActiveProvider } from "../../lib/ai/client";
import { AI_PROVIDERS, toAiRequestConfig } from "../../lib/ai/providers";
import type { AiAgentMessage, AiSettings, AiToolDefinition } from "../../lib/ai/providers";
import { AI_CHAT_WIDTH_MAX_PIXELS, AI_CHAT_WIDTH_MIN_PIXELS } from "../../lib/settings";

type EditorSelection = { text: string; mode: string };

type AiChatPanelProps = {
  ai: AiSettings;
  profileName: string;
  windowId: string;
  fileName: string | null;
  width: number;
  /** Reads the editor's current (or last-before-blur) selection so the chat can attach it. */
  getEditorSelection: () => EditorSelection | null;
  onResize: (width: number) => void;
  onClose: () => void;
  onOpenAiSettings: () => void;
};

type ToolStatus = "running" | "done" | "error";

type ChatItem =
  | { kind: "user"; id: string; text: string; hasSelection?: boolean }
  | { kind: "assistant"; id: string; text: string; streaming: boolean; stopped: boolean }
  | { kind: "tool"; id: string; toolCallId: string; name: string; args: string; status: ToolStatus; result: string }
  | { kind: "error"; id: string; text: string };

const AI_CHAT_WIDTH_KEYBOARD_STEP_PIXELS = 16;

function clampWidth(width: number) {
  return Math.round(Math.min(AI_CHAT_WIDTH_MAX_PIXELS, Math.max(AI_CHAT_WIDTH_MIN_PIXELS, width)));
}

function prettyArgs(raw: string): string {
  if (!raw || !raw.trim()) {
    return "{}";
  }
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function selectionPreview(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > 90 ? `${oneLine.slice(0, 90)}…` : oneLine;
}

function AiChatPanel({
  ai,
  profileName,
  windowId,
  fileName,
  width,
  getEditorSelection,
  onResize,
  onClose,
  onOpenAiSettings
}: AiChatPanelProps) {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  // The editor selection to attach to the next message (captured when the composer is focused), or
  // null when nothing is attached. `dismissedSelectionRef` remembers a selection the user explicitly
  // removed so re-focusing the composer doesn't keep re-attaching the same text.
  const [attachedSelection, setAttachedSelection] = useState<EditorSelection | null>(null);
  const dismissedSelectionRef = useRef<string | null>(null);

  const panelRef = useRef<HTMLElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // The canonical conversation fed back to the model on each turn (system is added per request).
  const conversationRef = useRef<AiAgentMessage[]>([]);
  // The id of the assistant bubble currently being streamed (null between turns).
  const currentAssistantIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const toolsRef = useRef<AiToolDefinition[] | null>(null);
  const idCounterRef = useRef(0);

  const providerId = useMemo(() => resolveActiveProvider(ai), [ai]);
  const providerConfig = providerId ? ai.providers[providerId] : null;
  const providerMeta = providerId ? AI_PROVIDERS[providerId] : null;

  const nextId = useCallback(() => {
    idCounterRef.current += 1;
    return `item-${idCounterRef.current}`;
  }, []);

  // Abort any in-flight stream if the panel unmounts.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Keep the transcript pinned to the newest content as it streams in.
  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) {
      transcript.scrollTop = transcript.scrollHeight;
    }
  }, [items]);

  const handleAgentEvent = useCallback(
    (event: AgentEvent) => {
      switch (event.type) {
        case "assistant-start": {
          const id = nextId();
          currentAssistantIdRef.current = id;
          setItems((prev) => [...prev, { kind: "assistant", id, text: "", streaming: true, stopped: false }]);
          break;
        }
        case "assistant-delta": {
          const id = currentAssistantIdRef.current;
          setItems((prev) =>
            prev.map((item) =>
              item.id === id && item.kind === "assistant"
                ? { ...item, text: item.text + event.text }
                : item
            )
          );
          break;
        }
        case "assistant-message": {
          const id = currentAssistantIdRef.current;
          currentAssistantIdRef.current = null;
          setItems((prev) =>
            prev.flatMap((item) => {
              if (item.id !== id || item.kind !== "assistant") {
                return [item];
              }
              // A tool-only turn (no prose) leaves nothing worth showing as a bubble.
              if (!event.content) {
                return [];
              }
              return [{ ...item, text: event.content, streaming: false }];
            })
          );
          break;
        }
        case "tool-start": {
          setItems((prev) => [
            ...prev,
            {
              kind: "tool",
              id: nextId(),
              toolCallId: event.toolCall.id,
              name: event.toolCall.name,
              args: event.toolCall.arguments,
              status: "running",
              result: ""
            }
          ]);
          break;
        }
        case "tool-result": {
          setItems((prev) =>
            prev.map((item) =>
              item.kind === "tool" && item.toolCallId === event.toolCallId
                ? { ...item, status: event.isError ? "error" : "done", result: event.content }
                : item
            )
          );
          break;
        }
        case "error": {
          const id = currentAssistantIdRef.current;
          currentAssistantIdRef.current = null;
          setItems((prev) => {
            const cleaned = prev.flatMap((item) =>
              item.id === id && item.kind === "assistant"
                ? item.text
                  ? [{ ...item, streaming: false }]
                  : []
                : [item]
            );
            return [...cleaned, { kind: "error", id: nextId(), text: event.error }];
          });
          break;
        }
        case "stopped": {
          const id = currentAssistantIdRef.current;
          currentAssistantIdRef.current = null;
          setItems((prev) =>
            prev.flatMap((item) =>
              item.id === id && item.kind === "assistant"
                ? item.text
                  ? [{ ...item, streaming: false, stopped: true }]
                  : []
                : [item]
            )
          );
          break;
        }
        default:
          break;
      }
    },
    [nextId]
  );

  const ensureTools = useCallback(async (): Promise<AiToolDefinition[]> => {
    if (toolsRef.current) {
      return toolsRef.current;
    }
    const tools = (await window.nexus?.listMcpTools()) ?? [];
    toolsRef.current = tools;
    return tools;
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming || !providerId || !providerConfig) {
      return;
    }

    setInput("");
    // Attach the editor selection (if any) to this turn: it goes to the model as context, while the
    // visible bubble shows just the typed text plus a small "selection" tag.
    const selection = attachedSelection;
    setAttachedSelection(null);
    dismissedSelectionRef.current = null;
    setItems((prev) => [
      ...prev,
      { kind: "user", id: nextId(), text, hasSelection: Boolean(selection) }
    ]);
    const userContent = selection
      ? `The user has selected the following text in the editor (${selection.mode} mode); treat it ` +
        `as the text they are referring to:\n\n"""\n${selection.text}\n"""\n\n${text}`
      : text;
    conversationRef.current = [...conversationRef.current, { role: "user", content: userContent }];

    const controller = new AbortController();
    abortRef.current = controller;
    setIsStreaming(true);

    try {
      const tools = await ensureTools();
      const config = toAiRequestConfig(providerConfig);
      const system = buildChatSystemPrompt({ fileName });

      const runChatStream: ChatStreamRunner = ({ messages, signal, onTextDelta }) =>
        runAiChatStream({
          payload: {
            profileName,
            providerId,
            config,
            system,
            tools,
            messages,
            temperature: providerConfig.temperature,
            maxTokens: providerConfig.maxTokens
          },
          signal,
          onTextDelta
        });

      const runTool: ToolRunner = async ({ name, args }) => {
        // Pin every tool call to THIS panel's window so the chat is scoped to its own document,
        // regardless of which window is focused when the call runs. We override any windowId the
        // model supplied — the chat must never read or edit another window's document.
        const baseArgs =
          args && typeof args === "object" && !Array.isArray(args)
            ? (args as Record<string, unknown>)
            : {};
        const result = await window.nexus?.callMcpTool({
          name,
          args: { ...baseArgs, windowId }
        });
        const content = (result?.content ?? [])
          .map((block) => (typeof block.text === "string" ? block.text : ""))
          .join("\n")
          .trim();
        const isError = Boolean(result?.isError);
        return {
          content: content || (isError ? "The tool reported an error." : "(no output)"),
          isError
        };
      };

      conversationRef.current = await runAgent({
        messages: conversationRef.current,
        runChatStream,
        runTool,
        onEvent: handleAgentEvent,
        signal: controller.signal
      });
    } catch (error) {
      handleAgentEvent({ type: "error", error: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [
    attachedSelection,
    ensureTools,
    fileName,
    handleAgentEvent,
    input,
    isStreaming,
    nextId,
    profileName,
    providerConfig,
    providerId,
    windowId
  ]);

  // When the composer takes focus, attach whatever the user had selected in the editor before they
  // clicked into the chat — unless they previously dismissed that exact selection.
  const handleComposerFocus = useCallback(() => {
    const selection = getEditorSelection();
    if (!selection || dismissedSelectionRef.current === selection.text) {
      return;
    }
    setAttachedSelection(selection);
  }, [getEditorSelection]);

  const handleDetachSelection = useCallback(() => {
    setAttachedSelection((current) => {
      if (current) {
        dismissedSelectionRef.current = current.text;
      }
      return null;
    });
  }, []);

  const handleStop = useCallback(() => {
    // Synchronous: re-enable the composer now; the abort tears down the stream and the loop emits a
    // "stopped" event that finalizes the partial bubble.
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const handleClear = useCallback(() => {
    abortRef.current?.abort();
    conversationRef.current = [];
    currentAssistantIdRef.current = null;
    setItems([]);
  }, []);

  const handleResizePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    const panel = panelRef.current;
    if (!panel) {
      return;
    }
    event.preventDefault();
    const rightEdge = panel.getBoundingClientRect().right;
    let latest = width;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      latest = clampWidth(rightEdge - moveEvent.clientX);
      panel.style.width = `${latest}px`;
    };
    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      document.body.classList.remove("nexus-resizing-col");
      onResize(latest);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    document.body.classList.add("nexus-resizing-col");
  };

  const handleResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    const delta =
      event.key === "ArrowRight"
        ? -AI_CHAT_WIDTH_KEYBOARD_STEP_PIXELS
        : AI_CHAT_WIDTH_KEYBOARD_STEP_PIXELS;
    onResize(clampWidth(width + delta));
  };

  const handleTextareaKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  return (
    <aside ref={panelRef} className="nexus-ai-chat" style={{ width: `${width}px` }} aria-label="AI chat">
      <div
        className="nexus-ai-chat-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize AI chat panel"
        aria-valuemin={AI_CHAT_WIDTH_MIN_PIXELS}
        aria-valuemax={AI_CHAT_WIDTH_MAX_PIXELS}
        aria-valuenow={Math.round(width)}
        tabIndex={0}
        onPointerDown={handleResizePointerDown}
        onKeyDown={handleResizeKeyDown}
      />
      <header className="nexus-ai-chat-header">
        <Sparkles aria-hidden="true" className="nexus-ai-chat-header-icon" />
        <div className="nexus-ai-chat-header-titles">
          <span className="nexus-ai-chat-title">AI Chat</span>
          {providerMeta ? (
            <span className="nexus-ai-chat-subtitle">
              {providerMeta.label}
              {providerConfig?.model ? ` · ${providerConfig.model}` : ""}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className="nexus-ai-chat-header-button"
          onClick={handleClear}
          disabled={items.length === 0 && !isStreaming}
          title="Clear conversation"
        >
          <Trash2 aria-hidden="true" />
          <span className="nexus-sr-only">Clear conversation</span>
        </button>
        <button
          type="button"
          className="nexus-ai-chat-header-button"
          onClick={onClose}
          title="Close AI chat"
        >
          <X aria-hidden="true" />
          <span className="nexus-sr-only">Close AI chat</span>
        </button>
      </header>

      {!providerId ? (
        <div className="nexus-ai-chat-empty">
          <Sparkles aria-hidden="true" className="nexus-ai-chat-empty-icon" />
          <p className="nexus-ai-chat-empty-text">
            No AI provider is configured yet. Set one up to chat about and edit your document.
          </p>
          <button type="button" className="nexus-ai-chat-empty-button" onClick={onOpenAiSettings}>
            Open AI Providers…
          </button>
        </div>
      ) : (
        <>
          <div className="nexus-ai-chat-transcript" ref={transcriptRef}>
            {items.length === 0 ? (
              <p className="nexus-ai-chat-placeholder">
                Ask about your document, or ask for an edit. Changes are shown for your approval
                before they are applied.
              </p>
            ) : (
              items.map((item) => {
                if (item.kind === "user") {
                  return (
                    <div key={item.id} className="nexus-ai-chat-msg nexus-ai-chat-msg-user">
                      {item.hasSelection ? (
                        <span className="nexus-ai-chat-msg-selection-tag">
                          <TextQuote aria-hidden="true" /> selection
                        </span>
                      ) : null}
                      {item.text}
                    </div>
                  );
                }
                if (item.kind === "assistant") {
                  return (
                    <div key={item.id} className="nexus-ai-chat-msg nexus-ai-chat-msg-assistant">
                      <div
                        className="nexus-ai-chat-markdown"
                        dangerouslySetInnerHTML={{ __html: renderChatMarkdown(item.text) }}
                      />
                      {item.streaming ? <span className="nexus-ai-chat-caret" aria-hidden="true" /> : null}
                      {item.stopped ? <span className="nexus-ai-chat-stopped">Stopped</span> : null}
                    </div>
                  );
                }
                if (item.kind === "tool") {
                  return (
                    <details key={item.id} className={`nexus-ai-chat-tool nexus-ai-chat-tool-${item.status}`}>
                      <summary className="nexus-ai-chat-tool-summary">
                        {item.status === "running" ? (
                          <Loader2 aria-hidden="true" className="nexus-ai-chat-tool-spinner" />
                        ) : (
                          <Hammer aria-hidden="true" className="nexus-ai-chat-tool-icon" />
                        )}
                        <span className="nexus-ai-chat-tool-name">{item.name}</span>
                        <span className="nexus-ai-chat-tool-status">
                          {item.status === "running"
                            ? "running…"
                            : item.status === "error"
                              ? "error"
                              : "done"}
                        </span>
                      </summary>
                      <div className="nexus-ai-chat-tool-body">
                        <span className="nexus-ai-chat-tool-label">Arguments</span>
                        <pre className="nexus-ai-chat-tool-pre">{prettyArgs(item.args)}</pre>
                        {item.result ? (
                          <>
                            <span className="nexus-ai-chat-tool-label">Result</span>
                            <pre className="nexus-ai-chat-tool-pre">{item.result}</pre>
                          </>
                        ) : null}
                      </div>
                    </details>
                  );
                }
                return (
                  <div key={item.id} className="nexus-ai-chat-msg nexus-ai-chat-error">
                    <AlertTriangle aria-hidden="true" className="nexus-ai-chat-error-icon" />
                    <span>{item.text}</span>
                  </div>
                );
              })
            )}
          </div>

          <div className="nexus-ai-chat-composer">
            {attachedSelection ? (
              <div className="nexus-ai-chat-selection-chip">
                <TextQuote aria-hidden="true" className="nexus-ai-chat-selection-chip-icon" />
                <span className="nexus-ai-chat-selection-chip-text">
                  {selectionPreview(attachedSelection.text)}
                </span>
                <button
                  type="button"
                  className="nexus-ai-chat-selection-chip-remove"
                  onClick={handleDetachSelection}
                  title="Don't include the selection"
                >
                  <X aria-hidden="true" />
                  <span className="nexus-sr-only">Remove attached selection</span>
                </button>
              </div>
            ) : null}
            <div className="nexus-ai-chat-composer-row">
            <textarea
              ref={textareaRef}
              className="nexus-ai-chat-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleTextareaKeyDown}
              onFocus={handleComposerFocus}
              placeholder="Ask anything, or request an edit…"
              rows={2}
            />
            {isStreaming ? (
              <button
                type="button"
                className="nexus-ai-chat-send nexus-ai-chat-stop"
                onClick={handleStop}
                title="Stop"
              >
                <Square aria-hidden="true" />
                <span className="nexus-sr-only">Stop</span>
              </button>
            ) : (
              <button
                type="button"
                className="nexus-ai-chat-send"
                onClick={() => void handleSend()}
                disabled={!input.trim()}
                title="Send"
              >
                <Send aria-hidden="true" />
                <span className="nexus-sr-only">Send</span>
              </button>
            )}
            </div>
          </div>
        </>
      )}
    </aside>
  );
}

export default AiChatPanel;
