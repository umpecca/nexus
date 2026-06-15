import { Minus, PanelLeft, Plus } from "lucide-react";

export type StatusBarProps = {
  isDirty: boolean;
  maxZoom: number;
  minZoom: number;
  onToggleOutline: () => void;
  onZoomChange: (zoomPercent: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  outlineVisible: boolean;
  wordCount: number;
  zoomPercent: number;
};

/** Word 2010-style status bar: outline toggle + word count on the left, zoom slider on the right. */
function StatusBar({
  isDirty,
  maxZoom,
  minZoom,
  onToggleOutline,
  onZoomChange,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  outlineVisible,
  wordCount,
  zoomPercent
}: StatusBarProps) {
  return (
    <footer className="nexus-statusbar">
      <div className="nexus-statusbar-left">
        <button
          aria-pressed={outlineVisible}
          className="nexus-statusbar-button nexus-statusbar-toggle"
          onClick={onToggleOutline}
          title={outlineVisible ? "Hide outline" : "Show outline"}
          type="button"
        >
          <PanelLeft aria-hidden="true" />
          <span>Outline</span>
        </button>
        <span aria-hidden="true" className="nexus-statusbar-sep" />
        <span className="nexus-statusbar-item">Words: {wordCount.toLocaleString()}</span>
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
