const http = require("node:http");
const https = require("node:https");
const { Buffer } = require("node:buffer");
const { timingSafeEqual } = require("node:crypto");
const mcpOauth = require("./mcpOauth.cjs");

const SERVER_BIND_HOST = "127.0.0.1";
const SERVER_NAME = "nexus-mcp";
const MCP_PROTOCOL_VERSION = "2024-11-05";

// Static, unauthenticated landing page served at "/" so the server URL can be opened in a browser to
// confirm reachability. Intentionally reveals nothing beyond "a Nexus MCP server is here."
const LANDING_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Nexus MCP</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    background: #0b0b0c; color: #e7e7e9; }
  main { text-align: center; padding: 2rem; }
  h1 { font-size: 1.4rem; margin: 0 0 0.5rem; }
  p { margin: 0; color: #9aa0a6; }
</style>
</head>
<body>
<main>
<h1>Nexus MCP server</h1>
<p>Testing &mdash; the server is reachable.</p>
</main>
</body>
</html>
`;

let pkgVersion = "0.0.0";
try {
  pkgVersion = require("../package.json").version || pkgVersion;
} catch {
  // Package version is informational; fall back to the placeholder above.
}

let host = null;
let httpServer = null;
let listeningPort = 0;
let currentConfig = { enabled: false, port: 0, authMode: "bearer", bearerToken: "" };
let lastClientLabel = "";

const READ_ONLY_TOOLS = [
  {
    name: "nexus_list_windows",
    description:
      "List the editor windows currently open in Nexus. Returns each window's id, title, file path, dirty state, and whether it is focused.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: "nexus_get_document",
    description:
      "Return the current Markdown content, title, file path, and dirty state of the focused Nexus editor window, or of a specific window when windowId is provided.",
    inputSchema: {
      type: "object",
      properties: {
        windowId: { type: "string" }
      },
      additionalProperties: false
    }
  },
  {
    name: "nexus_get_outline",
    description:
      "Return the heading outline of the focused Nexus editor window (or the window identified by windowId). Each entry has the heading level (1-6), text, a unique GitHub-style slug, a zero-based ordinal index, and a 1-based source line number. Use this to understand document structure before reading or editing a specific part.",
    inputSchema: {
      type: "object",
      properties: {
        windowId: { type: "string" }
      },
      additionalProperties: false
    }
  },
  {
    name: "nexus_get_section",
    description:
      "Return the Markdown of a single section of the focused Nexus editor window (or the window identified by windowId), from a heading through the line before the next heading of the same or higher level (deeper subsections are included). Identify the section by exactly one of: 'index' (the heading ordinal from nexus_get_outline), 'slug', or 'heading' text. When no section matches, returns found=false with the list of available headings.",
    inputSchema: {
      type: "object",
      properties: {
        windowId: { type: "string" },
        index: { type: "integer", minimum: 0 },
        slug: { type: "string" },
        heading: { type: "string" }
      },
      additionalProperties: false
    }
  },
  {
    name: "nexus_search_document",
    description:
      "Search the Markdown of the focused Nexus editor window (or the window identified by windowId) and return matches with 1-based line and column numbers plus a line preview. 'query' is a literal substring unless 'isRegex' is true; matching is case-insensitive unless 'caseSensitive' is true. Results are capped at 'maxResults' (default 200, max 1000); 'total' reports the full count and 'truncated' indicates more matches exist. For surrounding context and the heading each match falls under, use nexus_find instead.",
    inputSchema: {
      type: "object",
      properties: {
        windowId: { type: "string" },
        query: { type: "string" },
        isRegex: { type: "boolean" },
        caseSensitive: { type: "boolean" },
        maxResults: { type: "integer", minimum: 1, maximum: 1000 }
      },
      required: ["query"],
      additionalProperties: false
    }
  },
  {
    name: "nexus_find",
    description:
      "Find a query in the focused Nexus editor window (or the window identified by windowId) and return each matching line together with surrounding context lines and the heading the line falls under — so you can understand what was found and where it sits in the document without a separate read. Use this to explore and understand the document's contents. 'query' is a literal substring unless 'isRegex' is true; matching is case-insensitive unless 'caseSensitive' is true. Matches are grouped by line (each with the columns and count of occurrences on it); results are capped at 'maxResults' matching lines (default 50, max 500), 'contextLines' sets how many lines of context surround each match (default 2, max 10), and 'total'/'matchingLines'/'truncated' summarize the full result. For bare occurrence positions or exact counts, use nexus_search_document.",
    inputSchema: {
      type: "object",
      properties: {
        windowId: { type: "string" },
        query: { type: "string" },
        isRegex: { type: "boolean" },
        caseSensitive: { type: "boolean" },
        maxResults: { type: "integer", minimum: 1, maximum: 500 },
        contextLines: { type: "integer", minimum: 0, maximum: 10 }
      },
      required: ["query"],
      additionalProperties: false
    }
  },
  {
    name: "nexus_get_selection",
    description:
      "Return the text the user currently has selected in the focused Nexus editor window (or the window identified by windowId), along with the editor mode (rich-text, source, or diff) and whether a non-empty selection exists. Use this to operate on exactly what the user has highlighted.",
    inputSchema: {
      type: "object",
      properties: {
        windowId: { type: "string" }
      },
      additionalProperties: false
    }
  }
];

const WRITE_TOOL = {
  name: "nexus_replace_document",
  description:
    "Replace the entire Markdown content of the focused Nexus editor window (or the window identified by windowId). The user must approve the replacement in an in-app diff confirmation dialog before it takes effect.",
  inputSchema: {
    type: "object",
    properties: {
      windowId: { type: "string" },
      markdown: { type: "string" }
    },
    required: ["markdown"],
    additionalProperties: false
  }
};

// Granular, in-buffer write tools. Each computes a proposed full buffer from the cached document and
// routes it through the same diff-confirmation gate as nexus_replace_document (or applies directly
// when the user has enabled auto-approve). An edit that cannot be located fails without a dialog.
const WRITE_TOOLS = [
  {
    name: "nexus_apply_edits",
    description:
      "Apply one or more ordered find/replace edits to the document of the focused Nexus editor window (or windowId). Each edit is { find, replace, all?, isRegex? }: 'find' is matched literally unless 'isRegex' is true. An edit that matches nothing — or matches more than once without 'all' — fails the whole batch without changing the document, so a stale read is rejected rather than mis-applied. Use an empty 'replace' to delete. The change is shown in an in-app diff for the user to approve (unless auto-approve is enabled).",
    inputSchema: {
      type: "object",
      properties: {
        windowId: { type: "string" },
        edits: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              find: { type: "string" },
              replace: { type: "string" },
              all: { type: "boolean" },
              isRegex: { type: "boolean" }
            },
            required: ["find", "replace"],
            additionalProperties: false
          }
        }
      },
      required: ["edits"],
      additionalProperties: false
    }
  },
  {
    name: "nexus_replace_section",
    description:
      "Replace a whole section (a heading through the line before the next same-or-higher heading, deeper subsections included) of the focused Nexus editor window (or windowId) with caller-supplied Markdown. Identify the section by exactly one of 'index' (the heading ordinal from nexus_get_outline), 'slug', or 'heading'. An empty 'markdown' deletes the section. The change is shown in an in-app diff for the user to approve (unless auto-approve is enabled).",
    inputSchema: {
      type: "object",
      properties: {
        windowId: { type: "string" },
        index: { type: "integer", minimum: 0 },
        slug: { type: "string" },
        heading: { type: "string" },
        markdown: { type: "string" }
      },
      required: ["markdown"],
      additionalProperties: false
    }
  },
  {
    name: "nexus_set_frontmatter",
    description:
      "Set, merge, or remove simple scalar YAML frontmatter fields (title, tags, date, …) of the focused Nexus editor window (or windowId), creating the leading --- block if absent and removing it when the last field is removed. 'set' is an object of key to scalar (string, number, or boolean) value; 'remove' is an array of keys. Frontmatter that is not simple key: value scalars is left untouched and reported. The change is shown in an in-app diff for the user to approve (unless auto-approve is enabled).",
    inputSchema: {
      type: "object",
      properties: {
        windowId: { type: "string" },
        set: { type: "object", additionalProperties: { type: ["string", "number", "boolean"] } },
        remove: { type: "array", items: { type: "string" } }
      },
      additionalProperties: false
    }
  }
];

function describeEditError(error) {
  if (!error || typeof error !== "object") {
    return "The edit could not be applied.";
  }
  const at = typeof error.editIndex === "number" ? `Edit ${error.editIndex}: ` : "";
  switch (error.reason) {
    case "anchor-not-found":
      return `${at}the text to find was not present in the document: ${JSON.stringify(error.find)}.`;
    case "ambiguous":
      return `${at}the text to find appears ${error.matchCount} times; pass "all": true or use a more specific anchor.`;
    case "invalid-regex":
      return `${at}invalid regular expression: ${error.message}.`;
    case "invalid-edit":
      return error.message || "An edit was missing a valid find/replace.";
    case "invalid-edits":
      return error.message || "apply_edits requires a non-empty 'edits' array.";
    case "section-not-found":
      return "No section matched the given index, slug, or heading.";
    case "no-headings":
      return "The document has no headings, so there is no section to replace.";
    case "frontmatter-unsupported":
      return "The document's existing frontmatter is not simple key: value YAML, so it was left unchanged.";
    case "unsupported-value":
      return `Frontmatter value for "${error.key}" must be a scalar (string, number, or boolean) without line breaks.`;
    case "no-changes":
      return error.message || "Provide 'set' and/or 'remove'.";
    case "invalid-markdown":
      return error.message || "A string 'markdown' value is required.";
    default:
      return error.message || `The edit could not be applied (${error.reason ?? "unknown"}).`;
  }
}

// Map a host write result into MCP tool content: a normal applied/rejected outcome is data; a missing
// window, a busy window, a delivery failure, or an edit that could not be located is an error.
function writeResultToToolContent(result, windowId) {
  if (!result) {
    return toolErrorContent(noWindowMessage(windowId));
  }
  if (result.applied) {
    return toolTextContent({ applied: true });
  }
  switch (result.reason) {
    case "no-window":
      return toolErrorContent(noWindowMessage(windowId));
    case "busy":
      return toolErrorContent(
        "A write confirmation is already pending for this window. Try again after the user responds."
      );
    case "send-failed":
      return toolErrorContent(result.message || "Failed to deliver the write to the editor window.");
    case "edit-failed":
      return toolErrorContent(describeEditError(result.error));
    case "user-rejected":
      return toolTextContent({ applied: false, reason: "user-rejected" });
    default:
      return toolTextContent({ applied: false, reason: result.reason ?? "unknown" });
  }
}

function setHost(nextHost) {
  host = nextHost;
}

function getLastClientLabel() {
  return lastClientLabel;
}

function getListeningInfo() {
  return {
    enabled: currentConfig.enabled,
    listening: Boolean(httpServer) && httpServer.listening,
    host: SERVER_BIND_HOST,
    port: listeningPort
  };
}

function compareTokens(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string" || provided.length === 0 || expected.length === 0) {
    return false;
  }

  const providedBuf = Buffer.from(provided, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }

  return timingSafeEqual(providedBuf, expectedBuf);
}

function extractBearerToken(headerValue) {
  if (typeof headerValue !== "string") {
    return "";
  }

  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  return match ? match[1].trim() : "";
}

function sendJson(res, statusCode, body, extraHeaders) {
  const payload = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    ...(extraHeaders || {})
  });
  res.end(payload);
}

function sendHtml(res, statusCode, html, extraHeaders) {
  const payload = Buffer.from(html, "utf8");
  res.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": payload.length,
    "Cache-Control": "no-store",
    ...(extraHeaders || {})
  });
  res.end(payload);
}

// Derive the externally-visible origin for OAuth metadata and 401 challenges. Through the ngrok
// tunnel the public host arrives in the Host header and ngrok adds X-Forwarded-Proto: https; for a
// direct loopback request this yields http://127.0.0.1:{port}.
function getRequestOrigin(req) {
  const protoHeader = req.headers["x-forwarded-proto"];
  const protoRaw = (Array.isArray(protoHeader) ? protoHeader[0] : protoHeader || "")
    .split(",")[0]
    .trim();
  const proto = protoRaw === "https" ? "https" : "http";
  const host = req.headers.host || "";
  if (!/^[A-Za-z0-9.\-:[\]]+$/.test(host)) {
    return `http://${SERVER_BIND_HOST}:${listeningPort}`;
  }
  return `${proto}://${host}`;
}

