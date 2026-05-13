import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../ui/dialog";

type FileChangedDialogProps = {
  filePath: string;
  isDirty: boolean;
  kind: "changed" | "missing";
  onIgnore: () => void;
  onReload: () => void;
  onReviewDiff?: () => void;
  onSaveAs: () => void;
  open: boolean;
  source?: "external" | "refresh";
};

function FileChangedDialog({
  filePath,
  isDirty,
  kind,
  onIgnore,
  onReload,
  onReviewDiff,
  onSaveAs,
  open,
  source = "external"
}: FileChangedDialogProps) {
  const title = kind === "missing" ? "File Missing" : "File Changed";
  const changedDescription =
    source === "refresh"
      ? "The file on disk is different from this window's unsaved edits."
      : "This file changed outside Nexus, and this window has unsaved edits.";
  const cleanDescription =
    source === "refresh"
      ? "Reload this file from disk?"
      : "This file changed outside Nexus. Reload it from disk?";
  const missingDescription =
    source === "refresh"
      ? "Nexus could not reload this file because it was moved or deleted."
      : "This file was moved or deleted outside Nexus.";

  if (kind === "missing") {
    return (
      <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onIgnore()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{missingDescription}</DialogDescription>
          </DialogHeader>
          <p className="nexus-dialog-path">{filePath}</p>
          <DialogFooter>
            <Button type="button" onClick={onIgnore}>
              Keep Editing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onIgnore()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {isDirty ? changedDescription : cleanDescription}
          </DialogDescription>
        </DialogHeader>
        <p className="nexus-dialog-path">{filePath}</p>
        <DialogFooter>
          {isDirty ? (
            <>
              <Button type="button" variant="outline" onClick={onSaveAs}>
                Save As
              </Button>
              {onReviewDiff ? (
                <Button type="button" onClick={onReviewDiff}>
                  Review Diff
                </Button>
              ) : null}
              <Button type="button" variant="ghost" onClick={onIgnore}>
                Keep Editing
              </Button>
            </>
          ) : (
            <Button type="button" variant="ghost" onClick={onIgnore}>
              Ignore
            </Button>
          )}
          <Button type="button" onClick={onReload}>
            Reload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default FileChangedDialog;
