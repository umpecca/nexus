import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  getAiChatHistoryDirectory,
  getAiChatHistoryFilePath,
  sanitizeAiChatHistory
} = require("./aiChatHistory.cjs") as typeof import("./aiChatHistory.cjs");

describe("AI chat history store", () => {
  it("uses opaque per-profile and per-document paths under user-data", () => {
    const userData = path.join("C:", "Nexus", "User Data");
    const report = getAiChatHistoryFilePath(userData, "alice", "C:\\Docs\\report.md");
    const notes = getAiChatHistoryFilePath(userData, "alice", "C:\\Docs\\notes.md");

    expect(report).toMatch(/ai-chats[\\/]([a-f0-9]{64})[\\/]([a-f0-9]{64})\.json$/);
    expect(notes).not.toBe(report);
    expect(getAiChatHistoryDirectory(userData, "alice")).toBe(path.dirname(report));
    expect(getAiChatHistoryFilePath(userData, "alice", null)).toBeNull();
  });

  it("persists only valid transcript and agent-message shapes", () => {
    expect(
      sanitizeAiChatHistory({
        items: [
          { kind: "assistant", id: "a1", text: "Saved", streaming: true },
          { kind: "unknown", id: "bad" }
        ],
        conversation: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi", toolCalls: [{ id: "call", name: "tool", arguments: "{}" }] },
          { role: "invalid", content: "ignored" }
        ]
      })
    ).toEqual({
      version: 1,
      items: [{ kind: "assistant", id: "a1", text: "Saved", streaming: false, stopped: false }],
      conversation: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi", toolCalls: [{ id: "call", name: "tool", arguments: "{}" }] }
      ]
    });
  });
});
