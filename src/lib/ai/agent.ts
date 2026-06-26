// The agentic tool-calling loop that powers the AI chat panel. It is deliberately UI- and
// transport-agnostic: the provider turn (`runChatStream`) and the tool executor (`runTool`) are
// injected, so the loop is pure orchestration and fully unit-testable. Each iteration streams one
// assistant turn; if that turn requested tools, the loop runs them, appends the results, and asks
// the model again — until the model answers with no tool calls, the step budget is exhausted, an
// error occurs, or the caller's AbortSignal fires. Every await is raced against the signal so Stop
// short-circuits at any phase (mid-stream, between steps, or while a tool is running).

import type { AiAgentChatResult, AiAgentMessage, AiToolCall } from "./providers";

export const DEFAULT_MAX_AGENT_STEPS = 8;

export type ToolOutcome = { content: string; isError: boolean };

export type ToolRunner = (call: { name: string; args: unknown }) => Promise<ToolOutcome>;

export type ChatStreamRunner = (params: {
  messages: AiAgentMessage[];
  signal?: AbortSignal;
  onTextDelta?: (text: string) => void;
  onToolCallUpdate?: (toolCalls: AiToolCall[]) => void;
}) => Promise<AiAgentChatResult>;

/** Events the loop emits so the panel can render progress incrementally. */
export type AgentEvent =
  | { type: "assistant-start" }
  | { type: "assistant-delta"; text: string }
  | { type: "assistant-message"; content: string; toolCalls: AiToolCall[] }
  | { type: "tool-start"; toolCall: AiToolCall }
  | { type: "tool-result"; toolCallId: string; toolName: string; content: string; isError: boolean }
  | { type: "error"; error: string }
  | { type: "stopped" }
  | { type: "done" };

export type RunAgentParams = {
  /** The full conversation so far, including the new user message at the end. */
  messages: AiAgentMessage[];
  runChatStream: ChatStreamRunner;
  runTool: ToolRunner;
  onEvent: (event: AgentEvent) => void;
  signal?: AbortSignal;
  maxSteps?: number;
};

const ABORTED = Symbol("aborted");

// A promise that resolves to ABORTED when the signal fires (and never otherwise). Created once per
// run and reused across races so we don't accumulate listeners per step.
function abortRace(signal: AbortSignal | undefined): Promise<typeof ABORTED> {
  return new Promise((resolve) => {
    if (!signal) {
      return;
    }
    if (signal.aborted) {
      resolve(ABORTED);
      return;
    }
    signal.addEventListener("abort", () => resolve(ABORTED), { once: true });
  });
}

function parseToolArguments(raw: string): unknown {
  if (!raw || !raw.trim()) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Drive the agent loop. Returns the final conversation (assistant + tool turns appended). Side
 * effects are surfaced through `onEvent`; the function itself never throws.
 */
export async function runAgent(params: RunAgentParams): Promise<AiAgentMessage[]> {
  const { runChatStream, runTool, onEvent, signal } = params;
  const maxSteps = params.maxSteps ?? DEFAULT_MAX_AGENT_STEPS;
  const messages: AiAgentMessage[] = [...params.messages];
  const aborted = abortRace(signal);

  const stop = (): AiAgentMessage[] => {
    onEvent({ type: "stopped" });
    return messages;
  };

  for (let step = 0; step < maxSteps; step += 1) {
    if (signal?.aborted) {
      return stop();
    }

    onEvent({ type: "assistant-start" });

    let result: AiAgentChatResult | typeof ABORTED;
    try {
      result = await Promise.race([
        runChatStream({
          messages,
          signal,
          onTextDelta: (text) => onEvent({ type: "assistant-delta", text })
        }),
        aborted
      ]);
    } catch (error) {
      if (signal?.aborted) {
        return stop();
      }
      onEvent({ type: "error", error: error instanceof Error ? error.message : String(error) });
      return messages;
    }

    if (result === ABORTED || signal?.aborted) {
      return stop();
    }

    if (!result.ok) {
      onEvent({ type: "error", error: result.error });
      return messages;
    }

    const toolCalls = Array.isArray(result.toolCalls) ? result.toolCalls : [];
    messages.push({
      role: "assistant",
      content: result.text ?? "",
      ...(toolCalls.length > 0 ? { toolCalls } : {})
    });
    onEvent({ type: "assistant-message", content: result.text ?? "", toolCalls });

    if (toolCalls.length === 0) {
      onEvent({ type: "done" });
      return messages;
    }

    for (const toolCall of toolCalls) {
      if (signal?.aborted) {
        return stop();
      }
      onEvent({ type: "tool-start", toolCall });

      let outcome: ToolOutcome | typeof ABORTED;
      try {
        outcome = await Promise.race([
          runTool({ name: toolCall.name, args: parseToolArguments(toolCall.arguments) }),
          aborted
        ]);
      } catch (error) {
        outcome = { content: error instanceof Error ? error.message : String(error), isError: true };
      }

      if (outcome === ABORTED || signal?.aborted) {
        return stop();
      }

      messages.push({
        role: "tool",
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        content: outcome.content,
        isError: outcome.isError
      });
      onEvent({
        type: "tool-result",
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        content: outcome.content,
        isError: outcome.isError
      });
    }
  }

  onEvent({ type: "error", error: `Stopped after ${maxSteps} tool-calling steps.` });
  return messages;
}
