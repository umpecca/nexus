import { describe, expect, it } from "vitest";
// The agentic (tool-calling + streaming) half of the pure AI provider adapter. Lives under
// electron/ (outside the tsconfig "src" include) so it can require the raw CommonJS module.
import {
  buildAgentChatHttpRequest,
  parseAgentChatResult,
  createSseDecoder,
  getStreamEventParser,
  createStreamState,
  applyStreamEvent,
  finalizeStreamState,
  ANTHROPIC_VERSION,
  DEFAULT_MAX_TOKENS
} from "./aiProviders.cjs";

const tools = [
  {
    name: "nexus_get_outline",
    description: "Return the heading outline.",
    inputSchema: { type: "object", properties: { windowId: { type: "string" } } }
  }
];

// Drive a canned SSE byte stream (optionally split at arbitrary points) through the decoder +
// per-provider parser + reducer, returning the finalized result — exactly what the main-process
// bridge does, but in-process.
function runStream(providerId: string, chunks: string[]) {
  const decoder = createSseDecoder();
  const parse = getStreamEventParser(providerId);
  const state = createStreamState();
  for (const chunk of chunks) {
    for (const event of decoder.push(chunk)) {
      if (event.done || !event.json) {
        continue;
      }
      for (const normalized of parse(event.json)) {
        applyStreamEvent(state, normalized);
      }
    }
  }
  return finalizeStreamState(state);
}

describe("buildAgentChatHttpRequest — OpenAI-compatible", () => {
  it("streams, includes usage, and emits tools in function shape", () => {
    const request = buildAgentChatHttpRequest({
      providerId: "openai",
      config: { model: "gpt-4o-mini" },
      apiKey: "sk-test",
      messages: [{ role: "user", content: "Outline?" }],
      system: "You are embedded in Nexus.",
      tools,
      maxTokens: 512
    });

    expect(request.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(request.headers.Authorization).toBe("Bearer sk-test");
    expect(request.body.stream).toBe(true);
    expect(request.body.stream_options).toEqual({ include_usage: true });
    expect(request.body.messages[0]).toEqual({ role: "system", content: "You are embedded in Nexus." });
    expect(request.body.tools).toEqual([
      {
        type: "function",
        function: {
          name: "nexus_get_outline",
          description: "Return the heading outline.",
          parameters: { type: "object", properties: { windowId: { type: "string" } } }
        }
      }
    ]);
  });

  it("serializes assistant tool calls and tool results into OpenAI message roles", () => {
    const request = buildAgentChatHttpRequest({
      providerId: "openai",
      config: { model: "gpt-4o-mini" },
      apiKey: "sk-test",
      messages: [
        { role: "user", content: "Outline?" },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "call_1", name: "nexus_get_outline", arguments: '{"windowId":"w1"}' }]
        },
        { role: "tool", toolCallId: "call_1", toolName: "nexus_get_outline", content: '{"headings":[]}' }
      ],
      tools
    });

    const [, assistant, toolResult] = request.body.messages;
    expect(assistant).toEqual({
      role: "assistant",
      content: null,
      tool_calls: [
        { id: "call_1", type: "function", function: { name: "nexus_get_outline", arguments: '{"windowId":"w1"}' } }
      ]
    });
    expect(toolResult).toEqual({ role: "tool", tool_call_id: "call_1", content: '{"headings":[]}' });
  });

  it("uses the deployment path for Azure and omits model + adds tools", () => {
    const request = buildAgentChatHttpRequest({
      providerId: "azure-openai",
      config: {
        azureResourceUrl: "https://r.openai.azure.com",
        azureDeployment: "d1",
        azureApiVersion: "2024-10-21"
      },
      apiKey: "az-test",
      messages: [{ role: "user", content: "Hi" }],
      tools
    });

    expect(request.url).toBe(
      "https://r.openai.azure.com/openai/deployments/d1/chat/completions?api-version=2024-10-21"
    );
    expect(request.headers["api-key"]).toBe("az-test");
    expect(request.body.model).toBeUndefined();
    expect(request.body.stream).toBe(true);
    expect(request.body.tools).toHaveLength(1);
  });

  it("targets the Ollama loopback base URL, streams, and omits Authorization when no key is set", () => {
    const request = buildAgentChatHttpRequest({
      providerId: "ollama",
      config: { model: "llama3.1" },
      apiKey: "",
      messages: [{ role: "user", content: "Outline?" }],
      tools
    });

    expect(request.url).toBe("http://localhost:11434/v1/chat/completions");
    expect(request.headers.Authorization).toBeUndefined();
    expect(request.body.stream).toBe(true);
    expect(request.body.model).toBe("llama3.1");
    expect(request.body.tools[0].function.name).toBe("nexus_get_outline");
  });
});

