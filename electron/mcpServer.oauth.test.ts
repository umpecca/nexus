import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
// Boots the real MCP HTTP server and exercises the OAuth 2.1 surface end to end the way an MCP client
// that requires the MCP authorization spec (ChatGPT custom connectors, Claude.ai) uses it: discovery
// via the 401 challenge and well-known metadata, dynamic client registration, the consent page, and
// the PKCE-bound code-for-token exchange that issues the static bearer token.
import { configure, getListeningInfo, setHost, stop } from "./mcp-server.cjs";

const TOKEN = "oauth-test-bearer-token";
const REDIRECT_URI = "https://client.example/callback";
let port = 0;
let baseUrl = "";
const requestOauthApproval = vi.fn(async (_request: { clientName: string; redirectUri: string }): Promise<unknown> => false);

beforeEach(() => {
  requestOauthApproval.mockReset().mockResolvedValue(false);
  setHost({ rejectAllPendingWrites: () => {}, requestOauthApproval });
});

beforeAll(async () => {
  setHost({ rejectAllPendingWrites: () => {}, requestOauthApproval });
  const result = await configure({ enabled: true, port: 0, authMode: "bearer", bearerToken: TOKEN });
  expect(result.ok).toBe(true);
  port = getListeningInfo().port;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await stop();
});

async function registerClient(): Promise<{ client_id: string }> {
  const response = await fetch(`${baseUrl}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_name: "Test Client", redirect_uris: [REDIRECT_URI] })
  });
  expect(response.status).toBe(201);
  return response.json();
}

function makePkcePair() {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier, "ascii").digest("base64url");
  return { verifier, challenge };
}

async function getConsentPage(clientId: string, challenge: string, state = "st-1") {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256"
  });
  const response = await fetch(`${baseUrl}/authorize?${params.toString()}`);
  expect(response.status).toBe(200);
  const html = await response.text();
  const requestId = /name="request_id" value="([^"]+)"/.exec(html)?.[1];
  const nonce = /name="nonce" value="([^"]+)"/.exec(html)?.[1];
  expect(requestId).toBeTruthy();
  expect(nonce).toBeTruthy();
  return { html, requestId: requestId as string, nonce: nonce as string };
}

function submitDecision(requestId: string, nonce: string, action: "approve" | "deny", extra = {}) {
  return fetch(`${baseUrl}/authorize/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ request_id: requestId, nonce, action, ...extra }).toString(),
    redirect: "manual"
  });
}

async function decide(requestId: string, nonce: string, action: "approve" | "deny") {
  const response = await submitDecision(requestId, nonce, action);
  expect(response.status).toBe(302);
  return new URL(response.headers.get("location") ?? "");
}

