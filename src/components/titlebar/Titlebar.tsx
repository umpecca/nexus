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
import type { NexusMenuAction } from "../../electron";
import type { EditorPageOrientation } from "../../lib/settings";

export type TitlebarProps = {
  fileName: string | null;
  isDirty: boolean;
  showInvisibleCharacters: boolean;
  outlineVisible: boolean;
  pageOrientation: EditorPageOrientation;
  responsiveContentWrappingEnabled: boolean;
  paperViewEnabled: boolean;
  dispatchMenuAction: (action: NexusMenuAction) => void;
};

type AppMenuBarProps = {
  showInvisibleCharacters: boolean;
  outlineVisible: boolean;
  pageOrientation: EditorPageOrientation;
  responsiveContentWrappingEnabled: boolean;
  paperViewEnabled: boolean;
  dispatchMenuAction: (action: NexusMenuAction) => void;
};

function AppMenuBar({
  showInvisibleCharacters,
  outlineVisible,
  pageOrientation,
  responsiveContentWrappingEnabled,
  paperViewEnabled,
  dispatchMenuAction
}: AppMenuBarProps) {
  const nexus = window.nexus;

  return (
    <Menubar className="nexus-titlebar-menu">
      <MenubarMenu>
        <MenubarTrigger>File</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onSelect={() => void nexus?.newWindow()}>
            New Window
            <MenubarShortcut>Ctrl+Shift+N</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onSelect={() => dispatchMenuAction("new")}>
            New
            <MenubarShortcut>Ctrl+N</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onSelect={() => dispatchMenuAction("open")}>
            Open
            <MenubarShortcut>Ctrl+O</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onSelect={() => dispatchMenuAction("loadDemo")}>
            Load Demo Document
          </MenubarItem>
          <MenubarItem onSelect={() => dispatchMenuAction("save")}>
            Save
            <MenubarShortcut>Ctrl+S</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onSelect={() => dispatchMenuAction("saveAs")}>
            Save As
            <MenubarShortcut>Ctrl+Shift+S</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onSelect={() => dispatchMenuAction("exportHtml")}>Export as HTML</MenubarItem>
          <MenubarItem onSelect={() => dispatchMenuAction("exportWord")}>Export to Word</MenubarItem>
          <MenubarItem onSelect={() => dispatchMenuAction("exportPdf")}>Export as PDF</MenubarItem>
          <MenubarItem onSelect={() => dispatchMenuAction("publishWeb")}>
            Publish as HTML over SFTP…
          </MenubarItem>
          <MenubarItem onSelect={() => dispatchMenuAction("publishQuickConnect")}>
            Publish as HTML over QuickConnect…
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onSelect={() => void nexus?.quitApp()}>
            Exit
            <MenubarShortcut>Alt+F4</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>Edit</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onSelect={() => void nexus?.runEditCommand("undo")}>
            Undo
            <MenubarShortcut>Ctrl+Z</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onSelect={() => void nexus?.runEditCommand("redo")}>
            Redo
            <MenubarShortcut>Ctrl+Y</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onSelect={() => dispatchMenuAction("find")}>
            Find
            <MenubarShortcut>Ctrl+F</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onSelect={() => dispatchMenuAction("refresh")}>Refresh</MenubarItem>
          <MenubarItem onSelect={() => dispatchMenuAction("comparePreviousVersion")}>
            Compare with Previous Version
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onSelect={() => void nexus?.runEditCommand("cut")}>
            Cut
            <MenubarShortcut>Ctrl+X</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onSelect={() => void nexus?.runEditCommand("copy")}>
            Copy
            <MenubarShortcut>Ctrl+C</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onSelect={() => dispatchMenuAction("copyHtml")}>
            Copy as HTML
            <MenubarShortcut>Ctrl+Shift+C</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onSelect={() => void nexus?.runEditCommand("paste")}>
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
            checked={showInvisibleCharacters}
            onCheckedChange={() => dispatchMenuAction("toggleShowInvisibles")}
          >
            Show Invisible Characters
          </MenubarCheckboxItem>
          <MenubarSeparator />
          <MenubarCheckboxItem
            checked={outlineVisible}
            onCheckedChange={() => dispatchMenuAction("toggleOutline")}
          >
            Show Outline
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={pageOrientation === "landscape"}
            onCheckedChange={() => dispatchMenuAction("togglePageOrientation")}
          >
            Landscape Orientation
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={responsiveContentWrappingEnabled}
            disabled={paperViewEnabled}
            onCheckedChange={() => dispatchMenuAction("toggleResponsiveWrapping")}
          >
            Responsive Wrapping
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
    void window.nexus?.isWindowMaximized().then((value) => {
      if (active) {
        setIsMaximized(value);
      }
    });
    const unsubscribe = window.nexus?.onWindowMaximizeChange((value) => {
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
        onClick={() => void window.nexus?.minimizeWindow()}
        type="button"
      >
        <Minus aria-hidden="true" />
      </button>
      <button
        aria-label={isMaximized ? "Restore" : "Maximize"}
        className="nexus-window-control"
        onClick={() => void window.nexus?.toggleMaximizeWindow()}
        type="button"
      >
        {isMaximized ? <Copy aria-hidden="true" /> : <Square aria-hidden="true" />}
      </button>
      <button
        aria-label="Close"
        className="nexus-window-control nexus-window-control-close"
        onClick={() => void window.nexus?.closeWindow()}
        type="button"
      >
        <X aria-hidden="true" />
      </button>
    </div>
  );
}

export function Titlebar({
  fileName,
  isDirty,
  showInvisibleCharacters,
  outlineVisible,
  pageOrientation,
  responsiveContentWrappingEnabled,
  paperViewEnabled,
  dispatchMenuAction
}: TitlebarProps) {
  const platform = window.nexus?.platform;
  const isMac = platform === "darwin";

  return (
    <div className="nexus-titlebar" data-platform={platform ?? "unknown"}>
      <div className="nexus-titlebar-left">
        {isMac ? null : (
          <AppMenuBar
            dispatchMenuAction={dispatchMenuAction}
            outlineVisible={outlineVisible}
            pageOrientation={pageOrientation}
            paperViewEnabled={paperViewEnabled}
            responsiveContentWrappingEnabled={responsiveContentWrappingEnabled}
            showInvisibleCharacters={showInvisibleCharacters}
          />
        )}
      </div>
      <div className="nexus-titlebar-title">
        <span className="nexus-titlebar-title-text">{fileName ?? "Untitled"}</span>
        {isDirty ? <span aria-label="Unsaved changes" className="nexus-titlebar-dirty" /> : null}
      </div>
      <div className="nexus-titlebar-right">{isMac ? null : <WindowControls />}</div>
    </div>
  );
}
