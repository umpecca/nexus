import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../ui/dialog";
import { Button } from "../ui/button";
import {
  isValidFootnoteIdentifier,
  nextFootnoteIdentifier,
  normalizeFootnoteIdentifier
} from "../../lib/footnotes";

interface FootnoteNameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Identifiers already in the document, used to auto-number and to reject duplicates. */
  existingIdentifiers: string[];
  /** Insert a footnote with the resolved identifier (normalised) and label (as typed). */
  onInsert: (identifier: string, label: string) => void;
}

/**
 * Prompt shown by the Insert Footnote toolbar button. The name is optional: leaving it
 * blank auto-numbers (the original behaviour), so the fast path stays "click, Enter". A
 * typed name is validated for an allowed, round-trippable identifier
 * ({@link isValidFootnoteIdentifier}) and for uniqueness against the document's existing
 * footnotes (compared via {@link normalizeFootnoteIdentifier}), surfacing an inline error
 * rather than creating a broken or duplicate footnote.
 */
function FootnoteNameDialog({
  open,
  onOpenChange,
  existingIdentifiers,
  onInsert
}: FootnoteNameDialogProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Start fresh each time the dialog opens.
  useEffect(() => {
    if (open) {
      setName("");
      setError(null);
    }
  }, [open]);

  function handleSubmit() {
    const typed = name.trim();
    if (typed.length === 0) {
      const auto = nextFootnoteIdentifier(existingIdentifiers);
      onInsert(auto, auto);
      return;
    }
    if (!isValidFootnoteIdentifier(typed)) {
      setError("Use letters, digits, hyphens, dots or underscores — no spaces or brackets.");
      return;
    }
    const identifier = normalizeFootnoteIdentifier(typed);
    if (existingIdentifiers.includes(identifier)) {
      setError(`A footnote named "${typed}" already exists.`);
      return;
    }
    onInsert(identifier, typed);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="nexus-footnote-dialog">
        <DialogHeader>
          <DialogTitle>Insert footnote</DialogTitle>
          <DialogDescription>
            Give the footnote a name, or leave it blank to number it automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="nexus-footnote-dialog-form">
          <label className="nexus-settings-field">
            <span className="nexus-settings-label">Name (optional)</span>
            <input
              className="nexus-settings-input"
              value={name}
              autoFocus
              placeholder="e.g. longnote"
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleSubmit();
                }
              }}
            />
          </label>
          {error ? <p className="nexus-footnote-dialog-error">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit}>
            Insert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default FootnoteNameDialog;
