import { describe, expect, it, vi } from "vitest";
import { runAgent, type AgentEvent, type ChatStreamRunner, type ToolRunner } from "./agent";
import type { AiAgentChatResult, AiToolCall } from "./providers";

type FakeTurn = {
  text?: string;
  deltas?: string[];
  toolCalls?: AiToolCall[];
};

// A ChatStreamRunner that replays a queue of canned turns, emitting any `deltas` through onTextDelta
// first (so we can assert live streaming) and then resolving the assembled turn.
function fakeStream(turns: FakeTurn[]): ChatStreamRunner {
  let index = 0;
  return async ({ onTextDelta }) => {
    const turn = turns[index] ?? { text: "" };
    index += 1;
    for (const delta of turn.deltas ?? []) {
      onTextDelta?.(delta);
    }
    const result: AiAgentChatResult = {
      ok: true,
      text: turn.text ?? (turn.deltas ?? []).join(""),
      toolCalls: turn.toolCalls ?? [],
      model: "fake"
    };
    return result;
  };
}

const noTool: ToolRunner = async () => ({ content: "", isError: false });

function collect() {
  const events: AgentEvent[] = [];
  return { events, onEvent: (event: AgentEvent) => events.push(event) };
}

describe("runAgent", () => {
  it("forwards provider-owned tool activity without executing a Nexus tool", async () => {
    const { events, onEvent } = collect();
    const runTool = vi.fn<ToolRunner>(noTool);
    const runChatStream: ChatStreamRunner = async ({ onProviderToolUpdate }) => {
      onProviderToolUpdate?.({
        type: "provider_tool",
        id: "oc1",
        name: "bash",
        status: "running",
        input: '{"command":"pwd"}'
      });
      return { ok: true, text: "Done", toolCalls: [], model: "opencode-model" };
    };

    await runAgent({
      messages: [{ role: "user", content: "Run it" }],
      runChatStream,
      runTool,
      onEvent
    });

    expect(runTool).not.toHaveBeenCalled();
    expect(events.some((event) => event.type === "provider-tool")).toBe(true);
  });

  it("streams a single text answer and finishes", async () => {
    const { events, onEvent } = collect();
    const messages = await runAgent({
      messages: [{ role: "user", content: "Hi" }],
      runChatStream: fakeStream([{ deltas: ["Hel", "lo"] }]),
      runTool: noTool,
      onEvent
    });

    const types = events.map((event) => event.type);
    expect(types).toEqual(["assistant-start", "assistant-delta", "assistant-delta", "assistant-message", "done"]);
    expect(messages.at(-1)).toEqual({ role: "assistant", content: "Hello" });
  });

  it("runs a tool call, feeds the result back, then answers", async () => {
    const { events, onEvent } = collect();
    const runTool = vi.fn<ToolRunner>(async () => ({ content: '{"headings":["A"]}', isError: false }));

    const messages = await runAgent({
      messages: [{ role: "user", content: "Outline?" }],
      runChatStream: fakeStream([
        { text: "", toolCalls: [{ id: "c1", name: "nexus_get_outline", arguments: '{"windowId":"w1"}' }] },
        { text: "It has one heading: A." }
      ]),
      runTool,
      onEvent
    });

    expect(runTool).toHaveBeenCalledWith({ name: "nexus_get_outline", args: { windowId: "w1" } });
    expect(events.map((event) => event.type)).toEqual([
      "assistant-start",
      "assistant-message",
      "tool-start",
      "tool-result",
      "assistant-start",
      "assistant-message",
      "done"
    ]);
    // The conversation carries the assistant tool-call turn, the tool result, and the final answer.
    expect(messages).toEqual([
      { role: "user", content: "Outline?" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "c1", name: "nexus_get_outline", arguments: '{"windowId":"w1"}' }]
      },
      {
        role: "tool",
        toolCallId: "c1",
        toolName: "nexus_get_outline",
        content: '{"headings":["A"]}',
        isError: false
      },
      { role: "assistant", content: "It has one heading: A." }
    ]);
  });

  it("executes multiple tool calls in one turn", async () => {
    const { events, onEvent } = collect();
    const runTool = vi.fn<ToolRunner>(async ({ name }) => ({ content: `ran ${name}`, isError: false }));

    await runAgent({
      messages: [{ role: "user", content: "Compare" }],
      runChatStream: fakeStream([
        {
          toolCalls: [
            { id: "a", name: "nexus_get_section", arguments: '{"index":0}' },
            { id: "b", name: "nexus_get_section", arguments: '{"index":1}' }
          ]
        },
        { text: "Done." }
      ]),
      runTool,
      onEvent
    });

    expect(runTool).toHaveBeenCalledTimes(2);
    expect(events.filter((event) => event.type === "tool-result")).toHaveLength(2);
  });

  it("propagates a tool error as an isError tool message and keeps going", async () => {
    const { events, onEvent } = collect();
    const runTool: ToolRunner = async () => {
      throw new Error("tool blew up");
    };

    const messages = await runAgent({
      messages: [{ role: "user", content: "Edit" }],
      runChatStream: fakeStream([
        { toolCalls: [{ id: "c1", name: "nexus_apply_edits", arguments: "{}" }] },
        { text: "I could not apply that." }
      ]),
      runTool,
      onEvent
    });

    const toolMessage = messages.find((message) => message.role === "tool");
    expect(toolMessage).toMatchObject({ isError: true, content: "tool blew up" });
    const toolResultEvent = events.find((event) => event.type === "tool-result");
    expect(toolResultEvent).toMatchObject({ isError: true });
    expect(events.at(-1)?.type).toBe("done");
  });

  it("stops after the step budget when the model never stops calling tools", async () => {
    const { events, onEvent } = collect();
    const alwaysCalls: ChatStreamRunner = async () => ({
      ok: true,
      text: "",
      toolCalls: [{ id: "loop", name: "nexus_find", arguments: '{"query":"x"}' }],
      model: "fake"
    });

    await runAgent({
      messages: [{ role: "user", content: "loop" }],
      runChatStream: alwaysCalls,
      runTool: async () => ({ content: "match", isError: false }),
      onEvent,
      maxSteps: 3
    });

    const error = events.find((event) => event.type === "error");
    expect(error).toMatchObject({ error: "Stopped after 3 tool-calling steps." });
  });

  it("surfaces a provider error", async () => {
    const { events, onEvent } = collect();
    const failing: ChatStreamRunner = async () => ({ ok: false, error: "bad key" });

    await runAgent({
      messages: [{ role: "user", content: "Hi" }],
      runChatStream: failing,
      runTool: noTool,
      onEvent
    });

    expect(events.find((event) => event.type === "error")).toMatchObject({ error: "bad key" });
  });

  it("stops immediately when aborted mid-stream (no error event)", async () => {
    const { events, onEvent } = collect();
    const controller = new AbortController();
    const abortingStream: ChatStreamRunner = async () => {
      controller.abort();
      return { ok: false, error: "Stopped." };
    };

    await runAgent({
      messages: [{ role: "user", content: "Hi" }],
      runChatStream: abortingStream,
      runTool: noTool,
      onEvent,
      signal: controller.signal
    });

    const types = events.map((event) => event.type);
    expect(types).toContain("stopped");
    expect(types).not.toContain("error");
    expect(types).not.toContain("done");
  });

  it("stops immediately when aborted while a tool is running", async () => {
    const { events, onEvent } = collect();
    const controller = new AbortController();
    const runTool: ToolRunner = async () => {
      controller.abort();
      return { content: "late", isError: false };
    };

    const messages = await runAgent({
      messages: [{ role: "user", content: "Edit" }],
      runChatStream: fakeStream([
        { toolCalls: [{ id: "c1", name: "nexus_apply_edits", arguments: "{}" }] },
        { text: "should never run" }
      ]),
      runTool,
      onEvent,
      signal: controller.signal
    });

    expect(events.map((event) => event.type)).toContain("stopped");
    // The aborted tool result is not appended, and the second turn never happens.
    expect(messages.some((message) => message.role === "tool")).toBe(false);
    expect(events.some((event) => event.type === "done")).toBe(false);
  });
});
