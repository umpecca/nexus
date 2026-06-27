// Pure helpers for the isoflow editor window, kept free of Electron so they can be unit-tested in
// isolation (mirrors the `drawioEmbed.cjs` / `recentFiles.cjs` pattern). The window/IPC wiring in
// electron/main.cjs owns the lifecycle; isoflow's editor is our own React app (isoflow-host.html),
// not a third-party protocol, so the only logic worth extracting here is normalising the save
// payload the host posts back into the terminal edit result.
//
// Result shape handed back to the renderer's `editIsoflow` caller:
//   { canceled: true }                            the user closed/cancelled without saving
//   { canceled: false, dataUrl, model }           the user saved; `dataUrl` is the editable SVG and
//                                                  `model` is the source isoflow Model (JSON)

// The isoflow editor window's geometry (matches the drawio editor window).
const ISOFLOW_WINDOW = Object.freeze({
  width: 1200,
  height: 820,
  minWidth: 800,
  minHeight: 600
});

/**
 * Validates the `{ dataUrl, model }` payload the host posts on save into a terminal success result,
 * or returns null when it is not a usable save (so the caller can ignore it and keep the window open
 * / fall back to cancel-on-close).
 *
 * @param {unknown} raw
 * @returns {{ canceled: false, dataUrl: string, model: unknown } | null}
 */
function normalizeSaveResult(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const dataUrl = raw.dataUrl;
  if (typeof dataUrl !== "string" || dataUrl.length === 0) {
    return null;
  }
  return {
    canceled: false,
    dataUrl,
    model: "model" in raw ? raw.model : null
  };
}

module.exports = { ISOFLOW_WINDOW, normalizeSaveResult };
