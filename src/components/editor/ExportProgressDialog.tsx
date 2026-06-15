import * as DialogPrimitive from "@radix-ui/react-dialog";

type ExportProgressDialogProps = {
  open: boolean;
  title: string;
  message: string;
};

// Long-running exports (PDF/Word/HTML and copy-as-HTML) run in the main process. While one runs, this
// modal blocks the editor with a spinner — the in-app, theme-aware replacement for the old native
// progress BrowserWindow. It is intentionally non-dismissable: there is nothing to cancel and the
// operation finishes on its own, so there is no close button and Escape / outside clicks are ignored.
// The save dialog is shown by the main process before the modal opens, so they never overlap.
function blockDismiss(event: Event) {
  event.preventDefault();
}

function ExportProgressDialog({ open, title, message }: ExportProgressDialogProps) {
  return (
    <DialogPrimitive.Root open={open}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="nexus-dialog-overlay" />
        <DialogPrimitive.Content
          className="nexus-dialog-content nexus-export-progress-dialog"
          onEscapeKeyDown={blockDismiss}
          onPointerDownOutside={blockDismiss}
          onInteractOutside={blockDismiss}
        >
          <div className="nexus-export-progress-body">
            <span className="nexus-spinner" aria-hidden="true" />
            <DialogPrimitive.Title className="nexus-dialog-title">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="nexus-dialog-description">
              {message}
            </DialogPrimitive.Description>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export default ExportProgressDialog;
