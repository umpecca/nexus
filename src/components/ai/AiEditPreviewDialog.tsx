import { Button } from "../ui/button";
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
  actionLabel: string;
  originalText: string;
  proposedText: string;
  onAccept: () => void;
  onReject: () => void;
};

/**
 * Shows the model's proposed replacement for the current selection next to the original, so the user
 * approves the change before it touches the document. Accepting routes back to App, which applies the
 * edit (CodeMirror dispatch in source mode, `insertMarkdown` over the restored selection in rich-text).
 */
function AiEditPreviewDialog({
  open,
  actionLabel,
  originalText,
  proposedText,
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
            Review the suggested replacement for your selection, then accept or discard it.
          </DialogDescription>
        </DialogHeader>

        <div className="nexus-ai-preview-body">
          <div className="nexus-ai-preview-pane">
            <span className="nexus-ai-preview-pane-label">Original</span>
            <pre className="nexus-ai-preview-text nexus-ai-preview-original">{originalText}</pre>
          </div>
          <div className="nexus-ai-preview-pane">
            <span className="nexus-ai-preview-pane-label">Proposed</span>
            <pre className="nexus-ai-preview-text nexus-ai-preview-proposed">{proposedText}</pre>
          </div>
        </div>

        <DialogFooter className="nexus-ai-preview-footer">
          <Button type="button" variant="outline" onClick={copyProposed}>
            Copy proposed
          </Button>
          <Button type="button" variant="outline" onClick={onReject}>
            Discard
          </Button>
          <Button type="button" onClick={onAccept}>
            Replace selection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AiEditPreviewDialog;
