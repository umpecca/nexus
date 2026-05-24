import { useMemo } from "react";
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
  onApprove: () => void;
  onReject: () => void;
};

type DiffLine =
  | { kind: "context"; text: string }
  | { kind: "add"; text: string }
  | { kind: "remove"; text: string };

function computeLineDiff(currentText: string, proposedText: string): DiffLine[] {
  const a = currentText.split("\n");
  const b = proposedText.split("\n");
  const n = a.length;
  const m = b.length;

  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      if (a[i] === b[j]) {
        lcs[i][j] = lcs[i + 1][j + 1] + 1;
      } else {
        lcs[i][j] = Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "context", text: a[i] });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ kind: "remove", text: a[i] });
      i += 1;
    } else {
      out.push({ kind: "add", text: b[j] });
      j += 1;
    }
  }

  while (i < n) {
    out.push({ kind: "remove", text: a[i] });
    i += 1;
  }
  while (j < m) {
    out.push({ kind: "add", text: b[j] });
    j += 1;
  }

  return out;
}

function McpWriteConfirmDialog({
  open,
  clientLabel,
  currentMarkdown,
  proposedMarkdown,
  onApprove,
  onReject
}: McpWriteConfirmDialogProps) {
  const diff = useMemo(
    () => computeLineDiff(currentMarkdown, proposedMarkdown),
    [currentMarkdown, proposedMarkdown]
  );

  const addedLineCount = diff.filter((line) => line.kind === "add").length;
  const removedLineCount = diff.filter((line) => line.kind === "remove").length;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onReject();
        }
      }}
    >
      <DialogContent className="nexus-mcp-confirm-dialog">
        <DialogHeader>
          <DialogTitle>Allow MCP write?</DialogTitle>
          <DialogDescription>
            <strong>{clientLabel}</strong> wants to replace the contents of this document.
            Review the proposed change below before approving.
          </DialogDescription>
        </DialogHeader>

        <div className="nexus-mcp-diff-summary">
          <span className="nexus-mcp-diff-add">+{addedLineCount}</span>
          <span className="nexus-mcp-diff-remove">-{removedLineCount}</span>
          <span className="nexus-mcp-diff-summary-label">line changes</span>
        </div>

        <div className="nexus-mcp-diff-view" role="region" aria-label="Proposed document changes">
          {diff.length === 0 ? (
            <p className="nexus-mcp-diff-empty">The proposed content matches the current document.</p>
          ) : (
            diff.map((line, index) => (
              <div key={index} className={`nexus-mcp-diff-line nexus-mcp-diff-${line.kind}`}>
                <span className="nexus-mcp-diff-marker" aria-hidden>
                  {line.kind === "add" ? "+" : line.kind === "remove" ? "-" : " "}
                </span>
                <span className="nexus-mcp-diff-text">{line.text || " "}</span>
              </div>
            ))
          )}
        </div>

        <DialogFooter className="nexus-mcp-confirm-footer">
          <Button type="button" variant="outline" onClick={onReject}>
            Reject
          </Button>
          <Button type="button" onClick={onApprove}>
            Approve replacement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default McpWriteConfirmDialog;
