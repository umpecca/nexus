import { useState } from "react";
import { Bell, FilePlus, FolderOpen, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { ButtonGroup } from "../ui/button-group";
import { Separator } from "../ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../ui/dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger
} from "../ui/context-menu";

type ShowcaseProps = {
  text: string;
  onTextChange: (value: string) => void;
};

/**
 * The home screen. It exercises every reusable piece of the design system so the template doubles
 * as living documentation. Delete this file (and its import in App.tsx) when starting a real app.
 */
export default function Showcase({ text, onTextChange }: ShowcaseProps) {
  const [demoOpen, setDemoOpen] = useState(false);

  return (
    <div className="app-showcase">
      <section className="app-showcase-section">
        <h1 className="app-showcase-title">App Template</h1>
        <p className="app-showcase-lead">
          A frameless Electron + React + Vite + TypeScript starter with a themed design system. Use
          the Settings menu to switch between the Sky, Light, and Dark themes and pick a font; the
          status bar slider scales this content.
        </p>
      </section>

      <section className="app-showcase-section">
        <h2 className="app-showcase-heading">Buttons</h2>
        <ButtonGroup>
          <Button>Primary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
        </ButtonGroup>
        <ButtonGroup>
          <Button size="sm">Small</Button>
          <Button size="sm" variant="outline">
            Small outline
          </Button>
          <Button size="icon" aria-label="Notifications">
            <Bell aria-hidden="true" />
          </Button>
        </ButtonGroup>
      </section>

      <Separator />

      <section className="app-showcase-section">
        <h2 className="app-showcase-heading">Dialog</h2>
        <p className="app-showcase-help">A Radix dialog styled entirely by the theme tokens.</p>
        <div>
          <Button onClick={() => setDemoOpen(true)}>Open dialog</Button>
        </div>
        <Dialog open={demoOpen} onOpenChange={setDemoOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Demo dialog</DialogTitle>
              <DialogDescription>
                Overlay, blur, elevation, and the close button all come from the shared dialog
                styles.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDemoOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setDemoOpen(false)}>OK</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>

      <Separator />

      <section className="app-showcase-section">
        <h2 className="app-showcase-heading">Context menu</h2>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div className="app-showcase-contextzone">Right-click anywhere in this box</div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem>
              <span className="app-showcase-menuitem">
                <FilePlus aria-hidden="true" /> New
              </span>
              <ContextMenuShortcut>Ctrl+N</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem>
              <span className="app-showcase-menuitem">
                <FolderOpen aria-hidden="true" /> Open
              </span>
              <ContextMenuShortcut>Ctrl+O</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem>
              <span className="app-showcase-menuitem">
                <Trash2 aria-hidden="true" /> Delete
              </span>
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </section>

      <Separator />

      <section className="app-showcase-section">
        <h2 className="app-showcase-heading">Scratch text</h2>
        <p className="app-showcase-help">
          File · Open and File · Save read and write this text as a plain file (desktop app only).
        </p>
        <textarea
          className="app-showcase-textarea"
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          placeholder="Type here, then use File · Save…"
          spellCheck
        />
      </section>
    </div>
  );
}
