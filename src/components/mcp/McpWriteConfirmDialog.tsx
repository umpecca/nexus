import type { Extension } from "@codemirror/state";
import ChangeReview from "../editor/ChangeReview";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../ui/dialog";

type McpWriteConfirmDialogProps = {
  open: boolean;
  clientLabel: string;
  currentMarkdown: string;
  proposedMarkdown: string;
  reviewExtensions?: Extension[];
  markdownDocument?: boolean;
  onApprove: () => void;
  onReject: () => void;
};

function McpWriteConfirmDialog({
  open,
  clientLabel,
  currentMarkdown,
  proposedMarkdown,
  reviewExtensions,
  markdownDocument,
  onApprove,
  onReject
}: McpWriteConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onReject(); }}>
      <DialogContent className="nexus-mcp-confirm-dialog">
        <DialogHeader>
          <DialogTitle>Allow MCP write?</DialogTitle>
          <DialogDescription>
            <strong>{clientLabel}</strong> wants to replace the contents of this document.
            Review the proposed change below before approving.
          </DialogDescription>
        </DialogHeader>

        <ChangeReview original={currentMarkdown} proposed={proposedMarkdown} extensions={reviewExtensions} markdownDocument={markdownDocument} />

        <DialogFooter className="nexus-mcp-confirm-footer">
          <Button type="button" variant="outline" onClick={onReject}>Reject</Button>
          <Button type="button" onClick={onApprove}>Approve replacement</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default McpWriteConfirmDialog;
