// Preload for the drawio editor host window (public/drawio-host.html). drawio runs in an iframe
// there in embed mode (proto=json) and posts JSON-string protocol messages to window.parent (this
// host page); host actions (load/export/configure) must be posted back into the iframe's window.
// This bridge relays each direction over IPC so the pure session logic in electron/drawioEmbed.cjs
// (driven from the main process) never touches the DOM. It exposes nothing to the page — only
// ipcRenderer traffic, kept in the isolated preload world.
const { ipcRenderer } = require("electron");

// Where drawio lives (the iframe's contentWindow), captured from its first message so replies reach
// it. Falls back to `window` to also support a top-level drawio load.
let drawioWindow = null;

/** Normalises a postMessage payload (drawio sends JSON strings; tolerate raw objects too). */
function asProtocolMessage(data) {
  if (typeof data === "string") {
    try {
      return { raw: data, parsed: JSON.parse(data) };
    } catch {
      return null;
    }
  }
  if (data && typeof data === "object") {
    return { raw: JSON.stringify(data), parsed: data };
  }
  return null;
}

// drawio editor → main. Forward only genuine drawio events (`{ event: … }`); ignore host→drawio
// action messages and any unrelated noise.
window.addEventListener("message", (event) => {
  const message = asProtocolMessage(event.data);
  if (!message || typeof message.parsed.event !== "string") {
    return;
  }
  drawioWindow = event.source || drawioWindow;
  ipcRenderer.send("drawio:from-editor", message.raw);
});

// main → drawio editor. `payload` is the JSON string built in main; post it into drawio's window.
ipcRenderer.on("drawio:to-editor", (_event, payload) => {
  (drawioWindow || window).postMessage(payload, "*");
});
