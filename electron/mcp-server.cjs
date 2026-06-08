const http = require("node:http");
const { Buffer } = require("node:buffer");
const { timingSafeEqual } = require("node:crypto");

const SERVER_BIND_HOST = "127.0.0.1";
const SERVER_NAME = "nexus-mcp";
const MCP_PROTOCOL_VERSION = "2024-11-05";

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
      "Search the Markdown of the focused Nexus editor window (or the window identified by windowId) and return matches with 1-based line and column numbers plus a line preview. 'query' is a literal substring unless 'isRegex' is true; matching is case-insensitive unless 'caseSensitive' is true. Results are capped at 'maxResults' (default 200, max 1000); 'total' reports the full count and 'truncated' indicates more matches exist.",
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

function sendJson(res, statusCode, body) {
  const payload = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store"
  });
  res.end(payload);
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
      tools: [...READ_ONLY_TOOLS, WRITE_TOOL]
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
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Session-Id"
    });
    res.end();
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
      sendJson(res, 401, jsonRpcError(null, -32001, "Unauthorized"));
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

  if (!enabled || !credentialsReady) {
    await stopListening();
    currentConfig = { enabled: false, port, authMode, bearerToken };
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
}

module.exports = {
  setHost,
  configure,
  stop,
  getListeningInfo,
  getLastClientLabel
};
