import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../ui/dialog";
import type { EditorFontFamily } from "../../lib/settings";
import { EDITOR_FONT_OPTIONS } from "../../lib/settings";

type SettingsDialogProps = {
  fontFamily: EditorFontFamily;
  onFontFamilyChange: (fontFamily: EditorFontFamily) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  profileName: string;
};

function SettingsDialog({
  fontFamily,
  onFontFamilyChange,
  onOpenChange,
  open,
  profileName
}: SettingsDialogProps) {
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

          <div className="nexus-settings-preview" style={{ fontFamily }}>
            The quick brown fox jumps over 0123456789.
          </div>

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
