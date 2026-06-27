import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Isoflow from "isoflow";
import domtoimage from "dom-to-image-more";
import { icons, defaultColors } from "./icons";
import { buildIsoflowEditableSvg, buildIsoflowImageDataUrl } from "../lib/isoflowSvg";
import { cropToContent } from "../lib/pngCrop";

/**
 * The React app that runs inside Nexus's isoflow editor window (`isoflow-host.html`).
 *
 * It mounts an editable `<Isoflow>` and adds a thin top bar with Save / Cancel — isoflow's own menu
 * only exports to a file, so we provide our own "commit back to the document" affordance. The initial
 * model arrives from the Electron main process over the `nexusIsoflowHost` preload bridge (or is
 * `null` for a brand-new diagram); every change is captured via `onModelUpdated`.
 *
 * Producing the inline image on Save mirrors isoflow's own ExportImageDialog: rather than snapshotting
 * the live editor (which is wrapped in toolbars), we briefly mount a hidden, chrome-free
 * `NON_INTERACTIVE` `<Isoflow>` of the current model with `fitToView`, then `dom-to-image` that
 * wrapper. The PNG is wrapped in an editable SVG that also carries the source model (see
 * `lib/isoflowSvg.ts`) so the picture is portable Markdown everywhere and reopens here in Nexus.
 */
type Model = Record<string, unknown>;

const DEFAULT_EXPORT_SIZE = { width: 900, height: 640 };
// Let paper.js finish drawing connectors in the hidden export instance before snapshotting.
const EXPORT_SETTLE_MS = 900;
// Supersample the snapshot so the (raster) diagram stays crisp when resized up on the page.
const CAPTURE_SCALE = 2;
// Transparent margin (px, display size) kept around the cropped diagram.
const CAPTURE_PADDING = 24;

