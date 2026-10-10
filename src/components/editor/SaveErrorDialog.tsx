import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../ui/dialog";

export default function SaveErrorDialog({ message, onDismiss }: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Could not save document</DialogTitle>
          <DialogDescription>
            Your edits are still open. Try saving again or use Save As to choose another location.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm break-words" role="alert">{message}</p>
        <DialogFooter>
          <Button type="button" onClick={onDismiss}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