async function exchange(clientId: string, code: string, verifier: string): Promise<Response> {
  return fetch(`${baseUrl}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      code_verifier: verifier
    }).toString()
  });
}

describe("MCP server OAuth surface", () => {
  it("includes an OAuth discovery challenge on /mcp 401 responses", async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      `resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`
    );
  });

  it("serves protected-resource metadata at the base and /mcp-suffixed well-known paths", async () => {
    for (const path of [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/mcp"
    ]) {
      const response = await fetch(`${baseUrl}${path}`);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.resource).toBe(`${baseUrl}/mcp`);
      expect(body.authorization_servers).toEqual([baseUrl]);
    }
  });

  it("serves authorization-server metadata with PKCE S256 and the flow endpoints", async () => {
    const response = await fetch(`${baseUrl}/.well-known/oauth-authorization-server`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.issuer).toBe(baseUrl);
    expect(body.authorization_endpoint).toBe(`${baseUrl}/authorize`);
    expect(body.token_endpoint).toBe(`${baseUrl}/token`);
    expect(body.registration_endpoint).toBe(`${baseUrl}/register`);
    expect(body.code_challenge_methods_supported).toEqual(["S256"]);
  });

  it("reflects X-Forwarded-Proto in metadata origins (ngrok forwards https)", async () => {
    const response = await fetch(`${baseUrl}/.well-known/oauth-authorization-server`, {
      headers: { "X-Forwarded-Proto": "https" }
    });
    const body = await response.json();
    expect(body.issuer).toBe(`https://127.0.0.1:${port}`);
  });

  it("registers a client dynamically and rejects non-loopback http redirect URIs", async () => {
    const registered = await registerClient();
    expect(registered.client_id).toMatch(/^nexus-/);

    const rejected = await fetch(`${baseUrl}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redirect_uris: ["http://evil.example/cb"] })
    });
    expect(rejected.status).toBe(400);
    expect((await rejected.json()).error).toBe("invalid_redirect_uri");
  });

  it("completes the full authorization-code + PKCE flow and issues the bearer token", async () => {
    requestOauthApproval.mockResolvedValue(true);
    const { client_id } = await registerClient();
    const { verifier, challenge } = makePkcePair();

    const consent = await getConsentPage(client_id, challenge, "xyz");
    expect(consent.html).toContain("Test Client");

    const redirect = await decide(consent.requestId, consent.nonce, "approve");
    expect(requestOauthApproval).toHaveBeenCalledTimes(1);
    expect(requestOauthApproval).toHaveBeenCalledWith({
      clientName: "Test Client", redirectUri: REDIRECT_URI
    });
    expect(redirect.origin + redirect.pathname).toBe(REDIRECT_URI);
    expect(redirect.searchParams.get("state")).toBe("xyz");
    const code = redirect.searchParams.get("code");
    expect(code).toBeTruthy();

    const tokenResponse = await exchange(client_id, code as string, verifier);
    expect(tokenResponse.status).toBe(200);
    const token = await tokenResponse.json();
    expect(token).toMatchObject({ access_token: TOKEN, token_type: "Bearer" });

    // The issued token works against /mcp exactly like the static token.
    const mcpResponse = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.access_token}`
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
    });
    expect(mcpResponse.status).toBe(200);

    // Codes are single-use: replaying the same code fails.
    const replay = await exchange(client_id, code as string, verifier);
    expect(replay.status).toBe(400);
    expect((await replay.json()).error).toBe("invalid_grant");
  });

  it("rejects a token exchange with the wrong PKCE verifier", async () => {
    requestOauthApproval.mockResolvedValue(true);
    const { client_id } = await registerClient();
    const { challenge } = makePkcePair();
    const consent = await getConsentPage(client_id, challenge);
    const redirect = await decide(consent.requestId, consent.nonce, "approve");
    const code = redirect.searchParams.get("code") as string;

    const wrongVerifier = randomBytes(48).toString("base64url");
    const response = await exchange(client_id, code, wrongVerifier);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("invalid_grant");
  });

  it("redirects with access_denied when the user denies consent", async () => {
    const { client_id } = await registerClient();
    const { challenge } = makePkcePair();
    const consent = await getConsentPage(client_id, challenge, "deny-state");
    const redirect = await decide(consent.requestId, consent.nonce, "deny");
    expect(redirect.searchParams.get("error")).toBe("access_denied");
    expect(redirect.searchParams.get("state")).toBe("deny-state");
    expect(requestOauthApproval).not.toHaveBeenCalled();
  });

  it("cannot self-authorize with the public form nonce or forged local approval fields", async () => {
    const { client_id } = await registerClient();
    const { verifier, challenge } = makePkcePair();
    const consent = await getConsentPage(client_id, challenge, "self-approval");
    expect(consent.html).toContain("Request approval in Nexus");
    const response = await submitDecision(consent.requestId, consent.nonce, "approve", {
      ownerApproved: "true", approved: "true", autoApproveWrites: "true"
    });
    expect(response.status).toBe(302);
    const redirect = new URL(response.headers.get("location") as string);
    expect(redirect.searchParams.get("error")).toBe("access_denied");
    expect(redirect.searchParams.get("state")).toBe("self-approval");
    expect(redirect.searchParams.has("code")).toBe(false);
    expect((await exchange(client_id, consent.requestId, verifier)).status).toBe(400);
  });

  it("fails closed when the local approval callback is missing, throws, or returns a non-boolean", async () => {
    for (const approval of [undefined, async () => { throw new Error("Dialog unavailable"); }, async () => "true"]) {
      setHost({ rejectAllPendingWrites: () => {}, requestOauthApproval: approval });
      const { client_id } = await registerClient();
      const consent = await getConsentPage(client_id, makePkcePair().challenge);
      const redirect = await decide(consent.requestId, consent.nonce, "approve");
      expect(redirect.searchParams.get("error")).toBe("access_denied");
      expect(redirect.searchParams.has("code")).toBe(false);
    }
  });

  it("rejects an invalid nonce without asking the owner", async () => {
    const { client_id } = await registerClient();
    const consent = await getConsentPage(client_id, makePkcePair().challenge);
    const response = await submitDecision(consent.requestId, "forged-nonce", "approve");
    expect(response.status).toBe(400);
    expect(requestOauthApproval).not.toHaveBeenCalled();
  });

  it("waits for local approval and rejects replay or concurrent dialogs", async () => {
    let approve!: (value: boolean) => void;
    requestOauthApproval.mockImplementation(() => new Promise(resolve => { approve = resolve; }));
    const { client_id } = await registerClient();
    const { verifier, challenge } = makePkcePair();
    const consent = await getConsentPage(client_id, challenge);
    const pending = submitDecision(consent.requestId, consent.nonce, "approve");
    await vi.waitFor(() => expect(requestOauthApproval).toHaveBeenCalledTimes(1));
    try {
      expect((await exchange(client_id, consent.requestId, verifier)).status).toBe(400);
      expect((await submitDecision(consent.requestId, consent.nonce, "approve")).status).toBe(400);
      const otherConsent = await getConsentPage(client_id, challenge);
      const denied = await decide(otherConsent.requestId, otherConsent.nonce, "approve");
      expect(denied.searchParams.get("error")).toBe("access_denied");
      expect(requestOauthApproval).toHaveBeenCalledTimes(1);
    } finally {
      approve(true);
    }
    const response = await pending;
    expect(response.status).toBe(302);
    const code = new URL(response.headers.get("location") as string).searchParams.get("code") as string;
    expect((await exchange(client_id, code, verifier)).status).toBe(200);
  });

  it("rejects local approval if the authorization request expires while the dialog is open", async () => {
    let approve!: (value: boolean) => void;
    requestOauthApproval.mockImplementation(() => new Promise(resolve => { approve = resolve; }));
    const { client_id } = await registerClient();
    const consent = await getConsentPage(client_id, makePkcePair().challenge);
    const pending = submitDecision(consent.requestId, consent.nonce, "approve");
    await vi.waitFor(() => expect(requestOauthApproval).toHaveBeenCalledTimes(1));
    const now = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 11 * 60 * 1000);
    try {
      approve(true);
      const response = await pending;
      const redirect = new URL(response.headers.get("location") as string);
      expect(redirect.searchParams.get("error")).toBe("access_denied");
      expect(redirect.searchParams.has("code")).toBe(false);
    } finally {
      now.mockRestore();
    }
  });

  it("invalidates pending local approvals and issued codes when the bearer token changes", async () => {
    requestOauthApproval.mockResolvedValue(true);
    const { client_id } = await registerClient();
    const { verifier, challenge } = makePkcePair();
    const firstConsent = await getConsentPage(client_id, challenge);
    const firstRedirect = await decide(firstConsent.requestId, firstConsent.nonce, "approve");
    const oldCode = firstRedirect.searchParams.get("code") as string;

    let approve!: (value: boolean) => void;
    requestOauthApproval.mockClear().mockImplementation(() => new Promise(resolve => { approve = resolve; }));
    const consent = await getConsentPage(client_id, challenge);
    const pending = submitDecision(consent.requestId, consent.nonce, "approve");
    await vi.waitFor(() => expect(requestOauthApproval).toHaveBeenCalledTimes(1));
    try {
      await configure({ enabled: true, port, authMode: "bearer", bearerToken: "rotated-test-token" });
      approve(true);
      const response = await pending;
      const redirect = new URL(response.headers.get("location") as string);
      expect(redirect.searchParams.get("error")).toBe("access_denied");
      expect((await exchange(client_id, oldCode, verifier)).status).toBe(400);
    } finally {
      approve(false);
      await configure({ enabled: true, port, authMode: "bearer", bearerToken: TOKEN });
    }
  });

  it("shows an in-place error page (no redirect) for an unknown client or unregistered redirect", async () => {
    const params = new URLSearchParams({
      client_id: "nexus-unknown",
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      code_challenge: makePkcePair().challenge,
      code_challenge_method: "S256"
    });
    const response = await fetch(`${baseUrl}/authorize?${params.toString()}`, { redirect: "manual" });
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("text/html");
  });

  it("requires PKCE: a request without a code challenge is redirected with invalid_request", async () => {
    const { client_id } = await registerClient();
    const params = new URLSearchParams({
      client_id,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      state: "s"
    });
    const response = await fetch(`${baseUrl}/authorize?${params.toString()}`, { redirect: "manual" });
    expect(response.status).toBe(302);
    const redirect = new URL(response.headers.get("location") ?? "");
    expect(redirect.searchParams.get("error")).toBe("invalid_request");
  });

  it("disables the OAuth surface in no-auth mode", async () => {
    const reconfigured = await configure({ enabled: true, port, authMode: "none", bearerToken: "" });
    expect(reconfigured.listening).toBe(true);

    const discovery = await fetch(`${baseUrl}/.well-known/oauth-protected-resource`);
    expect(discovery.status).toBe(404);
    const token = await fetch(`${baseUrl}/token`, { method: "POST", body: "" });
    expect(token.status).toBe(404);

    // Restore bearer mode for any later assertions.
    await configure({ enabled: true, port, authMode: "bearer", bearerToken: TOKEN });
  });
});
