import * as React from "react";
import { Copy, Minus, Square, X } from "lucide-react";
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger
} from "../ui/menubar";
import { APP_NAME } from "../../lib/appInfo";
import type { AppMenuAction } from "../../api";

export type TitlebarProps = {
  fileName: string | null;
  isDirty: boolean;
  sampleToggle: boolean;
  dispatchMenuAction: (action: AppMenuAction) => void;
};

type AppMenuBarProps = {
  sampleToggle: boolean;
  dispatchMenuAction: (action: AppMenuAction) => void;
};

function AppMenuBar({ sampleToggle, dispatchMenuAction }: AppMenuBarProps) {
  const api = window.api;

  return (
    <Menubar>
      <MenubarMenu>
        <MenubarTrigger>File</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onSelect={() => void api?.newWindow()}>
            New Window
            <MenubarShortcut>Ctrl+Shift+N</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onSelect={() => dispatchMenuAction("new")}>
            New
            <MenubarShortcut>Ctrl+N</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onSelect={() => dispatchMenuAction("open")}>
            Open…
            <MenubarShortcut>Ctrl+O</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onSelect={() => dispatchMenuAction("save")}>
            Save
            <MenubarShortcut>Ctrl+S</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onSelect={() => dispatchMenuAction("saveAs")}>
            Save As…
            <MenubarShortcut>Ctrl+Shift+S</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onSelect={() => void api?.quitApp()}>
            Exit
            <MenubarShortcut>Alt+F4</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>Edit</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onSelect={() => void api?.runEditCommand("undo")}>
            Undo
            <MenubarShortcut>Ctrl+Z</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onSelect={() => void api?.runEditCommand("redo")}>
            Redo
            <MenubarShortcut>Ctrl+Y</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onSelect={() => void api?.runEditCommand("cut")}>
            Cut
            <MenubarShortcut>Ctrl+X</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onSelect={() => void api?.runEditCommand("copy")}>
            Copy
            <MenubarShortcut>Ctrl+C</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onSelect={() => void api?.runEditCommand("paste")}>
            Paste
            <MenubarShortcut>Ctrl+V</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>View</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onSelect={() => dispatchMenuAction("zoomIn")}>
            Zoom In
            <MenubarShortcut>Ctrl++</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onSelect={() => dispatchMenuAction("zoomOut")}>
            Zoom Out
            <MenubarShortcut>Ctrl+-</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onSelect={() => dispatchMenuAction("resetZoom")}>
            Reset Zoom
            <MenubarShortcut>Ctrl+0</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarCheckboxItem
            checked={sampleToggle}
            onCheckedChange={() => dispatchMenuAction("toggleSample")}
          >
            Sample Setting
          </MenubarCheckboxItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>Settings</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onSelect={() => dispatchMenuAction("settings")}>
            Preferences
            <MenubarShortcut>Ctrl+,</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>Help</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onSelect={() => dispatchMenuAction("about")}>About</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  );
}

function WindowControls() {
  const [isMaximized, setIsMaximized] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    void window.api?.isWindowMaximized().then((value) => {
      if (active) {
        setIsMaximized(value);
      }
    });
    const unsubscribe = window.api?.onWindowMaximizeChange((value) => {
      setIsMaximized(value);
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  return (
    <div className="nexus-window-controls">
      <button
        aria-label="Minimize"
        className="nexus-window-control"
        onClick={() => void window.api?.minimizeWindow()}
        type="button"
      >
        <Minus aria-hidden="true" />
      </button>
      <button
        aria-label={isMaximized ? "Restore" : "Maximize"}
        className="nexus-window-control"
        onClick={() => void window.api?.toggleMaximizeWindow()}
        type="button"
      >
        {isMaximized ? <Copy aria-hidden="true" /> : <Square aria-hidden="true" />}
      </button>
      <button
        aria-label="Close"
        className="nexus-window-control nexus-window-control-close"
        onClick={() => void window.api?.closeWindow()}
        type="button"
      >
        <X aria-hidden="true" />
      </button>
    </div>
  );
}

export function Titlebar({ fileName, isDirty, sampleToggle, dispatchMenuAction }: TitlebarProps) {
  const platform = window.api?.platform;
  const isMac = platform === "darwin";

  return (
    <div className="nexus-titlebar" data-platform={platform ?? "unknown"}>
      <div className="nexus-titlebar-left">
        {isMac ? null : (
          <AppMenuBar sampleToggle={sampleToggle} dispatchMenuAction={dispatchMenuAction} />
        )}
      </div>
      <div className="nexus-titlebar-title">
        <span className="nexus-titlebar-title-text">{`${fileName ?? "Untitled"} - ${APP_NAME}`}</span>
        {isDirty ? <span aria-label="Unsaved changes" className="nexus-titlebar-dirty" /> : null}
      </div>
      <div className="nexus-titlebar-right">{isMac ? null : <WindowControls />}</div>
    </div>
  );
}
