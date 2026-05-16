import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../ui/dialog";
import type {
  EditorFontFamily,
  EditorPageMargins,
  EditorPageMarginSide,
  EditorPageSize
} from "../../lib/settings";
import {
  EDITOR_FONT_OPTIONS,
  EDITOR_FONT_SIZE_MAX_PIXELS,
  EDITOR_FONT_SIZE_MIN_PIXELS,
  EDITOR_FONT_SIZE_STEP_PIXELS,
  EDITOR_PAGE_MARGIN_MAX_INCHES,
  EDITOR_PAGE_MARGIN_MIN_INCHES,
  EDITOR_PAGE_MARGIN_SIDES,
  EDITOR_PAGE_MARGIN_STEP_INCHES,
  EDITOR_PAGE_SIZE_OPTIONS
} from "../../lib/settings";

type SettingsDialogProps = {
  fontFamily: EditorFontFamily;
  fontSizePixels: number;
  onFontFamilyChange: (fontFamily: EditorFontFamily) => void;
  onFontSizePixelsChange: (fontSizePixels: number) => void;
  onPageMarginsChange: (pageMargins: EditorPageMargins) => void;
  onPageSizeChange: (pageSize: EditorPageSize) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pageMargins: EditorPageMargins;
  pageSize: EditorPageSize;
  profileName: string;
};

function clampFontSize(value: number) {
  return Math.min(EDITOR_FONT_SIZE_MAX_PIXELS, Math.max(EDITOR_FONT_SIZE_MIN_PIXELS, value));
}

function clampMargin(value: number) {
  return Math.min(EDITOR_PAGE_MARGIN_MAX_INCHES, Math.max(EDITOR_PAGE_MARGIN_MIN_INCHES, value));
}

function SettingsDialog({
  fontFamily,
  fontSizePixels,
  onFontFamilyChange,
  onFontSizePixelsChange,
  onPageMarginsChange,
  onPageSizeChange,
  onOpenChange,
  open,
  pageMargins,
  pageSize,
  profileName
}: SettingsDialogProps) {
  function handleFontSizeChange(value: string) {
    const nextFontSize = Number.parseFloat(value);
    if (!Number.isFinite(nextFontSize)) {
      return;
    }

    onFontSizePixelsChange(clampFontSize(nextFontSize));
  }

  function handlePageMarginChange(side: EditorPageMarginSide, value: string) {
    const nextMargin = Number.parseFloat(value);
    if (!Number.isFinite(nextMargin)) {
      return;
    }

    onPageMarginsChange({
      ...pageMargins,
      [side]: clampMargin(nextMargin)
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Preferences are saved for the current OS profile.</DialogDescription>
        </DialogHeader>

        <div className="nexus-settings-form">
          <label className="nexus-settings-field">
            <span className="nexus-settings-label">Editor font</span>
            <select
              className="nexus-settings-select"
              value={fontFamily}
              onChange={(event) => onFontFamilyChange(event.target.value as EditorFontFamily)}
            >
              {EDITOR_FONT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="nexus-settings-preview" style={{ fontFamily, fontSize: fontSizePixels }}>
            The quick brown fox jumps over 0123456789.
          </div>

          <label className="nexus-settings-field">
            <span className="nexus-settings-label">Base font size</span>
            <input
              className="nexus-settings-input"
              inputMode="numeric"
              max={EDITOR_FONT_SIZE_MAX_PIXELS}
              min={EDITOR_FONT_SIZE_MIN_PIXELS}
              onChange={(event) => handleFontSizeChange(event.target.value)}
              step={EDITOR_FONT_SIZE_STEP_PIXELS}
              type="number"
              value={fontSizePixels}
            />
          </label>

          <label className="nexus-settings-field">
            <span className="nexus-settings-label">Paper size</span>
            <select
              className="nexus-settings-select"
              value={pageSize}
              onChange={(event) => onPageSizeChange(event.target.value as EditorPageSize)}
            >
              {EDITOR_PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="nexus-settings-fieldset">
            <legend className="nexus-settings-label">Margins</legend>
            <div className="nexus-settings-margin-grid">
              {EDITOR_PAGE_MARGIN_SIDES.map((side) => (
                <label className="nexus-settings-margin-field" key={side.value}>
                  <span>{side.label}</span>
                  <input
                    className="nexus-settings-input"
                    inputMode="decimal"
                    max={EDITOR_PAGE_MARGIN_MAX_INCHES}
                    min={EDITOR_PAGE_MARGIN_MIN_INCHES}
                    onChange={(event) => handlePageMarginChange(side.value, event.target.value)}
                    step={EDITOR_PAGE_MARGIN_STEP_INCHES}
                    type="number"
                    value={pageMargins[side.value]}
                  />
                </label>
              ))}
            </div>
          </fieldset>

          <p className="nexus-settings-profile">Profile: {profileName}</p>
        </div>

        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SettingsDialog;