export function IsoflowHostApp() {
  // `undefined` = still waiting for main to send the initial model; `null` = brand-new diagram.
  const [initialModel, setInitialModel] = useState<Model | null | undefined>(undefined);
  const [phase, setPhase] = useState<"edit" | "exporting">("edit");
  // Whether the editor canvas has a real (non-zero) size yet. isoflow's `fitToView` measures its
  // renderer on mount and, if that measures 0×0 (the window hasn't been laid out yet — common for a
  // freshly-opened modal), locks zoom to 0 and never recovers, leaving the diagram invisible. So we
  // hold the editor back until the canvas reports a usable size.
  const [canvasReady, setCanvasReady] = useState(false);
  const latestModel = useRef<Model | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const exportSize = useRef(DEFAULT_EXPORT_SIZE);
  const exported = useRef(false);

  // Mount isoflow only once the canvas size is non-zero AND stable across two animation frames.
  // isoflow runs `fitToView` exactly once, on its initial load, measuring its renderer with
  // getBoundingClientRect — and it never re-fits afterwards. A freshly-opened modal window reports a
  // mid-layout transient size (0, or a partial size) on the first frame(s); if isoflow loads then, it
  // locks the zoom to ~0 and the diagram stays invisible. Waiting for the size to settle guarantees
  // that one-shot fit uses the final layout.
  useLayoutEffect(() => {
    if (initialModel === undefined) return;
    const el = canvasRef.current;
    if (!el) return;
    let raf = 0;
    let fallback = 0;
    let cancelled = false;
    let prevW = -1;
    let prevH = -1;
    const open = () => {
      if (!cancelled) setCanvasReady(true);
    };
    const tick = () => {
      if (cancelled) return;
      const rect = el.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (w > 0 && h > 0 && w === prevW && h === prevH) {
        open();
        return;
      }
      prevW = w;
      prevH = h;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // Fallback: if rAF never confirms two stable frames (e.g. it is throttled), open anyway once the
    // canvas has a non-zero size, so the editor always appears.
    fallback = window.setTimeout(() => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) open();
    }, 400);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearTimeout(fallback);
    };
  }, [initialModel]);

  useEffect(() => {
    const host = window.nexusIsoflowHost;
    if (!host) {
      // Opened outside Electron (e.g. the Vite page directly) — start with a blank diagram.
      setInitialModel(null);
      return;
    }
    host.onInit((model) => {
      setInitialModel((model as Model) ?? null);
    });
    host.ready();
  }, []);

  const handleModelUpdated = useCallback((model: Model) => {
    latestModel.current = model;
  }, []);

  const runCapture = useCallback(async () => {
    if (exported.current) return;
    exported.current = true;
    const node = exportRef.current;
    const host = window.nexusIsoflowHost;
    const { width, height } = exportSize.current;
    if (!node || !host) {
      setPhase("edit");
      exported.current = false;
      return;
    }
    try {
      // Snapshot transparent (no bgcolor) at CAPTURE_SCALE× via the dom-to-image upscale trick.
      const rawPng = await domtoimage.toPng(node, {
        width: width * CAPTURE_SCALE,
        height: height * CAPTURE_SCALE,
        style: {
          transform: `scale(${CAPTURE_SCALE})`,
          transformOrigin: "top left",
          width: `${width}px`,
          height: `${height}px`
        },
        cacheBust: true
      });
      // Crop the editor-canvas-sized snapshot down to just the diagram; cropW/cropH are the 1× display
      // dimensions, while the PNG keeps the 2× pixels for crisp upscaling.
      const { dataUrl: croppedPng, width: cropW, height: cropH } = await cropToContent(rawPng, {
        padding: CAPTURE_PADDING,
        scale: CAPTURE_SCALE
      });
      const source = latestModel.current ?? initialModel ?? { items: [], views: [] };
      // Persist a "lean" model without the (large) icon library; it is re-injected on every open.
      const leanModel: Model = { ...(source as Model), icons: [] };
      const svg = buildIsoflowEditableSvg(croppedPng, cropW, cropH, leanModel);
      host.save({ dataUrl: buildIsoflowImageDataUrl(svg), model: leanModel });
    } catch (error) {
      console.error("Failed to snapshot the isoflow diagram:", error);
      // Let the user retry rather than closing on a transient snapshot failure.
      setPhase("edit");
      exported.current = false;
    }
  }, [initialModel]);

  // The hidden export instance signals readiness via onModelUpdated; settle, then snapshot once.
  const handleExportReady = useCallback(() => {
    if (exported.current) return;
    window.setTimeout(() => {
      void runCapture();
    }, EXPORT_SETTLE_MS);
  }, [runCapture]);

  function handleSave() {
    if (phase === "exporting") return;
    const rect = canvasRef.current?.getBoundingClientRect();
    exportSize.current = {
      width: Math.max(1, Math.round(rect?.width || DEFAULT_EXPORT_SIZE.width)),
      height: Math.max(1, Math.round(rect?.height || DEFAULT_EXPORT_SIZE.height))
    };
    exported.current = false;
    setPhase("exporting");
  }

  function handleCancel() {
    window.nexusIsoflowHost?.cancel();
  }

  // Memoise the data handed to isoflow so its identity is STABLE across incidental host re-renders.
  // isoflow reloads (and resets) its model whenever `initialData`'s reference changes, so an
  // unmemoised object would wipe the user's in-progress edits on every re-render.
  const editData = useMemo(() => {
    const b = (initialModel ?? {}) as Model;
    const sc = b.colors as unknown[] | undefined;
    return { ...b, icons, colors: sc && sc.length > 0 ? sc : defaultColors, fitToView: true };
  }, [initialModel]);
  // Recomputed when entering the export phase so it captures the latest edited model (a ref).
  const exportData = useMemo(
    () => ({ ...((latestModel.current ?? initialModel ?? {}) as Model), icons, fitToView: true }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase, initialModel]
  );

  if (initialModel === undefined) {
    return null; // brief: waiting for the initial model from the main process
  }

  const exporting = phase === "exporting";

  return (
    <div className="isoflow-host">
      <div className="isoflow-host__bar">
        <span className="isoflow-host__title">Edit isoflow diagram</span>
        <div className="isoflow-host__actions">
          <button type="button" onClick={handleCancel} disabled={exporting}>
            Cancel
          </button>
          <button
            type="button"
            className="isoflow-host__primary"
            onClick={handleSave}
            disabled={exporting}
          >
            {exporting ? "Saving…" : "Save & insert"}
          </button>
        </div>
      </div>

      <div className="isoflow-host__canvas" ref={canvasRef}>
        {canvasReady ? (
          <Isoflow
            editorMode="EDITABLE"
            initialData={editData as never}
            onModelUpdated={handleModelUpdated as never}
            width="100%"
            height="100%"
          />
        ) : null}
      </div>

      {exporting ? (
        // Off-screen, chrome-free render used solely to snapshot a clean diagram image.
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            left: -100000,
            top: 0,
            width: exportSize.current.width,
            height: exportSize.current.height,
            overflow: "hidden",
            pointerEvents: "none"
          }}
        >
          <div ref={exportRef} style={{ width: exportSize.current.width, height: exportSize.current.height }}>
            <Isoflow
              editorMode="NON_INTERACTIVE"
              initialData={exportData as never}
              onModelUpdated={handleExportReady as never}
              // Transparent + no grid so the snapshot is just the diagram on empty margins (cropped tight).
              renderer={{ showGrid: false, backgroundColor: "transparent" } as never}
              width="100%"
              height="100%"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
