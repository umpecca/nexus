const crypto = require("node:crypto");
const path = require("node:path");

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeProfileName(profileName) {
  return typeof profileName === "string" && profileName.trim() ? profileName.trim() : "default";
}

function getAiChatHistoryDirectory(userDataPath, profileName) {
  return path.join(userDataPath, "ai-chats", hash(normalizeProfileName(profileName)));
}

function getAiChatHistoryFilePath(userDataPath, profileName, documentPath) {
  if (typeof documentPath !== "string" || !documentPath.trim()) {
    return null;
  }
  return path.join(
    getAiChatHistoryDirectory(userDataPath, profileName),
    `${hash(path.resolve(documentPath))}.json`
  );
}

function sanitizeChatItem(value) {
  if (!value || typeof value !== "object" || typeof value.kind !== "string" || typeof value.id !== "string") {
    return null;
  }

  if (value.kind === "user") {
    return { kind: "user", id: value.id, text: typeof value.text === "string" ? value.text : "", hasSelection: Boolean(value.hasSelection) };
  }
  if (value.kind === "assistant") {
    return { kind: "assistant", id: value.id, text: typeof value.text === "string" ? value.text : "", streaming: false, stopped: Boolean(value.stopped) };
  }
  if (value.kind === "tool") {
    return {
      kind: "tool",
      id: value.id,
      toolCallId: typeof value.toolCallId === "string" ? value.toolCallId : "",
      name: typeof value.name === "string" ? value.name : "",
      args: typeof value.args === "string" ? value.args : "{}",
      status: value.status === "error" || value.status === "running" ? value.status : "done",
      result: typeof value.result === "string" ? value.result : ""
    };
  }
  if (value.kind === "error") {
    return { kind: "error", id: value.id, text: typeof value.text === "string" ? value.text : "" };
  }
  return null;
}

function sanitizeConversationMessage(value) {
  if (!value || typeof value !== "object" || typeof value.role !== "string") {
    return null;
  }
  if (value.role === "user" && typeof value.content === "string") {
    return { role: "user", content: value.content };
  }
  if (value.role === "assistant" && typeof value.content === "string") {
    const toolCalls = Array.isArray(value.toolCalls)
      ? value.toolCalls
          .filter((call) => call && typeof call.id === "string" && typeof call.name === "string" && typeof call.arguments === "string")
          .map((call) => ({ id: call.id, name: call.name, arguments: call.arguments }))
      : undefined;
    return toolCalls?.length ? { role: "assistant", content: value.content, toolCalls } : { role: "assistant", content: value.content };
  }
  if (value.role === "tool" && typeof value.toolCallId === "string" && typeof value.toolName === "string" && typeof value.content === "string") {
    return { role: "tool", toolCallId: value.toolCallId, toolName: value.toolName, content: value.content, isError: Boolean(value.isError) };
  }
  return null;
}

function sanitizeAiChatHistory(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.items) || !Array.isArray(value.conversation)) {
    return null;
  }
  const items = value.items.map(sanitizeChatItem).filter(Boolean);
  const conversation = value.conversation.map(sanitizeConversationMessage).filter(Boolean);
  return { version: 1, items, conversation };
}

module.exports = {
  getAiChatHistoryDirectory,
  getAiChatHistoryFilePath,
  sanitizeAiChatHistory
};
