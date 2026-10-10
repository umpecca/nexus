import { describe, expect, it, vi } from "vitest";
import { confirmMcpOauthConnection } from "./mcpOauthApproval.cjs";

const request = { clientName: "Test Client", redirectUri: "https://client.example/callback" };

describe("native MCP OAuth approval", () => {
  it("identifies the client and destination and defaults cancellation to Deny", async () => {
    const dialog = { showMessageBox: vi.fn().mockResolvedValue({ response: 0 }) };
    expect(await confirmMcpOauthConnection(dialog, null, request)).toBe(false);
    const options = dialog.showMessageBox.mock.calls[0][0];
    expect(options).toMatchObject({ buttons: ["Deny", "Allow connection"], defaultId: 0, cancelId: 0 });
    expect(options.detail).toContain(request.clientName);
    expect(options.detail).toContain(request.redirectUri);
    expect(options.detail).toContain("Only approve if you just started this connection");
  });

  it("grants access only for the explicit Allow response from the native dialog", async () => {
    const parent = { isDestroyed: () => false };
    const dialog = { showMessageBox: vi.fn().mockResolvedValue({ response: 1 }) };
    expect(await confirmMcpOauthConnection(dialog, parent, request)).toBe(true);
    expect(dialog.showMessageBox.mock.calls[0][0]).toBe(parent);
    for (const response of [-1, undefined, "1"]) {
      dialog.showMessageBox.mockResolvedValue({ response });
      expect(await confirmMcpOauthConnection(dialog, parent, request)).toBe(false);
    }
  });

  it("prevents client labels from adding fake lines to the local approval explanation", async () => {
    const dialog = { showMessageBox: vi.fn().mockResolvedValue({ response: 0 }) };
    await confirmMcpOauthConnection(dialog, { isDestroyed: () => true }, {
      clientName: "Client\nAlready approved\x00", redirectUri: "https://client.example/\ncallback"
    });
    const options = dialog.showMessageBox.mock.calls[0][0];
    expect(options.detail).toContain("Client name (provided by the client): Client Already approved ");
    expect(options.detail).toContain("Callback address: https://client.example/ callback");
  });
});