// RFC 9728: point 401 responses at the protected-resource metadata so OAuth-capable MCP clients
// (ChatGPT, Claude.ai) can discover the authorization server instead of giving up.
function unauthorizedChallengeHeaders(req) {
  return {
    "WWW-Authenticate": `Bearer resource_metadata="${getRequestOrigin(req)}/.well-known/oauth-protected-resource"`
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildConsentPageHtml({ clientName, redirectUri, requestId, nonce }) {
  let redirectHost = redirectUri;
  try {
    redirectHost = new URL(redirectUri).host;
  } catch {
    // Display the raw value if it cannot be parsed; it was validated at registration.
  }
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Authorize access to Nexus</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    background: #0b0b0c; color: #e7e7e9; }
  main { text-align: center; padding: 2rem; max-width: 26rem; }
  h1 { font-size: 1.4rem; margin: 0 0 0.5rem; }
  p { margin: 0 0 1.25rem; color: #9aa0a6; line-height: 1.5; }
  .actions { display: flex; gap: 0.75rem; justify-content: center; }
  button { font: inherit; padding: 0.55rem 1.4rem; border-radius: 0.5rem; cursor: pointer;
    border: 1px solid #3f3f46; background: #18181b; color: #e7e7e9; }
  button.approve { background: #2563eb; border-color: #2563eb; color: #fff; }
</style>
</head>
<body>
<main>
<h1>Authorize access to Nexus?</h1>
<p><strong>${escapeHtml(clientName)}</strong> (${escapeHtml(redirectHost)}) is asking to connect to
your Nexus MCP server. Approving lets it read your open document and propose edits, subject to your
MCP write settings.</p>
<form method="post" action="/authorize/decision">
<input type="hidden" name="request_id" value="${escapeHtml(requestId)}" />
<input type="hidden" name="nonce" value="${escapeHtml(nonce)}" />
<div class="actions">
<button type="submit" name="action" value="deny">Deny</button>
<button type="submit" name="action" value="approve" class="approve">Approve</button>
</div>
</form>
</main>
</body>
</html>
`;
}

function buildOauthErrorPageHtml(message) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Nexus authorization error</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    background: #0b0b0c; color: #e7e7e9; }
  main { text-align: center; padding: 2rem; max-width: 26rem; }
  h1 { font-size: 1.4rem; margin: 0 0 0.5rem; }
  p { margin: 0; color: #9aa0a6; line-height: 1.5; }
</style>
</head>
<body>
<main>
<h1>Authorization failed</h1>
<p>${escapeHtml(message)}</p>
</main>
</body>
</html>
`;
}

// Consent and error pages must not be frameable (clickjacking) and must not leak codes via referrers.
const OAUTH_PAGE_HEADERS = {
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer"
};

function respondAuthorizationOutcome(res, outcome) {
  if (outcome.kind === "redirect") {
    res.writeHead(302, { Location: outcome.url, "Cache-Control": "no-store" });
    res.end();
    return;
  }
  if (outcome.kind === "consent") {
    sendHtml(res, 200, buildConsentPageHtml(outcome), OAUTH_PAGE_HEADERS);
    return;
  }
  sendHtml(
    res,
    outcome.status || 400,
    buildOauthErrorPageHtml(outcome.message || "Authorization failed."),
    OAUTH_PAGE_HEADERS
  );
}

function jsonRpcError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) {
    error.data = data;
  }
  return { jsonrpc: "2.0", id: id ?? null, error };
}

function jsonRpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function toolTextContent(payload) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2)
      }
    ]
  };
}

