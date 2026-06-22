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

type AboutDialogProps = {
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

function AboutDialog({ onOpenChange, open }: AboutDialogProps) {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void window.nexus?.getAppVersion().then((value) => {
      if (active) {
        setVersion(value);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>About</DialogTitle>
          <DialogDescription>
            Nexus{version ? ` v${version}` : ""} — Copyright 2026 Vince
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
