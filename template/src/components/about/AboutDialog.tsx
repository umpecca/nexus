import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../ui/dialog";
import { APP_NAME } from "../../lib/appInfo";

type AboutDialogProps = {
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

function AboutDialog({ onOpenChange, open }: AboutDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>About {APP_NAME}</DialogTitle>
          <DialogDescription>
            A frameless Electron + React + Vite + TypeScript desktop template.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AboutDialog;
