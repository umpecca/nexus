// Minimal OAuth 2.1 authorization-server surface for the embedded MCP server, so MCP clients that
// require the MCP authorization spec (ChatGPT custom connectors, Claude.ai remote connectors) can
// connect. Implements RFC 9728 protected-resource metadata, RFC 8414 authorization-server metadata,
// RFC 7591 dynamic client registration, and the authorization-code grant with mandatory PKCE (S256).
//
// Deliberately narrow: one user, one resource. After the user approves the browser consent page, the
// token endpoint issues the server's existing static bearer token as the access token — OAuth here is
// a standards-shaped delivery mechanism for that token. /mcp validation is unchanged, issued tokens
// survive app restarts, and "Regenerate token" in settings revokes every client at once. Client
// registrations (no secrets: id, name, redirect URIs) can be persisted to a JSON file; pending
// authorization requests and codes are in-memory and die with the app.

const { createHash, randomBytes, timingSafeEqual } = require("node:crypto");
const fs = require("node:fs");

const MAX_CLIENTS = 100;
const AUTH_REQUEST_TTL_MS = 10 * 60 * 1000;
const AUTH_CODE_TTL_MS = 5 * 60 * 1000;
// RFC 7636 charset for code verifiers; an S256 challenge (43-char base64url) also matches.
const PKCE_VALUE_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;

let clientStorePath = null;
const clients = new Map();
const pendingAuthRequests = new Map();
const authorizationCodes = new Map();

function randomId() {
  return randomBytes(24).toString("base64url");
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

// Public clients only (no secret), so redirect URIs are the security boundary for where codes can be
// sent: https anywhere, or plain http strictly on loopback hosts (local MCP clients).
function isAllowedRedirectUri(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol === "https:") {
    return true;
  }
  if (url.protocol === "http:") {
    return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);
  }
  return false;
}

function loadClients() {
  clients.clear();
  if (!clientStorePath) {
    return;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(clientStorePath, "utf8"));
    const entries = Array.isArray(parsed?.clients) ? parsed.clients : [];
    for (const entry of entries) {
      if (
        typeof entry?.client_id === "string" &&
        Array.isArray(entry.redirect_uris) &&
        entry.redirect_uris.every((uri) => typeof uri === "string" && isAllowedRedirectUri(uri))
      ) {
        clients.set(entry.client_id, {
          clientId: entry.client_id,
          clientName: typeof entry.client_name === "string" ? entry.client_name : "",
          redirectUris: entry.redirect_uris,
          createdAt: Number.isFinite(entry.created_at) ? entry.created_at : Date.now()
        });
      }
    }
  } catch {
    // A missing or unreadable store starts empty; registration persists best-effort.
  }
}

function saveClients() {
  if (!clientStorePath) {
    return;
  }
  try {
    const payload = {
      clients: Array.from(clients.values()).map((client) => ({
        client_id: client.clientId,
        client_name: client.clientName,
        redirect_uris: client.redirectUris,
        created_at: client.createdAt
      }))
    };
    fs.writeFileSync(clientStorePath, JSON.stringify(payload, null, 2), "utf8");
  } catch {
    // Persistence is a convenience; in-memory registration still works for this session.
  }
}

function configure(options = {}) {
  const nextPath =
    typeof options.clientStorePath === "string" && options.clientStorePath.length > 0
      ? options.clientStorePath
      : null;
  if (nextPath !== clientStorePath) {
    clientStorePath = nextPath;
    if (clientStorePath) {
      loadClients();
    }
  }
}

function clearVolatileState() {
  pendingAuthRequests.clear();
  authorizationCodes.clear();
}

function sweepExpired() {
  const now = Date.now();
  for (const [id, request] of pendingAuthRequests.entries()) {
    if (request.expiresAt <= now) {
      pendingAuthRequests.delete(id);
    }
  }
  for (const [code, record] of authorizationCodes.entries()) {
    if (record.expiresAt <= now) {
      authorizationCodes.delete(code);
    }
  }
}

function getProtectedResourceMetadata(origin) {
  return {
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ["header"]
  };
}

function getAuthorizationServerMetadata(origin) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/authorize`,
    token_endpoint: `${origin}/token`,
    registration_endpoint: `${origin}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"]
  };
}

/** RFC 7591 dynamic client registration. Returns `{ status, body }` for the HTTP response. */
function handleRegistration(bodyText) {
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return {
      status: 400,
      body: { error: "invalid_client_metadata", error_description: "The request body must be JSON." }
    };
  }

  const redirectUris = Array.isArray(body?.redirect_uris) ? body.redirect_uris : [];
  if (
    redirectUris.length === 0 ||
    !redirectUris.every((uri) => typeof uri === "string" && isAllowedRedirectUri(uri))
  ) {
    return {
      status: 400,
      body: {
        error: "invalid_redirect_uri",
        error_description: "redirect_uris must be https URLs or http URLs on localhost."
      }
    };
  }

  const clientName =
    typeof body.client_name === "string" ? body.client_name.slice(0, 200) : "";
  const clientId = `nexus-${randomId()}`;
  clients.set(clientId, { clientId, clientName, redirectUris, createdAt: Date.now() });

  // Cap the store; registrations only append, so Map order is creation order.
  while (clients.size > MAX_CLIENTS) {
    const oldest = clients.keys().next().value;
    clients.delete(oldest);
  }
  saveClients();

  return {
    status: 201,
    body: {
      client_id: clientId,
      client_name: clientName,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"]
    }
  };
}