function toolErrorContent(message) {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: message
      }
    ]
  };
}

function noWindowMessage(windowId) {
  return windowId
    ? `No Nexus editor window matches windowId "${windowId}".`
    : "No focused Nexus editor window is available.";
}

async function dispatchToolCall(name, args, requestContext) {
  if (!host) {
    return toolErrorContent("Nexus MCP host is not initialized.");
  }

  if (name === "nexus_list_windows") {
    const windows = host.listWindows();
    return toolTextContent({ windows });
  }

  if (name === "nexus_get_document") {
    const windowId = typeof args?.windowId === "string" ? args.windowId : undefined;
    const document = host.getDocument(windowId);
    if (!document) {
      return toolErrorContent(noWindowMessage(windowId));
    }
    return toolTextContent(document);
  }

  if (name === "nexus_get_outline") {
    const windowId = typeof args?.windowId === "string" ? args.windowId : undefined;
    if (typeof host.getOutline !== "function") {
      return toolErrorContent("nexus_get_outline is not supported by this Nexus version.");
    }
    const outline = host.getOutline(windowId);
    if (!outline) {
      return toolErrorContent(noWindowMessage(windowId));
    }
    return toolTextContent(outline);
  }

  if (name === "nexus_get_section") {
    const windowId = typeof args?.windowId === "string" ? args.windowId : undefined;
    if (typeof host.getSection !== "function") {
      return toolErrorContent("nexus_get_section is not supported by this Nexus version.");
    }

    const selector = {};
    if (Number.isInteger(args?.index)) {
      selector.index = args.index;
    }
    if (typeof args?.slug === "string" && args.slug.length > 0) {
      selector.slug = args.slug;
    }
    if (typeof args?.heading === "string" && args.heading.length > 0) {
      selector.heading = args.heading;
    }

    if (selector.index === undefined && selector.slug === undefined && selector.heading === undefined) {
      return toolErrorContent(
        "nexus_get_section requires one of 'index', 'slug', or 'heading' to identify the section."
      );
    }

    const section = host.getSection(windowId, selector);
    if (!section) {
      return toolErrorContent(noWindowMessage(windowId));
    }
    return toolTextContent(section);
  }

  if (name === "nexus_search_document") {
    const windowId = typeof args?.windowId === "string" ? args.windowId : undefined;
    if (typeof host.searchDocument !== "function") {
      return toolErrorContent("nexus_search_document is not supported by this Nexus version.");
    }

    const query = typeof args?.query === "string" ? args.query : "";
    if (query.length === 0) {
      return toolErrorContent("nexus_search_document requires a non-empty 'query' string.");
    }

    let result;
    try {
      result = host.searchDocument(windowId, {
        query,
        isRegex: Boolean(args?.isRegex),
        caseSensitive: Boolean(args?.caseSensitive),
        maxResults: args?.maxResults
      });
    } catch (error) {
      return toolErrorContent(error instanceof Error ? error.message : String(error));
    }

    if (!result) {
      return toolErrorContent(noWindowMessage(windowId));
    }
    return toolTextContent(result);
  }

  if (name === "nexus_find") {
    const windowId = typeof args?.windowId === "string" ? args.windowId : undefined;
    if (typeof host.find !== "function") {
      return toolErrorContent("nexus_find is not supported by this Nexus version.");
    }

    const query = typeof args?.query === "string" ? args.query : "";
    if (query.length === 0) {
      return toolErrorContent("nexus_find requires a non-empty 'query' string.");
    }

    let result;
    try {
      result = host.find(windowId, {
        query,
        isRegex: Boolean(args?.isRegex),
        caseSensitive: Boolean(args?.caseSensitive),
        maxResults: args?.maxResults,
        contextLines: args?.contextLines
      });
    } catch (error) {
      return toolErrorContent(error instanceof Error ? error.message : String(error));
    }

    if (!result) {
      return toolErrorContent(noWindowMessage(windowId));
    }
    return toolTextContent(result);
  }

  if (name === "nexus_get_selection") {
    const windowId = typeof args?.windowId === "string" ? args.windowId : undefined;
    if (typeof host.getSelection !== "function") {
      return toolErrorContent("nexus_get_selection is not supported by this Nexus version.");
    }

    const selection = await host.getSelection(windowId);
    if (!selection) {
      return toolErrorContent(noWindowMessage(windowId));
    }
    if (selection.ok === false) {
      if (selection.reason === "no-window") {
        return toolErrorContent(noWindowMessage(windowId));
      }
      if (selection.reason === "timeout") {
        return toolErrorContent("Timed out waiting for the Nexus editor window to report its selection.");
      }
      return toolErrorContent(
        selection.message || `Could not read the editor selection (${selection.reason ?? "unknown"}).`
      );
    }
    return toolTextContent(selection);
  }

  if (name === "nexus_replace_document") {
    const markdown = typeof args?.markdown === "string" ? args.markdown : null;
    if (markdown === null) {
      return toolErrorContent("nexus_replace_document requires a string 'markdown' argument.");
    }

    if (typeof host.requestReplaceDocument !== "function") {
      return toolTextContent({ applied: false, reason: "not-implemented" });
    }

    const windowId = typeof args?.windowId === "string" ? args.windowId : undefined;
    const result = await host.requestReplaceDocument({
      windowId,
      markdown,
      clientLabel: requestContext.clientLabel || lastClientLabel || "unknown"
    });

    return toolTextContent(result);
  }

  const clientLabel = requestContext.clientLabel || lastClientLabel || "unknown";

  if (name === "nexus_apply_edits") {
    if (typeof host.requestApplyEdits !== "function") {
      return toolErrorContent("nexus_apply_edits is not supported by this Nexus version.");
    }
    const edits = Array.isArray(args?.edits) ? args.edits : null;
    if (!edits || edits.length === 0) {
      return toolErrorContent(
        "nexus_apply_edits requires a non-empty 'edits' array of { find, replace } objects."
      );
    }
    const windowId = typeof args?.windowId === "string" ? args.windowId : undefined;
    const result = await host.requestApplyEdits({ windowId, edits, clientLabel });
    return writeResultToToolContent(result, windowId);
  }

  if (name === "nexus_replace_section") {
    if (typeof host.requestReplaceSection !== "function") {
      return toolErrorContent("nexus_replace_section is not supported by this Nexus version.");
    }
    if (typeof args?.markdown !== "string") {
      return toolErrorContent(
        "nexus_replace_section requires a string 'markdown' value (the new section content)."
      );
    }

    const selector = {};
    if (Number.isInteger(args?.index)) {
      selector.index = args.index;
    }
    if (typeof args?.slug === "string" && args.slug.length > 0) {
      selector.slug = args.slug;
    }
    if (typeof args?.heading === "string" && args.heading.length > 0) {
      selector.heading = args.heading;
    }
    if (selector.index === undefined && selector.slug === undefined && selector.heading === undefined) {
      return toolErrorContent(
        "nexus_replace_section requires one of 'index', 'slug', or 'heading' to identify the section."
      );
    }

    const windowId = typeof args?.windowId === "string" ? args.windowId : undefined;
    const result = await host.requestReplaceSection({
      windowId,
      selector,
      markdown: args.markdown,
      clientLabel
    });
    return writeResultToToolContent(result, windowId);
  }

  if (name === "nexus_set_frontmatter") {
    if (typeof host.requestSetFrontmatter !== "function") {
      return toolErrorContent("nexus_set_frontmatter is not supported by this Nexus version.");
    }
    const set =
      args?.set && typeof args.set === "object" && !Array.isArray(args.set) ? args.set : undefined;
    const remove = Array.isArray(args?.remove) ? args.remove : undefined;
    if (!set && !remove) {
      return toolErrorContent(
        "nexus_set_frontmatter requires 'set' (an object of fields) and/or 'remove' (an array of keys)."
      );
    }

    const windowId = typeof args?.windowId === "string" ? args.windowId : undefined;
    const result = await host.requestSetFrontmatter({ windowId, set, remove, clientLabel });
    return writeResultToToolContent(result, windowId);
  }

  return toolErrorContent(`Unknown tool: ${name}`);
}