describe("buildAgentChatHttpRequest — Anthropic", () => {
  it("streams to /v1/messages, hoists system, and emits input_schema tools", () => {
    const request = buildAgentChatHttpRequest({
      providerId: "anthropic",
      config: { model: "claude-sonnet-4-6" },
      apiKey: "ant-test",
      system: "Embedded.",
      messages: [{ role: "user", content: "Outline?" }],
      tools
    });

    expect(request.url).toBe("https://api.anthropic.com/v1/messages");
    expect(request.headers["x-api-key"]).toBe("ant-test");
    expect(request.headers["anthropic-version"]).toBe(ANTHROPIC_VERSION);
    expect(request.body.stream).toBe(true);
    expect(request.body.system).toBe("Embedded.");
    expect(request.body.max_tokens).toBe(DEFAULT_MAX_TOKENS);
    expect(request.body.tools).toEqual([
      {
        name: "nexus_get_outline",
        description: "Return the heading outline.",
        input_schema: { type: "object", properties: { windowId: { type: "string" } } }
      }
    ]);
  });

  it("builds tool_use blocks and merges consecutive tool results into one user turn", () => {
    const request = buildAgentChatHttpRequest({
      providerId: "anthropic",
      config: { model: "claude-sonnet-4-6" },
      apiKey: "ant-test",
      messages: [
        { role: "user", content: "Compare sections" },
        {
          role: "assistant",
          content: "Let me look.",
          toolCalls: [
            { id: "tu_1", name: "nexus_get_section", arguments: '{"index":0}' },
            { id: "tu_2", name: "nexus_get_section", arguments: '{"index":1}' }
          ]
        },
        { role: "tool", toolCallId: "tu_1", toolName: "nexus_get_section", content: "A" },
        { role: "tool", toolCallId: "tu_2", toolName: "nexus_get_section", content: "B", isError: false }
      ],
      tools
    });

    const conversation = request.body.messages;
    expect(conversation[1]).toEqual({
      role: "assistant",
      content: [
        { type: "text", text: "Let me look." },
        { type: "tool_use", id: "tu_1", name: "nexus_get_section", input: { index: 0 } },
        { type: "tool_use", id: "tu_2", name: "nexus_get_section", input: { index: 1 } }
      ]
    });
    // Both tool results collapse into a single trailing user turn.
    expect(conversation[2]).toEqual({
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "tu_1", content: "A" },
        { type: "tool_result", tool_use_id: "tu_2", content: "B" }
      ]
    });
    expect(conversation).toHaveLength(3);
  });
});

describe("streaming decode + parse + reduce — OpenAI", () => {
  it("assembles text and usage across chunks", () => {
    const result = runStream("openai", [
      'data: {"model":"gpt-4o-mini","choices":[{"delta":{"content":"Hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7}}\n\n',
      "data: [DONE]\n\n"
    ]);

    expect(result.text).toBe("Hello");
    expect(result.model).toBe("gpt-4o-mini");
    expect(result.finishReason).toBe("stop");
    expect(result.usage).toEqual({ inputTokens: 5, outputTokens: 2, totalTokens: 7 });
    expect(result.toolCalls).toEqual([]);
  });

  it("concatenates tool-call argument fragments split across chunks and SSE frames", () => {
    const result = runStream("openai", [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"nexus_find","arg',
      'uments":"{\\"query\\":\\"to"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"do\\"}"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
      "data: [DONE]\n\n"
    ]);

    expect(result.text).toBe("");
    expect(result.finishReason).toBe("tool_calls");
    expect(result.toolCalls).toEqual([
      { id: "call_1", name: "nexus_find", arguments: '{"query":"todo"}' }
    ]);
  });
});

describe("streaming decode + parse + reduce — Anthropic", () => {
  it("assembles text deltas and merged usage from message_start + message_delta", () => {
    const result = runStream("anthropic", [
      'data: {"type":"message_start","message":{"model":"claude-sonnet-4-6","usage":{"input_tokens":10,"output_tokens":1}}}\n\n',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi "}}\n\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"there"}}\n\n',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":4}}\n\n'
    ]);

    expect(result.text).toBe("Hi there");
    expect(result.model).toBe("claude-sonnet-4-6");
    expect(result.finishReason).toBe("end_turn");
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 4, totalTokens: 14 });
  });

  it("assembles a tool_use block from content_block_start + input_json_delta fragments", () => {
    const result = runStream("anthropic", [
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tu_1","name":"nexus_get_section"}}\n\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"in"}}\n\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"dex\\":2}"}}\n\n',
      'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":8}}\n\n'
    ]);

    expect(result.text).toBe("");
    expect(result.finishReason).toBe("tool_use");
    expect(result.toolCalls).toEqual([
      { id: "tu_1", name: "nexus_get_section", arguments: '{"index":2}' }
    ]);
  });

  it("ignores the leading text block index when compacting tool calls", () => {
    const result = runStream("anthropic", [
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text"}}\n\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Looking"}}\n\n',
      'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tu_9","name":"nexus_get_outline"}}\n\n',
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{}"}}\n\n',
      'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}\n\n'
    ]);

    expect(result.text).toBe("Looking");
    expect(result.toolCalls).toEqual([{ id: "tu_9", name: "nexus_get_outline", arguments: "{}" }]);
  });
});

describe("parseAgentChatResult — non-stream fallback", () => {
  it("reads OpenAI tool_calls from a complete body", () => {
    const result = parseAgentChatResult({
      providerId: "openai",
      status: 200,
      json: {
        model: "gpt-4o-mini",
        choices: [
          {
            message: {
              content: null,
              tool_calls: [{ id: "c1", function: { name: "nexus_get_outline", arguments: "{}" } }]
            },
            finish_reason: "tool_calls"
          }
        ]
      }
    });

    expect(result.ok).toBe(true);
    expect(result.toolCalls).toEqual([{ id: "c1", name: "nexus_get_outline", arguments: "{}" }]);
    expect(result.finishReason).toBe("tool_calls");
  });

  it("surfaces provider errors", () => {
    const result = parseAgentChatResult({
      providerId: "anthropic",
      status: 400,
      json: { error: { message: "bad request" } }
    });
    expect(result).toEqual({ ok: false, status: 400, error: "bad request" });
  });
});
