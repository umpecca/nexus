// Pure logic for driving the drawio embed (`proto=json`) message protocol, kept free of Electron so
// it can be unit-tested in isolation (mirrors the `recentFiles.cjs` / `mcpDocumentTools.cjs` pattern).
// The thin window/IPC wiring in `electron/main.cjs` feeds each parsed message from the editor through
// `handleMessage` and acts on the returned `{ reply, result }`:
//
//   - `reply`  — a protocol message to post back into the drawio editor (or null).
//   - `result` — the terminal outcome of the edit session (or null while editing continues):
//       { canceled: true }                         the user closed/exited without saving
//       { canceled: false, dataUrl, xml }          the user saved; `dataUrl` is the editable SVG
//
// Flow: drawio posts `init` → we `load` the diagram → user edits → on `save` we ask drawio to
// `export` it as `xmlsvg` (an SVG with the source XML embedded) → the `export` reply carries the
// editable-SVG data URL we hand back. A bare `exit` (no prior save) is a cancel.

// A valid empty single-page diagram, loaded when the caller opens a brand-new diagram so drawio
// shows a blank editable canvas rather than its template picker.
const EMPTY_DIAGRAM_XML =
  '<mxGraphModel dx="800" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" ' +
  'connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" ' +
  'math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>';

// Transparent margin (px) added around the diagram in the exported SVG so outer strokes/corners are
// not cropped flush to the edge.
const DRAWIO_EXPORT_BORDER = 8;

/**
 * Creates a stateful session that turns incoming drawio protocol messages into the host's replies
 * and the terminal edit result. One session per editor window.
 *
 * @param {string} [initialXml] the diagram source to open; empty/omitted opens a blank diagram.
 */
function createDrawioSession(initialXml) {
  let latestXml = typeof initialXml === "string" ? initialXml : "";
  let saved = false;

  return {
    /**
     * @param {{ event?: string, xml?: string, data?: string, format?: string }} message
     * @returns {{ reply: object | null, result: object | null }}
     */
    handleMessage(message) {
      const event = message && typeof message === "object" ? message.event : undefined;

      switch (event) {
        // Sent first when `configure=1`; we have no custom config, so acknowledge and move on.
        case "configure":
          return { reply: { action: "configure", config: {} }, result: null };

        // drawio is ready: load the diagram (a non-empty source, or the blank template).
        case "init":
          return {
            reply: { action: "load", xml: latestXml || EMPTY_DIAGRAM_XML, autosave: 0 },
            result: null
          };

        // User saved: remember the source and ask drawio to hand back an editable SVG. The `border`
        // adds a small transparent margin so the diagram's outer stroke is not cropped flush to the
        // SVG edge (drawio otherwise crops tight to the geometry, clipping shape outlines/corners).
        case "save":
          saved = true;
          if (typeof message.xml === "string") {
            latestXml = message.xml;
          }
          return { reply: { action: "export", format: "xmlsvg", border: DRAWIO_EXPORT_BORDER }, result: null };

        // The editable SVG drawio produced for our export request — the successful outcome.
        case "export":
          if (typeof message.data === "string" && message.data.length > 0) {
            return {
              reply: null,
              result: {
                canceled: false,
                dataUrl: message.data,
                xml: typeof message.xml === "string" && message.xml ? message.xml : latestXml
              }
            };
          }
          return { reply: null, result: null };

        // A bare exit cancels; an exit *after* a save is ignored — the `export` result is terminal.
        case "exit":
          return { reply: null, result: saved ? null : { canceled: true } };

        default:
          return { reply: null, result: null };
      }
    }
  };
}

module.exports = { createDrawioSession, EMPTY_DIAGRAM_XML, DRAWIO_EXPORT_BORDER };
