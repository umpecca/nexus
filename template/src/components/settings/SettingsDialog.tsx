import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../ui/dialog";
import {
  APP_FONT_OPTIONS,
  APP_THEME_OPTIONS,
  type AppFontFamily,
  type AppThemePreference
} from "../../lib/settings";

type SettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  themePreference: AppThemePreference;
  fontFamily: AppFontFamily;
  sampleToggle: boolean;
  onThemeChange: (themePreference: AppThemePreference) => void;
  onFontChange: (fontFamily: AppFontFamily) => void;
  onSampleToggleChange: (value: boolean) => void;
  onResetSettings: () => void;
};

function SettingsDialog({
  open,
  onOpenChange,
  themePreference,
  fontFamily,
  sampleToggle,
  onThemeChange,
  onFontChange,
  onSampleToggleChange,
  onResetSettings
}: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Preferences are saved on this device.</DialogDescription>
        </DialogHeader>

        <div className="nexus-settings-form">
          <label className="nexus-settings-field">
            <span className="nexus-settings-label">Theme</span>
            <select
              className="nexus-settings-select"
              value={themePreference}
              onChange={(event) => onThemeChange(event.target.value as AppThemePreference)}
            >
              {APP_THEME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="nexus-settings-field">
            <span className="nexus-settings-label">Font</span>
            <select
              className="nexus-settings-select"
              value={fontFamily}
              onChange={(event) => onFontChange(event.target.value as AppFontFamily)}
            >
              {APP_FONT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="nexus-settings-preview" style={{ fontFamily }}>
            The quick brown fox jumps over 0123456789.
          </div>

          <label className="nexus-settings-field nexus-settings-field-row">
            <span className="nexus-settings-label">Sample toggle</span>
            <input
              type="checkbox"
              checked={sampleToggle}
              onChange={(event) => onSampleToggleChange(event.target.checked)}
            />
          </label>
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
