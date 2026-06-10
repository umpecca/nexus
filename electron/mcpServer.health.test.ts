import { afterAll, beforeAll, describe, expect, it } from "vitest";
// Boots the real MCP HTTP server and exercises the verification surface: the authenticated GET
// /health endpoint and the testConnection() probe used by the Preferences "Test setup" button.
import { configure, getListeningInfo, setHost, stop, testConnection } from "./mcp-server.cjs";

const TOKEN = "test-secret-token";
let port = 0;
let baseUrl = "";

beforeAll(async () => {
  setHost({ rejectAllPendingWrites: () => {} });
  const result = await configure({ enabled: true, port: 0, authMode: "bearer", bearerToken: TOKEN });
  expect(result.ok).toBe(true);
  port = getListeningInfo().port;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await stop();
});

function getHealth(headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${baseUrl}/health`, { method: "GET", headers });
}

describe("MCP server /health endpoint", () => {
  it("returns 200 and server identity with a valid token", async () => {
    const response = await getHealth({ Authorization: `Bearer ${TOKEN}` });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, name: "nexus-mcp", authMode: "bearer" });
    expect(typeof body.version).toBe("string");
  });

  it("serves an unauthenticated landing page at / even in bearer mode", async () => {
    const response = await fetch(`${baseUrl}/`, { method: "GET" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect((await response.text()).toLowerCase()).toContain("testing");
  });

  it("rejects a non-GET request to the landing page with 405", async () => {
    const response = await fetch(`${baseUrl}/`, { method: "POST" });
    expect(response.status).toBe(405);
  });

  it("returns 401 with a wrong token", async () => {
    const response = await getHealth({ Authorization: "Bearer nope" });
    expect(response.status).toBe(401);
  });

  it("returns 401 without a token", async () => {
    const response = await getHealth();
    expect(response.status).toBe(401);
  });

  it("rejects non-GET methods with 405", async () => {
    const response = await fetch(`${baseUrl}/health`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    expect(response.status).toBe(405);
  });

  it("probes the local server, and the ngrok branch, through testConnection", async () => {
    const localOnly = await testConnection({ ngrokUrl: null });
    expect(localOnly.local).toMatchObject({ ok: true, status: 200 });
    expect(localOnly.ngrok).toBeNull();

    // Point the "ngrok" URL back at the same loopback server to exercise the ngrok probe branch
    // without needing a real tunnel.
    const withNgrok = await testConnection({ ngrokUrl: baseUrl });
    expect(withNgrok.ngrok).toMatchObject({ ok: true, status: 200, url: baseUrl });
  });

  it("allows requests without a token when auth mode is none", async () => {
    // Reconfigure on the same port so the listener is reused (no restart) with auth disabled.
    const reconfigured = await configure({
      enabled: true,
      port,
      authMode: "none",
      bearerToken: ""
    });
    expect(reconfigured.listening).toBe(true);

    const response = await getHealth();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.authMode).toBe("none");
  });
});
