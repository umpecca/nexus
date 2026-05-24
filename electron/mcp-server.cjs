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
      return toolErrorContent(
        windowId
          ? `No Nexus editor window matches windowId "${windowId}".`
          : "No focused Nexus editor window is available."
      );
    }
    return toolTextContent(document);
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
