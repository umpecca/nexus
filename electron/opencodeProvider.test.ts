import { describe, expect, it } from "vitest";
import {
  authHeaders,
  buildCreateSessionRequest,
  buildPromptRequest,
  buildSessionActionRequest,
  contentToParts,
  parseDiscovery,
  parseEvent,
  parseMessage,
  parseSession
} from "./opencodeProvider.cjs";

const config = {
  baseUrl: "http://127.0.0.1:4096/",
  opencodeUsername: "alice",
  opencodeAgent: "build",
  opencodeProviderId: "anthropic",
  model: "claude-sonnet"
};

describe("OpenCode request construction", () => {
  it("adds optional Basic authentication without exposing the password in the body", () => {
    expect(authHeaders(config, "secret").Authorization).toBe(
      `Basic ${Buffer.from("alice:secret").toString("base64")}`
    );
    expect(authHeaders(config, "").Authorization).toBeUndefined();

    const request = buildCreateSessionRequest({ config, password: "secret", title: "Nexus" });
    expect(request.url).toBe("http://127.0.0.1:4096/session");
    expect(request.body).toEqual({ title: "Nexus" });
    expect(JSON.stringify(request.body)).not.toContain("secret");
  });

  it("sends only the latest user turn with the selected agent and model", () => {
    const request = buildPromptRequest({
      sessionId: "ses /1",
      config,
      password: "",
      system: "Nexus system",
      asynchronous: true,
      messages: [
        { role: "user", content: "old" },
        { role: "assistant", content: "answer" },
        { role: "user", content: "new" }
      ]
    });
    expect(request.url).toBe("http://127.0.0.1:4096/session/ses%20%2F1/prompt_async");
    expect(request.body).toEqual({
      parts: [{ type: "text", text: "new" }],
      system: "Nexus system",
      agent: "build",
      model: { providerID: "anthropic", modelID: "claude-sonnet" }
    });
  });

  it("translates Nexus images to OpenCode data-URL file parts", () => {
    expect(
      contentToParts([
        { type: "text", text: "read this" },
        { type: "image", mediaType: "image/png", data: "AAAA" }
      ])
    ).toEqual([
      { type: "text", text: "read this" },
      { type: "file", mime: "image/png", filename: "nexus-import", url: "data:image/png;base64,AAAA" }
    ]);
  });

  it("builds abort and delete session requests", () => {
    expect(buildSessionActionRequest({ sessionId: "s1", config, password: "", action: "abort" })).toMatchObject({
      method: "POST",
      url: "http://127.0.0.1:4096/session/s1/abort"
    });
    expect(buildSessionActionRequest({ sessionId: "s1", config, password: "", action: "delete" })).toMatchObject({
      method: "DELETE",
      url: "http://127.0.0.1:4096/session/s1"
    });
  });
});

describe("OpenCode response parsing", () => {
  it("parses sessions and assistant text/token usage", () => {
    expect(parseSession({ data: { id: "s1", title: "Nexus" } })).toMatchObject({ id: "s1" });
    expect(
      parseMessage({
        info: {
          role: "assistant",
          modelID: "m1",
          finish: "stop",
          tokens: { input: 8, output: 3 }
        },
        parts: [
          { type: "text", text: "Hello " },
          { type: "reasoning", text: "hidden" },
          { type: "text", text: "world" }
        ]
      })
    ).toEqual({
      ok: true,
      text: "Hello world",
      toolCalls: [],
      model: "m1",
      finishReason: "stop",
      usage: { inputTokens: 8, outputTokens: 3, totalTokens: 11 }
    });
  });

  it("discovers connected providers, models, defaults, attachments, and agents", () => {
    expect(
      parseDiscovery({
        health: { healthy: true, version: "1.2.3" },
        providers: {
          connected: ["anthropic"],
          all: [
            {
              id: "anthropic",
              name: "Anthropic",
              models: { sonnet: { id: "sonnet", name: "Sonnet", modalities: { input: ["text", "image"] } } }
            },
            { id: "offline", models: {} }
          ]
        },
        configProviders: { default: { anthropic: "sonnet" } },
        agents: [{ name: "build" }, { name: "plan" }]
      })
    ).toEqual({
      ok: true,
      version: "1.2.3",
      agents: ["build", "plan"],
      providers: [
        { id: "anthropic", name: "Anthropic", models: [{ id: "sonnet", name: "Sonnet", attachment: true }] }
      ],
      defaultModels: { anthropic: "sonnet" }
    });
  });
});

describe("OpenCode event parsing", () => {
  it("normalizes text deltas and ignores other sessions", () => {
    expect(
      parseEvent(
        { type: "message.part.updated", properties: { part: { type: "text", sessionID: "s1" }, delta: "Hi" } },
        "s1"
      )
    ).toEqual([{ type: "text", text: "Hi" }]);
    expect(
      parseEvent(
        { type: "message.part.updated", properties: { part: { type: "text", sessionID: "other" }, delta: "No" } },
        "s1"
      )
    ).toEqual([]);
  });

  it("normalizes provider-owned tools, permissions, questions, and idle", () => {
    expect(
      parseEvent(
        {
          payload: {
            type: "message.part.updated",
            properties: {
              part: {
                id: "p1",
                sessionID: "s1",
                type: "tool",
                callID: "call1",
                tool: "bash",
                state: { status: "completed", input: { command: "pwd" }, output: "ok", title: "Run pwd" }
              }
            }
          }
        },
        "s1"
      )
    ).toEqual([
      {
        type: "provider_tool",
        id: "call1",
        name: "bash",
        title: "Run pwd",
        status: "done",
        input: '{"command":"pwd"}',
        output: "ok"
      }
    ]);
    expect(parseEvent({ type: "permission.updated", properties: { id: "perm1", sessionID: "s1" } }, "s1"))
      .toEqual([{ type: "permission", permission: { id: "perm1", sessionID: "s1" } }]);
    expect(parseEvent({ type: "question.asked", properties: { sessionID: "s1" } }, "s1"))
      .toEqual([{ type: "question" }]);
    expect(parseEvent({ type: "session.idle", properties: { sessionID: "s1" } }, "s1"))
      .toEqual([{ type: "idle" }]);
  });
});