async function handleJsonRpc(message, requestContext) {
  if (!message || typeof message !== "object" || message.jsonrpc !== "2.0") {
    return jsonRpcError(message?.id, -32600, "Invalid Request");
  }

  const { id, method, params } = message;

  if (method === "initialize") {
    const clientName = params?.clientInfo?.name;
    const clientVersion = params?.clientInfo?.version;
    if (typeof clientName === "string" && clientName.length > 0) {
      lastClientLabel =
        typeof clientVersion === "string" && clientVersion.length > 0
          ? `${clientName} ${clientVersion}`
          : clientName;
    }

    return jsonRpcResult(id, {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: pkgVersion }
    });
  }

  if (method === "notifications/initialized" || method === "initialized") {
    return null;
  }

  if (method === "tools/list") {
    return jsonRpcResult(id, {
      tools: [...READ_ONLY_TOOLS, WRITE_TOOL, ...WRITE_TOOLS]
    });
  }

  if (method === "tools/call") {
    const toolName = params?.name;
    const toolArgs = params?.arguments;
    if (typeof toolName !== "string") {
      return jsonRpcError(id, -32602, "Missing tool name");
    }

    try {
      const result = await dispatchToolCall(toolName, toolArgs, requestContext);
      return jsonRpcResult(id, result);
    } catch (error) {
      return jsonRpcError(id, -32603, "Internal error", {
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (method === "ping") {
    return jsonRpcResult(id, {});
  }

  return jsonRpcError(id, -32601, `Method not found: ${method}`);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalLength = 0;
    const maxBytes = 4 * 1024 * 1024;

    req.on("data", (chunk) => {
      totalLength += chunk.length;
      if (totalLength > maxBytes) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handleRequest(req, res) {
  const remote = req.socket.remoteAddress || "";
  if (remote !== "127.0.0.1" && remote !== "::1" && remote !== "::ffff:127.0.0.1") {
    res.writeHead(403).end();
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Session-Id"
    });
    res.end();
    return;
  }

  const requestUrl = new URL(req.url, "http://localhost");

  // Simple, unauthenticated landing page so a user can open the server URL (local or the public ngrok
  // URL) in a browser and confirm it is reachable. It exposes no document content or tools — just a
  // static "it's working" message — so it is safe without the bearer token, which a browser GET would
  // not send anyway.
  if (requestUrl.pathname === "/" || requestUrl.pathname === "/index.html") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" }).end();
      return;
    }
    sendHtml(res, 200, LANDING_PAGE_HTML);
    return;
  }

  // Lightweight verification endpoint: confirms the server is reachable and (in bearer mode) that the
  // token is accepted, over the same loopback bind and auth as /mcp. Used by the Preferences "Test
  // setup" button to probe both the local server and, when connected, the public ngrok URL.
  if (requestUrl.pathname === "/health") {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" }).end();
      return;
    }

    if (currentConfig.authMode !== "none") {
      const provided = extractBearerToken(req.headers["authorization"]);
      if (!compareTokens(provided, currentConfig.bearerToken)) {
        sendJson(res, 401, { ok: false, error: "unauthorized" }, unauthorizedChallengeHeaders(req));
        return;
      }
    }

    sendJson(res, 200, {
      ok: true,
      name: SERVER_NAME,
      version: pkgVersion,
      protocolVersion: MCP_PROTOCOL_VERSION,
      authMode: currentConfig.authMode,
      time: new Date().toISOString()
    });
    return;
  }

  // OAuth 2.1 surface (discovery, registration, consent, token) for MCP clients that require the MCP
  // authorization spec, such as ChatGPT custom connectors. Active only in bearer-token mode: the flow
  // ends by issuing the static bearer token, so in "none" mode there is nothing to issue (and nothing
  // returns 401, so spec-following clients never look for it).
  const oauthActive = currentConfig.authMode !== "none";
  const pathname = requestUrl.pathname;

  if (
    pathname === "/.well-known/oauth-protected-resource" ||
    pathname === "/.well-known/oauth-protected-resource/mcp"
  ) {
    if (!oauthActive) {
      res.writeHead(404).end();
      return;
    }
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" }).end();
      return;
    }
    sendJson(res, 200, mcpOauth.getProtectedResourceMetadata(getRequestOrigin(req)));
    return;
  }

  if (
    pathname === "/.well-known/oauth-authorization-server" ||
    pathname === "/.well-known/oauth-authorization-server/mcp" ||
    pathname === "/.well-known/openid-configuration"
  ) {
    if (!oauthActive) {
      res.writeHead(404).end();
      return;
    }
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" }).end();
      return;
    }
    sendJson(res, 200, mcpOauth.getAuthorizationServerMetadata(getRequestOrigin(req)));
    return;
  }

  if (pathname === "/register") {
    if (!oauthActive) {
      res.writeHead(404).end();
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" }).end();
      return;
    }
    let registrationBody;
    try {
      registrationBody = await readRequestBody(req);
    } catch {
      sendJson(res, 400, { error: "invalid_client_metadata" });
      return;
    }
    const registration = mcpOauth.handleRegistration(registrationBody);
    sendJson(res, registration.status, registration.body);
    return;
  }

  if (pathname === "/authorize") {
    if (!oauthActive) {
      res.writeHead(404).end();
      return;
    }
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" }).end();
      return;
    }
    respondAuthorizationOutcome(res, mcpOauth.beginAuthorization(requestUrl.searchParams));
    return;
  }

  if (pathname === "/authorize/decision") {
    if (!oauthActive) {
      res.writeHead(404).end();
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" }).end();
      return;
    }
    let decisionBody;
    try {
      decisionBody = await readRequestBody(req);
    } catch {
      sendHtml(res, 400, buildOauthErrorPageHtml("The request could not be read."), OAUTH_PAGE_HEADERS);
      return;
    }
    respondAuthorizationOutcome(res, mcpOauth.decideAuthorization(new URLSearchParams(decisionBody)));
    return;
  }

  if (pathname === "/token") {
    if (!oauthActive) {
      res.writeHead(404).end();
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" }).end();
      return;
    }
    let tokenBody;
    try {
      tokenBody = await readRequestBody(req);
    } catch {
      sendJson(res, 400, { error: "invalid_request" });
      return;
    }
    const tokenResult = mcpOauth.exchangeAuthorizationCode(
      new URLSearchParams(tokenBody),
      currentConfig.bearerToken
    );
    sendJson(res, tokenResult.status, tokenResult.body);
    return;
  }

  if (req.url !== "/mcp") {
    res.writeHead(404).end();
    return;
  }

  if (req.method === "GET") {
    res.writeHead(405, { Allow: "POST" }).end();
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { Allow: "POST" }).end();
    return;
  }

  if (currentConfig.authMode !== "none") {
    const provided = extractBearerToken(req.headers["authorization"]);
    if (!compareTokens(provided, currentConfig.bearerToken)) {
      sendJson(res, 401, jsonRpcError(null, -32001, "Unauthorized"), unauthorizedChallengeHeaders(req));
      return;
    }
  }

  let bodyText;
  try {
    bodyText = await readRequestBody(req);
  } catch (error) {
    sendJson(res, 400, jsonRpcError(null, -32700, "Failed to read request body"));
    return;
  }

  let parsed;
  try {
    parsed = bodyText.length > 0 ? JSON.parse(bodyText) : null;
  } catch {
    sendJson(res, 400, jsonRpcError(null, -32700, "Parse error"));
    return;
  }

  const requestContext = { clientLabel: lastClientLabel };

  if (Array.isArray(parsed)) {
    const responses = [];
    for (const message of parsed) {
      const response = await handleJsonRpc(message, requestContext);
      if (response !== null) {
        responses.push(response);
      }
    }
    if (responses.length === 0) {
      res.writeHead(202).end();
      return;
    }
    sendJson(res, 200, responses);
    return;
  }

  const response = await handleJsonRpc(parsed, requestContext);
  if (response === null) {
    res.writeHead(202).end();
    return;
  }
  sendJson(res, 200, response);
}

