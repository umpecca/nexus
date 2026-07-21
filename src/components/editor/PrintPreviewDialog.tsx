import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../ui/dialog";

type PrintPreviewDialogProps = {
  open: boolean;
  loading: boolean;
  error: string | null;
  pdfData: Uint8Array | null;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => void;
  onSave: () => void;
};

type PrintPreviewContentProps = Pick<
  PrintPreviewDialogProps,
  "loading" | "error" | "onRefresh" | "onSave"
> & {
  pdfUrl: string | null;
  canSave: boolean;
};

export function PrintPreviewContent({
  loading,
  error,
  pdfUrl,
  canSave,
  onRefresh,
  onSave
}: PrintPreviewContentProps) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Print Preview</DialogTitle>
        <DialogDescription>
          This snapshot uses the same paper, margins, and Chromium pagination as Export as PDF.
        </DialogDescription>
      </DialogHeader>

      <div className="nexus-print-preview-body" aria-busy={loading}>
        {pdfUrl ? (
          <iframe className="nexus-print-preview-frame" src={pdfUrl} title="Paginated PDF preview" />
        ) : null}
        {loading ? (
          <div className="nexus-print-preview-status">
            <span className="nexus-spinner" aria-hidden="true" />
            <span>Rendering the current document…</span>
          </div>
        ) : null}
        {!loading && !pdfUrl && !error ? (
          <div className="nexus-print-preview-status">No preview has been generated.</div>
        ) : null}
        {error ? <div className="nexus-print-preview-error">{error}</div> : null}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onRefresh} disabled={loading}>
          Refresh
        </Button>
        <Button type="button" onClick={onSave} disabled={!canSave}>
          Save PDF
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * Displays the exact PDF snapshot produced by Chromium. The object URL belongs to this dialog and is
 * revoked whenever a refreshed snapshot replaces it or the dialog unmounts.
 */
function PrintPreviewDialog({
  open,
  loading,
  error,
  pdfData,
  onOpenChange,
  onRefresh,
  onSave
}: PrintPreviewDialogProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!pdfData) {
      setPdfUrl(null);
      return;
    }

    const bytes = Uint8Array.from(pdfData);
    const nextUrl = URL.createObjectURL(new Blob([bytes.buffer], { type: "application/pdf" }));
    setPdfUrl(nextUrl);

    return () => URL.revokeObjectURL(nextUrl);
  }, [pdfData]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="nexus-print-preview-dialog">
        <PrintPreviewContent
          loading={loading}
          error={error}
          pdfUrl={pdfUrl}
          canSave={pdfData !== null}
          onRefresh={onRefresh}
          onSave={onSave}
        />
      </DialogContent>
    </Dialog>
  );
}

export default PrintPreviewDialog;
