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
  EditorPageOrientation,
  EditorPageSize,
  EditorThemePreference
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
  EDITOR_PAGE_ORIENTATION_OPTIONS,
  EDITOR_PAGE_SIZE_OPTIONS,
  EDITOR_PARAGRAPH_SPACING_MAX_PIXELS,
  EDITOR_PARAGRAPH_SPACING_MIN_PIXELS,
  EDITOR_PARAGRAPH_SPACING_STEP_PIXELS,
  EDITOR_THEME_OPTIONS
} from "../../lib/settings";

type SettingsDialogProps = {
  fontFamily: EditorFontFamily;
  fontSizePixels: number;
  onFontFamilyChange: (fontFamily: EditorFontFamily) => void;
  onFontSizePixelsChange: (fontSizePixels: number) => void;
  onPageMarginsChange: (pageMargins: EditorPageMargins) => void;
  onPageOrientationChange: (pageOrientation: EditorPageOrientation) => void;
  onPageSizeChange: (pageSize: EditorPageSize) => void;
  onParagraphSpacingPixelsChange: (paragraphSpacingPixels: number) => void;
  onResetSettings: () => void;
  onThemePreferenceChange: (themePreference: EditorThemePreference) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pageMargins: EditorPageMargins;
  pageOrientation: EditorPageOrientation;
  pageSize: EditorPageSize;
  paragraphSpacingPixels: number;
  profileName: string;
  themePreference: EditorThemePreference;
};

function clampFontSize(value: number) {
  return Math.min(EDITOR_FONT_SIZE_MAX_PIXELS, Math.max(EDITOR_FONT_SIZE_MIN_PIXELS, value));
}

function clampMargin(value: number) {
  return Math.min(EDITOR_PAGE_MARGIN_MAX_INCHES, Math.max(EDITOR_PAGE_MARGIN_MIN_INCHES, value));
}

function clampParagraphSpacing(value: number) {
  return Math.min(
    EDITOR_PARAGRAPH_SPACING_MAX_PIXELS,
    Math.max(EDITOR_PARAGRAPH_SPACING_MIN_PIXELS, value)
  );
}

function formatNumber(value: number) {
  return String(value);
}

function SettingsDialog({
  fontFamily,
  fontSizePixels,
  onFontFamilyChange,
  onFontSizePixelsChange,
  onPageMarginsChange,
  onPageOrientationChange,
  onPageSizeChange,
  onParagraphSpacingPixelsChange,
  onResetSettings,
  onThemePreferenceChange,
  onOpenChange,
  open,
  pageMargins,
  pageOrientation,
  pageSize,
  paragraphSpacingPixels,
  profileName,
  themePreference
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

  function handleParagraphSpacingChange(value: string) {
    const nextParagraphSpacing = Number.parseFloat(value);
    if (!Number.isFinite(nextParagraphSpacing)) {
      return;
    }

    onParagraphSpacingPixelsChange(clampParagraphSpacing(nextParagraphSpacing));
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
            <span className="nexus-settings-label">Theme</span>
            <select
              className="nexus-settings-select"
              value={themePreference}
              onChange={(event) =>
                onThemePreferenceChange(event.target.value as EditorThemePreference)
              }
            >
              {EDITOR_THEME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="nexus-settings-field">
            <span className="nexus-settings-label">Base font size</span>
            <span className="nexus-settings-input-with-unit">
              <input
                className="nexus-settings-input"
                inputMode="numeric"
                max={EDITOR_FONT_SIZE_MAX_PIXELS}
                min={EDITOR_FONT_SIZE_MIN_PIXELS}
                onChange={(event) => handleFontSizeChange(event.target.value)}
                step={EDITOR_FONT_SIZE_STEP_PIXELS}
                type="number"
                value={formatNumber(fontSizePixels)}
              />
              <span className="nexus-settings-unit">px</span>
            </span>
          </label>

          <label className="nexus-settings-field">
            <span className="nexus-settings-label">Paragraph spacing</span>
            <span className="nexus-settings-input-with-unit">
              <input
                className="nexus-settings-input"
                inputMode="numeric"
                max={EDITOR_PARAGRAPH_SPACING_MAX_PIXELS}
                min={EDITOR_PARAGRAPH_SPACING_MIN_PIXELS}
                onChange={(event) => handleParagraphSpacingChange(event.target.value)}
                step={EDITOR_PARAGRAPH_SPACING_STEP_PIXELS}
                type="number"
                value={formatNumber(paragraphSpacingPixels)}
              />
              <span className="nexus-settings-unit">px</span>
            </span>
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
                  {option.label} ({option.widthInches} x {option.heightInches} in)
                </option>
              ))}
            </select>
          </label>

          <label className="nexus-settings-field">
            <span className="nexus-settings-label">Paper orientation</span>
            <select
              className="nexus-settings-select"
              value={pageOrientation}
              onChange={(event) =>
                onPageOrientationChange(event.target.value as EditorPageOrientation)
              }
            >
              {EDITOR_PAGE_ORIENTATION_OPTIONS.map((option) => (
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
                  <span className="nexus-settings-input-with-unit">
                    <input
                      className="nexus-settings-input"
                      inputMode="decimal"
                      max={EDITOR_PAGE_MARGIN_MAX_INCHES}
                      min={EDITOR_PAGE_MARGIN_MIN_INCHES}
                      onChange={(event) => handlePageMarginChange(side.value, event.target.value)}
                      step={EDITOR_PAGE_MARGIN_STEP_INCHES}
                      type="number"
                      value={formatNumber(pageMargins[side.value])}
                    />
                    <span className="nexus-settings-unit">in</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <p className="nexus-settings-profile">Profile: {profileName}</p>
        </div>

        <DialogFooter className="nexus-settings-footer">
          <Button type="button" variant="outline" onClick={onResetSettings}>
            Reset defaults
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SettingsDialog;
