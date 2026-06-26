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
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger
} from "../ui/menubar";
import type { NexusMenuAction } from "../../electron";
import type { EditorPageOrientation } from "../../lib/settings";
import {
  AI_SELECTION_ACTIONS,
  AI_TONE_OPTIONS,
  AI_TRANSLATE_LANGUAGES
} from "../../lib/ai/prompts";
import type { SelectionActionId, SelectionActionOptions } from "../../lib/ai/prompts";

export type TitlebarProps = {
  fileName: string | null;
  filePath: string | null;
  isDirty: boolean;
  canEditFrontmatter: boolean;
  canToggleOutline: boolean;
  showInvisibleCharacters: boolean;
  spellCheckEnabled: boolean;
  outlineVisible: boolean;
  aiChatVisible: boolean;
  pageOrientation: EditorPageOrientation;
  responsiveContentWrappingEnabled: boolean;
  paperViewEnabled: boolean;
  dispatchMenuAction: (action: NexusMenuAction) => void;
  onAiSelectionAction: (action: SelectionActionId, options?: SelectionActionOptions) => void;
};

type AppMenuBarProps = {
  canEditFrontmatter: boolean;
  canToggleOutline: boolean;
  showInvisibleCharacters: boolean;
  spellCheckEnabled: boolean;
  outlineVisible: boolean;
  aiChatVisible: boolean;
  pageOrientation: EditorPageOrientation;
  responsiveContentWrappingEnabled: boolean;
  paperViewEnabled: boolean;
  dispatchMenuAction: (action: NexusMenuAction) => void;
  onAiSelectionAction: (action: SelectionActionId, options?: SelectionActionOptions) => void;
};

function AppMenuBar({
  canEditFrontmatter,
  canToggleOutline,
  showInvisibleCharacters,
  spellCheckEnabled,
  outlineVisible,
  aiChatVisible,
  pageOrientation,
  responsiveContentWrappingEnabled,
  paperViewEnabled,
  dispatchMenuAction,
  onAiSelectionAction
}: AppMenuBarProps) {
  const nexus = window.nexus;

  return (
    <Menubar className="nexus-titlebar-menu">
      <MenubarMenu>
        {/* Styled as the Office 2010 File tab (the saturated blue one). */}
        <MenubarTrigger className="nexus-menubar-trigger-file">File</MenubarTrigger>
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
            Find…
            <MenubarShortcut>Ctrl+F</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onSelect={() => dispatchMenuAction("replace")}>
            Replace…
            <MenubarShortcut>Ctrl+H</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onSelect={() => dispatchMenuAction("refresh")}>Refresh</MenubarItem>
          <MenubarItem onSelect={() => dispatchMenuAction("comparePreviousVersion")}>
            Compare with Previous Version
          </MenubarItem>
          <MenubarItem
            disabled={!canEditFrontmatter}
            onSelect={() => dispatchMenuAction("editFrontmatter")}
          >
            Edit Frontmatter…
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
        <MenubarTrigger>AI</MenubarTrigger>
        <MenubarContent>
          {AI_SELECTION_ACTIONS.map((action) => (
            <MenubarItem key={action.id} onSelect={() => onAiSelectionAction(action.id)}>
              {action.label}
            </MenubarItem>
          ))}
          <MenubarSub>
            <MenubarSubTrigger>Change tone</MenubarSubTrigger>
            <MenubarSubContent>
              {AI_TONE_OPTIONS.map((tone) => (
                <MenubarItem
                  key={tone.value}
                  onSelect={() => onAiSelectionAction("tone", { tone: tone.value })}
                >
                  {tone.label}
                </MenubarItem>
              ))}
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSub>
            <MenubarSubTrigger>Translate</MenubarSubTrigger>
            <MenubarSubContent>
              {AI_TRANSLATE_LANGUAGES.map((language) => (
                <MenubarItem
                  key={language}
                  onSelect={() => onAiSelectionAction("translate", { language })}
                >
                  {language}
                </MenubarItem>
              ))}
            </MenubarSubContent>
          </MenubarSub>
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
          <MenubarCheckboxItem
            checked={spellCheckEnabled}
            onCheckedChange={() => dispatchMenuAction("toggleSpellCheck")}
          >
            Check Spelling
          </MenubarCheckboxItem>
          <MenubarSeparator />
          <MenubarCheckboxItem
            checked={outlineVisible}
            disabled={!canToggleOutline}
            onCheckedChange={() => dispatchMenuAction("toggleOutline")}
          >
            Show Outline
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={aiChatVisible}
            onCheckedChange={() => dispatchMenuAction("toggleAiChat")}
          >
            Show AI Chat
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={pageOrientation === "landscape"}
            onCheckedChange={() => dispatchMenuAction("togglePageOrientation")}
          >
            Landscape Orientation
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={paperViewEnabled}
            onCheckedChange={() => dispatchMenuAction("togglePaperView")}
          >
            Paper View
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
          <MenubarItem onSelect={() => dispatchMenuAction("aiSettings")}>
            AI Providers…
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
  filePath,
  isDirty,
  canEditFrontmatter,
  canToggleOutline,
  showInvisibleCharacters,
  spellCheckEnabled,
  outlineVisible,
  aiChatVisible,
  pageOrientation,
  responsiveContentWrappingEnabled,
  paperViewEnabled,
  dispatchMenuAction,
  onAiSelectionAction
}: TitlebarProps) {
  const platform = window.nexus?.platform;
  const isMac = platform === "darwin";

  return (
    <div className="nexus-titlebar" data-platform={platform ?? "unknown"}>
      <div className="nexus-titlebar-left">
        {isMac ? null : (
          <AppMenuBar
            aiChatVisible={aiChatVisible}
            canEditFrontmatter={canEditFrontmatter}
            canToggleOutline={canToggleOutline}
            dispatchMenuAction={dispatchMenuAction}
            onAiSelectionAction={onAiSelectionAction}
            outlineVisible={outlineVisible}
            pageOrientation={pageOrientation}
            paperViewEnabled={paperViewEnabled}
            responsiveContentWrappingEnabled={responsiveContentWrappingEnabled}
            showInvisibleCharacters={showInvisibleCharacters}
            spellCheckEnabled={spellCheckEnabled}
          />
        )}
      </div>
      <div className="nexus-titlebar-title">
        <span className="nexus-titlebar-title-text" title={filePath ?? undefined}>
          {fileName ?? "Untitled"}
        </span>
        {isDirty ? <span aria-label="Unsaved changes" className="nexus-titlebar-dirty" /> : null}
      </div>
      <div className="nexus-titlebar-right">{isMac ? null : <WindowControls />}</div>
    </div>
  );
}
