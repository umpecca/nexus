import { Button } from "../ui/button";
import type { Extension } from "@codemirror/state";
import ChangeReview from "../editor/ChangeReview";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../ui/dialog";

type AiEditPreviewDialogProps = {
  open: boolean;
  target: "selection" | "document";
  actionLabel: string;
  originalText: string;
  proposedText: string;
  reviewExtensions?: Extension[];
  markdownDocument?: boolean;
  onAccept: () => void;
  onReject: () => void;
};

/**
 * Shows a proposed selection or whole-document replacement next to the original, so the user
 * approves it before it touches the editor. App owns the target-specific replacement transaction.
 */
function AiEditPreviewDialog({
  open,
  target,
  actionLabel,
  originalText,
  proposedText,
  reviewExtensions,
  markdownDocument,
  onAccept,
  onReject
}: AiEditPreviewDialogProps) {
  function copyProposed() {
    if (proposedText && navigator?.clipboard?.writeText) {
      void navigator.clipboard.writeText(proposedText);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onReject();
        }
      }}
    >
      <DialogContent className="nexus-ai-preview-content">
        <DialogHeader>
          <DialogTitle>{actionLabel}</DialogTitle>
          <DialogDescription>
            {target === "document"
              ? "Review the organized document, then replace the current document or discard the proposal."
              : "Review the suggested replacement for your selection, then accept or discard it."}
          </DialogDescription>
        </DialogHeader>

        <ChangeReview original={originalText} proposed={proposedText} extensions={reviewExtensions} markdownDocument={markdownDocument} />

        <DialogFooter className="nexus-ai-preview-footer">
          <Button type="button" variant="outline" onClick={copyProposed}>
            Copy proposed
          </Button>
          <Button type="button" variant="outline" onClick={onReject}>
            Discard
          </Button>
          <Button type="button" onClick={onAccept}>
            {target === "document" ? "Replace document" : "Replace selection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AiEditPreviewDialog;