function startListening(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      handleRequest(req, res).catch(() => {
        try {
          res.writeHead(500).end();
        } catch {
          // Response may already be closed.
        }
      });
    });

    const onError = (error) => {
      server.removeListener("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.removeListener("error", onError);
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      resolve({ server, port: actualPort });
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, SERVER_BIND_HOST);
  });
}

function stopListening() {
  return new Promise((resolve) => {
    if (!httpServer) {
      resolve();
      return;
    }
    const server = httpServer;
    httpServer = null;
    listeningPort = 0;
    server.close(() => resolve());
  });
}

async function configure(nextConfig) {
  const enabled = Boolean(nextConfig?.enabled);
  const port = Number.isInteger(nextConfig?.port) ? nextConfig.port : 0;
  const authMode = nextConfig?.authMode === "none" ? "none" : "bearer";
  const bearerToken = typeof nextConfig?.bearerToken === "string" ? nextConfig.bearerToken : "";
  const credentialsReady = authMode === "none" || bearerToken.length > 0;

  mcpOauth.configure({
    clientStorePath:
      typeof nextConfig?.oauthClientStorePath === "string" ? nextConfig.oauthClientStorePath : null
  });

  if (!enabled || !credentialsReady) {
    await stopListening();
    currentConfig = { enabled: false, port, authMode, bearerToken };
    mcpOauth.clearVolatileState();
    if (typeof host?.rejectAllPendingWrites === "function") {
      host.rejectAllPendingWrites("server-disabled");
    }
    return { ok: true, listening: false };
  }

  if (httpServer && httpServer.listening && currentConfig.port === port) {
    currentConfig = { enabled, port, authMode, bearerToken };
    return { ok: true, listening: true, port: listeningPort };
  }

  await stopListening();

  try {
    const { server, port: actualPort } = await startListening(port);
    httpServer = server;
    listeningPort = actualPort;
    currentConfig = { enabled, port: actualPort, authMode, bearerToken };
    return { ok: true, listening: true, port: actualPort };
  } catch (error) {
    currentConfig = { enabled: false, port, authMode, bearerToken };
    return {
      ok: false,
      listening: false,
      error: error?.code || (error instanceof Error ? error.message : "ELISTEN")
    };
  }
}

