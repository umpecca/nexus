import { describe, expect, it, vi } from "vitest";
import { createRendererIpc, isPendingRequestOwner, isTrustedRendererEvent, isValidRendererPayload, sameRendererUrl } from "./rendererIpc.cjs";

function fixture(url = "file:///C:/Nexus/dist/index.html") {
  const frame = { url };
  const sender = { id: 1, mainFrame: frame, isDestroyed: () => false };
  return { event: { sender, senderFrame: frame }, trusted: new Map([[sender, url]]) };
}

describe("privileged renderer IPC", () => {
  it("validates folder grants and management payloads before touching the filesystem", () => {
    expect(isValidRendererPayload("folder:open", [])).toBe(true);
    expect(isValidRendererPayload("folder:open", ["C:/unapproved"])).toBe(false);
    expect(isValidRendererPayload("folder:mutate", [{ rootId: "root", path: "note.md", action: "trash" }])).toBe(true);
    expect(isValidRendererPayload("folder:mutate", [{ rootId: "root", path: "note.md", action: "move", destination: "nested", name: "note.md" }])).toBe(true);
    for (const payload of [{ path: "note.md" }, { rootId: "", path: "" }, { rootId: "root", path: [] }]) {
      expect(isValidRendererPayload("folder:list", [payload])).toBe(false);
    }
    for (const payload of [
      { rootId: "root", path: "note.md", action: "destroy" },
      { rootId: "root", path: "note.md", action: "move", name: "note.md", destination: [] },
      { rootId: "root", path: "note.md", action: "copy" }
    ]) expect(isValidRendererPayload("folder:mutate", [payload])).toBe(false);
  });
  it("trusts only registered main frames at the expected editor URL", () => {
    const { event, trusted } = fixture();
    expect(isTrustedRendererEvent(event, trusted)).toBe(true);
    expect(isTrustedRendererEvent(event, new Map())).toBe(false);
    expect(isTrustedRendererEvent({ ...event, senderFrame: { url: event.senderFrame.url } }, trusted)).toBe(false);
    expect(isTrustedRendererEvent({ ...event, senderFrame: null }, trusted)).toBe(false);
    event.senderFrame.url = "file:///C:/Nexus/dist/openapi-host.html";
    expect(isTrustedRendererEvent(event, trusted)).toBe(false);
    event.senderFrame.url = "https://example.com";
    expect(isTrustedRendererEvent(event, trusted)).toBe(false);
  });

  it("allows heading anchors while rejecting sibling dev pages, queries, and lookalike hosts", () => {
    expect(sameRendererUrl("http://localhost:5173/#heading", "http://localhost:5173/")).toBe(true);
    for (const url of ["http://localhost:5173/openapi-host.html", "http://localhost:5173/?other", "http://localhost:5173.evil.example/", "data:text/html,hello"]) {
      expect(sameRendererUrl(url, "http://localhost:5173/")).toBe(false);
    }
  });

  it("rejects destroyed or detached frames without throwing", () => {
    const { event, trusted } = fixture();
    event.sender.isDestroyed = () => true;
    expect(isTrustedRendererEvent(event, trusted)).toBe(false);
    const detached = { get senderFrame() { throw new Error("Frame gone"); }, sender: event.sender };
    expect(isTrustedRendererEvent(detached, trusted)).toBe(false);
  });

  it("blocks invocation before touching a privileged handler or malformed write payload", () => {
    const { event, trusted } = fixture();
    const handle = vi.fn();
    const ipc = createRendererIpc({ handle }, trusted);
    const listener = vi.fn(() => "saved");
    ipc.handle("file:save", listener);
    const invoke = handle.mock.calls[0][1];
    const payload = { filePath: "C:/docs/note.md", markdown: "" };
    expect(invoke(event, payload)).toBe("saved");
    listener.mockClear();
    expect(() => invoke({ ...event, senderFrame: { url: event.senderFrame.url } }, payload)).toThrow("Untrusted IPC sender");
    expect(() => invoke(event, { ...payload, markdown: { text: "bad" } })).toThrow("Invalid IPC payload");
    expect(listener).not.toHaveBeenCalled();
  });

  it("drops untrusted or malformed event messages without emitting exceptions", () => {
    const { event, trusted } = fixture();
    const on = vi.fn();
    const ipc = createRendererIpc({ on }, trusted);
    const listener = vi.fn();
    ipc.on("mcp:write-decision", listener);
    const receive = on.mock.calls[0][1];
    expect(() => receive(event, { requestId: "id", decision: true })).not.toThrow();
    receive({ ...event, senderFrame: null }, { requestId: "id", decision: "approve" });
    expect(listener).not.toHaveBeenCalled();
    receive(event, { requestId: "id", decision: "reject" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["file:save", { filePath: 42, markdown: "text" }],
    ["file:choose-save-path", { currentPath: [], markdown: "text" }],
    ["file:export-html", { markdown: "text", options: [] }],
    ["file:save-pdf-preview", { data: "PDF" }],
    ["ai:get-key", { profileName: {}, providerId: "openai" }],
    ["ai:set-key", { profileName: "default", providerId: "openai", key: 42 }],
    ["mcp:set-bearer-token", { token: {} }],
    ["quickconnect:get-token", {}],
    ["file:save", { filePath: "note.md", markdown: "text", diagramNames: [42] }],
    ["ai:chat-stream", { requestId: "id", payload: { providerId: "openai", config: {}, messages: {} } }],
    ["app:resolve-close-request", "true"]
  ])("rejects malformed sensitive payloads for %s", (channel, payload) => {
    expect(isValidRendererPayload(channel, [payload])).toBe(false);
  });

  it("accepts the existing bridge's valid payloads, including empty secrets and byte snapshots", () => {
    expect(isValidRendererPayload("ai:set-key", [{ profileName: "default", providerId: "openai", key: "" }])).toBe(true);
    expect(isValidRendererPayload("file:choose-save-path", [{ markdown: "", currentPath: undefined }])).toBe(true);
    expect(isValidRendererPayload("file:save-pdf-preview", [{ data: new Uint8Array([37, 80, 68, 70]) }])).toBe(true);
    expect(isValidRendererPayload("mcp:write-decision", [{ requestId: "id", decision: "approve" }])).toBe(true);
  });

  it("restricts pending confirmation and selection responses to their owning window", () => {
    const { event } = fixture();
    expect(isPendingRequestOwner(event, { webContentsId: 1 })).toBe(true);
    expect(isPendingRequestOwner(event, { webContentsId: 2 })).toBe(false);
    expect(isPendingRequestOwner(event, undefined)).toBe(false);
  });
});
