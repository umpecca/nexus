import { Minus, Plus } from "lucide-react";

export type StatusBarProps = {
  statusText: string;
  isDirty: boolean;
  maxZoom: number;
  minZoom: number;
  onZoomChange: (zoomPercent: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  zoomPercent: number;
};

/** Status text + dirty marker on the left, a UI-scale zoom slider on the right. */
function StatusBar({
  statusText,
  isDirty,
  maxZoom,
  minZoom,
  onZoomChange,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  zoomPercent
}: StatusBarProps) {
  return (
    <footer className="nexus-statusbar">
      <div className="nexus-statusbar-left">
        <span className="nexus-statusbar-item">{statusText}</span>
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