function redirectWith(baseUri, params) {
  const url = new URL(baseUri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

/**
 * Validate an authorization request (`/authorize` query params). Returns one of:
 * - `{ kind: "consent", requestId, nonce, clientName, redirectUri }` — render the consent page;
 * - `{ kind: "redirect", url }` — protocol error reported to the client's redirect URI;
 * - `{ kind: "error-page", status, message }` — the redirect URI itself cannot be trusted, so the
 *   error must be shown in place (RFC 6749 §4.1.2.1: never redirect to an unvalidated URI).
 */
function beginAuthorization(params) {
  sweepExpired();

  const clientId = params.get("client_id") || "";
  const redirectUri = params.get("redirect_uri") || "";
  const client = clients.get(clientId);
  if (!client) {
    return {
      kind: "error-page",
      status: 400,
      message: "Unknown client. Remove and re-add the connector in your AI client to re-register."
    };
  }
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
    return {
      kind: "error-page",
      status: 400,
      message: "The redirect URI is not registered for this client."
    };
  }

  const state = params.get("state") || "";
  if (params.get("response_type") !== "code") {
    return { kind: "redirect", url: redirectWith(redirectUri, { error: "unsupported_response_type", state }) };
  }

  const codeChallenge = params.get("code_challenge") || "";
  if (!PKCE_VALUE_PATTERN.test(codeChallenge) || params.get("code_challenge_method") !== "S256") {
    return {
      kind: "redirect",
      url: redirectWith(redirectUri, {
        error: "invalid_request",
        error_description: "PKCE with code_challenge_method=S256 is required",
        state
      })
    };
  }

  const requestId = randomId();
  const nonce = randomId();
  pendingAuthRequests.set(requestId, {
    clientId,
    redirectUri,
    codeChallenge,
    state,
    scope: params.get("scope") || "",
    nonce,
    expiresAt: Date.now() + AUTH_REQUEST_TTL_MS
  });

  return {
    kind: "consent",
    requestId,
    nonce,
    clientName: client.clientName || "An MCP client",
    redirectUri
  };
}

/**
 * Apply the user's consent decision (`/authorize/decision` form). The nonce ties the POST to the
 * consent page we served (a cross-origin page cannot read it), so consent cannot be forged via CSRF.
 */
function decideAuthorization(form) {
  sweepExpired();

  const request = pendingAuthRequests.get(form.get("request_id") || "");
  if (!request) {
    return {
      kind: "error-page",
      status: 400,
      message: "This authorization request has expired. Start the connection again from your AI client."
    };
  }
  pendingAuthRequests.delete(form.get("request_id") || "");

  if (!safeEqual(form.get("nonce") || "", request.nonce)) {
    return { kind: "error-page", status: 400, message: "The authorization request could not be verified." };
  }

  if (form.get("action") !== "approve") {
    return {
      kind: "redirect",
      url: redirectWith(request.redirectUri, { error: "access_denied", state: request.state })
    };
  }

  const code = `${randomId()}${randomId()}`;
  authorizationCodes.set(code, {
    clientId: request.clientId,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    scope: request.scope,
    expiresAt: Date.now() + AUTH_CODE_TTL_MS
  });

  return { kind: "redirect", url: redirectWith(request.redirectUri, { code, state: request.state }) };
}

function verifyPkce(verifier, challenge) {
  if (!PKCE_VALUE_PATTERN.test(verifier)) {
    return false;
  }
  const computed = createHash("sha256").update(verifier, "ascii").digest("base64url");
  return safeEqual(computed, challenge);
}

/**
 * RFC 6749 token endpoint for the authorization-code grant (`/token` form). Codes are single-use and
 * PKCE-bound. On success the supplied `accessToken` (the server's static bearer token) is issued.
 */
function exchangeAuthorizationCode(form, accessToken) {
  sweepExpired();

  if (form.get("grant_type") !== "authorization_code") {
    return { status: 400, body: { error: "unsupported_grant_type" } };
  }

  const code = form.get("code") || "";
  const record = authorizationCodes.get(code);
  // Single-use regardless of outcome: a replayed or half-valid code must die on first touch.
  authorizationCodes.delete(code);

  if (
    !record ||
    record.expiresAt <= Date.now() ||
    (form.get("client_id") || "") !== record.clientId ||
    (form.get("redirect_uri") || "") !== record.redirectUri ||
    !verifyPkce(form.get("code_verifier") || "", record.codeChallenge)
  ) {
    return { status: 400, body: { error: "invalid_grant" } };
  }

  const body = { access_token: accessToken, token_type: "Bearer" };
  if (record.scope) {
    body.scope = record.scope;
  }
  return { status: 200, body };
}

module.exports = {
  configure,
  clearVolatileState,
  getProtectedResourceMetadata,
  getAuthorizationServerMetadata,
  handleRegistration,
  beginAuthorization,
  decideAuthorization,
  exchangeAuthorizationCode
};