async function stop() {
  await stopListening();
  currentConfig = { enabled: false, port: 0, authMode: "bearer", bearerToken: "" };
  mcpOauth.clearVolatileState();
}

// GET a URL with an optional bearer token and a timeout, resolving a probe result. Used to verify the
// server's own /health endpoint over loopback and (optionally) the public ngrok URL.
function httpGetJson(targetUrl, token, timeoutMs) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch {
      resolve({ ok: false, error: "invalid-url" });
      return;
    }

    const transport = parsed.protocol === "https:" ? https : http;
    const headers = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const request = transport.request(
      {
        method: "GET",
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        path: `${parsed.pathname}${parsed.search}`,
        headers,
        timeout: timeoutMs
      },
      (response) => {
        const status = response.statusCode ?? 0;
        // The body is small and we only need the status; drain it so the socket can close.
        response.on("data", () => {});
        response.on("end", () => {
          resolve({ ok: status >= 200 && status < 300, status });
        });
      }
    );

    request.on("timeout", () => {
      request.destroy();
      resolve({ ok: false, error: "timeout" });
    });
    request.on("error", (error) => {
      resolve({ ok: false, error: error && error.code ? error.code : "request-failed" });
    });
    request.end();
  });
}

// Verify the running server: probe the loopback /health with the active token, and — when a public
// ngrok URL is supplied — probe that too, so the Preferences "Test setup" button can confirm both.
async function testConnection(options = {}) {
  const ngrokUrl =
    typeof options.ngrokUrl === "string" && options.ngrokUrl.length > 0 ? options.ngrokUrl : null;

  if (!httpServer || !httpServer.listening) {
    return { local: { ok: false, error: "not-running" }, ngrok: null };
  }

  const token = currentConfig.authMode === "bearer" ? currentConfig.bearerToken : "";
  const local = await httpGetJson(`http://${SERVER_BIND_HOST}:${listeningPort}/health`, token, 4000);

  let ngrok = null;
  if (ngrokUrl) {
    const base = ngrokUrl.replace(/\/+$/, "");
    const probe = await httpGetJson(`${base}/health`, token, 8000);
    ngrok = { url: ngrokUrl, ...probe };
  }

  return { local, ngrok };
}

// The full tool catalog the server advertises over `tools/list`. Exposed so the in-app AI chat
// panel can offer exactly the same tools the network MCP server does (no drift between the two).
function listTools() {
  return [...READ_ONLY_TOOLS, WRITE_TOOL, ...WRITE_TOOLS];
}

// Invoke a tool through the very same dispatch path the JSON-RPC server uses, so an in-app caller
// (the AI chat panel) and an external MCP client get identical behavior — including routing writes
// through the in-app diff confirmation. `clientLabel` is what the write-confirmation dialog shows.
function callTool(name, args, context) {
  const clientLabel =
    context && typeof context.clientLabel === "string" && context.clientLabel
      ? context.clientLabel
      : lastClientLabel || "unknown";
  return dispatchToolCall(name, args, { clientLabel });
}

module.exports = {
  setHost,
  configure,
  stop,
  getListeningInfo,
  getLastClientLabel,
  testConnection,
  listTools,
  callTool
};
