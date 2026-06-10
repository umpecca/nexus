import { Minus, Plus } from "lucide-react";
import type { ViewMode } from "@mdxeditor/editor";

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  "rich-text": "Rich Text",
  source: "Source",
  diff: "Diff"
};

export type StatusBarProps = {
  isDirty: boolean;
  maxZoom: number;
  minZoom: number;
  onZoomChange: (zoomPercent: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  viewMode: ViewMode;
  wordCount: number;
  zoomPercent: number;
};

/** Word 2010-style status bar: word count on the left, zoom slider on the right. */
function StatusBar({
  isDirty,
  maxZoom,
  minZoom,
  onZoomChange,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  viewMode,
  wordCount,
  zoomPercent
}: StatusBarProps) {
  return (
    <footer className="nexus-statusbar">
      <div className="nexus-statusbar-left">
        <span className="nexus-statusbar-item">Words: {wordCount.toLocaleString()}</span>
        <span aria-hidden="true" className="nexus-statusbar-sep" />
        <span className="nexus-statusbar-item">{VIEW_MODE_LABELS[viewMode]}</span>
        {isDirty ? (
          <>
            <span aria-hidden="true" className="nexus-statusbar-sep" />
            <span className="nexus-statusbar-item">Unsaved changes</span>
          </>
        ) : null}
      </div>
      <div className="nexus-statusbar-right">
        <button
          className="nexus-statusbar-button nexus-statusbar-zoom-value"
          onClick={onZoomReset}
          title="Reset zoom to 100%"
          type="button"
        >
          {zoomPercent}%
        </button>
        <button
          aria-label="Zoom out"
          className="nexus-statusbar-button"
          onClick={onZoomOut}
          type="button"
        >
          <Minus aria-hidden="true" />
        </button>
        <input
          aria-label="Zoom"
          className="nexus-statusbar-zoom-slider"
          max={maxZoom}
          min={minZoom}
          onChange={(event) => onZoomChange(Number(event.target.value))}
          step={10}
          type="range"
          value={zoomPercent}
        />
        <button
          aria-label="Zoom in"
          className="nexus-statusbar-button"
          onClick={onZoomIn}
          type="button"
        >
          <Plus aria-hidden="true" />
        </button>
      </div>
    </footer>
  );
}

export default StatusBar;
