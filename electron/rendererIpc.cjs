function sameRendererUrl(actual, expected) {
  try {
    const actualUrl = new URL(actual);
    const expectedUrl = new URL(expected);
    // Heading navigation is still the same editor document.
    actualUrl.hash = "";
    expectedUrl.hash = "";
    return actualUrl.href === expectedUrl.href;
  } catch {
    return false;
  }
}

function isTrustedRendererEvent(event, trustedRenderers) {
  try {
    const expected = trustedRenderers.get(event.sender);
    return Boolean(expected && !event.sender.isDestroyed() && event.senderFrame &&
      event.senderFrame === event.sender.mainFrame && sameRendererUrl(event.senderFrame.url, expected));
  } catch {
    // A frame may have disappeared between receipt and validation.
    return false;
  }
}

const isRecord = (value) => value !== null && typeof value === "object" &&
  !Array.isArray(value) && !ArrayBuffer.isView(value);
const isString = (value) => typeof value === "string";
const optionalString = (value) => value == null || isString(value);
const optionalRecord = (value) => value == null || isRecord(value);

// These fields reach file writes, secrets, or confirmation decisions. Other channels retain their
// existing domain validation, but every handler below still requires a registered editor frame.
function isValidRendererPayload(channel, args) {
  if (args.length > 1) return false;
  const payload = args[0];
  switch (channel) {
    case "asset:inspect": case "asset:action":
      return isRecord(payload) && optionalString(payload.documentPath) && isString(payload.source) && payload.source.length > 0 &&
        payload.source.length <= 60 * 1024 * 1024 && (channel === "asset:inspect" || ["embed", "extract", "replace", "locate"].includes(payload.action));
    case "folder:open": case "folder:close":
      return args.length === 0;
    case "folder:list": case "folder:read": case "folder:reveal":
      return isRecord(payload) && isString(payload.rootId) && payload.rootId.length > 0 && isString(payload.path);
    case "folder:mutate":
      return isRecord(payload) && isString(payload.rootId) && payload.rootId.length > 0 && isString(payload.path) &&
        ["newFile", "newFolder", "rename", "copy", "move", "trash"].includes(payload.action) &&
        (payload.action === "trash" || (isString(payload.name) && payload.name.length > 0)) &&
        optionalString(payload.destination);
    case "file:read": case "file:watch": case "recent:open": case "image:to-data-url":
      return isString(payload) && payload.length > 0;
    case "quickconnect:get-token": case "mcp:get-bearer-token":
      return optionalString(payload);
    case "quickconnect:set-token": case "mcp:set-bearer-token":
      return isRecord(payload) && optionalString(payload.profileName) && isString(payload.token);
    case "ai:get-key": case "ai:set-key":
      return isRecord(payload) && optionalString(payload.profileName) &&
        isString(payload.providerId) && (channel === "ai:get-key" || isString(payload.key));
    case "file:save":
      return isRecord(payload) && isString(payload.filePath) && payload.filePath.length > 0 &&
        isString(payload.markdown) && (payload.diagramNames === undefined ||
          (Array.isArray(payload.diagramNames) && payload.diagramNames.every(isString)));
    case "file:choose-save-path":
      return isRecord(payload) && optionalString(payload.currentPath) && (payload.kind === undefined || payload.kind === "text");
    case "file:export-html": case "file:export-word":
    case "file:export-pdf": case "file:preview-pdf": case "clipboard:copy-html-document":
      return isRecord(payload) && optionalString(payload.currentPath) && isString(payload.markdown) &&
        optionalRecord(payload.options);
    case "file:save-pdf-preview":
      return isRecord(payload) && optionalString(payload.currentPath) &&
        payload.data instanceof Uint8Array;
    case "diagram:write-svg":
      return isRecord(payload) && isString(payload.documentPath) && isString(payload.svgText) &&
        ["drawio", "isoflow"].includes(payload.kind);
    case "app:resolve-close-request":
      return typeof payload === "boolean";
    case "mcp:write-decision":
      return isRecord(payload) && isString(payload.requestId) &&
        ["approve", "reject"].includes(payload.decision);
    case "sftp:host-key-decision":
      return isRecord(payload) && isString(payload.requestId) &&
        ["accept", "reject"].includes(payload.decision);
    case "mcp:selection-result":
      return isRecord(payload) && isString(payload.requestId) && isRecord(payload.selection);
    case "mcp:register-window": case "mcp:update-window-state": case "menu:set-state":
      return isRecord(payload);
    case "ai:chat-abort":
      return isRecord(payload) && isString(payload.requestId);
    case "ai:chat-stream":
      return isRecord(payload) && isString(payload.requestId) && payload.requestId.length > 0 &&
        isRecord(payload.payload) && isString(payload.payload.providerId) &&
        isRecord(payload.payload.config) && Array.isArray(payload.payload.messages);
    default:
      return true;
  }
}

function createRendererIpc(ipcMain, trustedRenderers) {
  return {
    handle(channel, listener) {
      ipcMain.handle(channel, (event, ...args) => {
        if (!isTrustedRendererEvent(event, trustedRenderers)) throw new Error("Untrusted IPC sender.");
        if (!isValidRendererPayload(channel, args)) throw new Error("Invalid IPC payload.");
        return listener(event, ...args);
      });
    },
    on(channel, listener) {
      ipcMain.on(channel, (event, ...args) => {
        // Rejected fire-and-forget messages must not throw through Electron's event emitter.
        if (isTrustedRendererEvent(event, trustedRenderers) && isValidRendererPayload(channel, args)) {
          listener(event, ...args);
        }
      });
    }
  };
}

function isPendingRequestOwner(event, pending) {
  return Boolean(pending && pending.webContentsId === event.sender.id);
}

module.exports = { sameRendererUrl, isTrustedRendererEvent, isValidRendererPayload, createRendererIpc, isPendingRequestOwner };
