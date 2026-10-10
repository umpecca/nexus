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
  assetsVisible?: boolean;
  markdownDocument?: boolean;
  folderOpen?: boolean;
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
  onAiDocumentImport: () => void;
  onOpenRecentFile: (filePath: string) => void;
};

type AppMenuBarProps = {
  assetsVisible?: boolean;
  markdownDocument?: boolean;
  folderOpen?: boolean;
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
  onAiDocumentImport: () => void;
  onOpenRecentFile: (filePath: string) => void;
};

// Display name for a recents entry. The renderer has no node:path, and the stored entries are
// absolute paths from the main process, so split on either separator.
export function getFileNameFromPath(filePath: string) {
  const segments = filePath.split(/[\\/]/);
  return segments[segments.length - 1] || filePath;
}

// Mirrors the native menu's recents list: seeded once, then kept live by the main process, which
// broadcasts whenever a file is opened, saved-as, or dropped from the list.
function useRecentFiles() {
  const [recentFiles, setRecentFiles] = React.useState<string[]>([]);

  React.useEffect(() => {
    let active = true;
    void window.nexus?.listRecentFiles().then((files) => {
      if (active) {
        setRecentFiles(files);
      }
    });
    const unsubscribe = window.nexus?.onRecentFilesChange((files) => {
      setRecentFiles(files);
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  return recentFiles;
}

function AppMenuBar({
  assetsVisible,
  markdownDocument = true,
  folderOpen,
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
  onAiSelectionAction,
  onAiDocumentImport,
  onOpenRecentFile
}: AppMenuBarProps) {
  const nexus = window.nexus;
  const recentFiles = useRecentFiles();

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
          <MenubarItem onSelect={() => dispatchMenuAction("openFolder")}>
            Open Folder…<MenubarShortcut>Ctrl+Alt+O</MenubarShortcut>
          </MenubarItem>
          <MenubarItem disabled={!folderOpen} onSelect={() => dispatchMenuAction("closeFolder")}>Close Folder</MenubarItem>
          <MenubarSub>
            <MenubarSubTrigger>Open Recent</MenubarSubTrigger>
            <MenubarSubContent>
              {recentFiles.length === 0 ? (
                <MenubarItem disabled>No Recent Files</MenubarItem>
              ) : (
                <>
                  {recentFiles.map((recentPath) => (
                    <MenubarItem
                      key={recentPath}
                      onSelect={() => onOpenRecentFile(recentPath)}
                      title={recentPath}
                    >
                      {getFileNameFromPath(recentPath)}
                    </MenubarItem>
                  ))}
                  <MenubarSeparator />
                  <MenubarItem onSelect={() => void nexus?.clearRecentFiles()}>
                    Clear Recent
                  </MenubarItem>
                </>
              )}
            </MenubarSubContent>
          </MenubarSub>
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
          <MenubarItem disabled={!markdownDocument} onSelect={() => dispatchMenuAction("exportHtml")}>Export as HTML</MenubarItem>
          <MenubarItem disabled={!markdownDocument} onSelect={() => dispatchMenuAction("exportWord")}>Export to Word</MenubarItem>
          <MenubarItem disabled={!markdownDocument} onSelect={() => dispatchMenuAction("printPreview")}>Print Preview</MenubarItem>
          <MenubarItem disabled={!markdownDocument} onSelect={() => dispatchMenuAction("exportPdf")}>Export as PDF</MenubarItem>
          <MenubarItem disabled={!markdownDocument} onSelect={() => dispatchMenuAction("publishWeb")}>
            Publish as HTML over SFTP…
          </MenubarItem>
          <MenubarItem disabled={!markdownDocument} onSelect={() => dispatchMenuAction("publishQuickConnect")}>
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
          <MenubarItem disabled={!markdownDocument} onSelect={() => dispatchMenuAction("insertTableOfContents")}>
            Insert Table of Contents
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
          <MenubarItem disabled={!markdownDocument} onSelect={() => dispatchMenuAction("copyHtml")}>
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
        <MenubarTrigger disabled={!markdownDocument}>AI</MenubarTrigger>
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
          <MenubarSeparator />
          <MenubarItem onSelect={() => dispatchMenuAction("contentOrganization")}>
            Content Organization
          </MenubarItem>
          <MenubarItem onSelect={() => onAiDocumentImport()}>Import PDF or Images…</MenubarItem>
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
            checked={assetsVisible}
            disabled={!markdownDocument}
            onCheckedChange={() => dispatchMenuAction("toggleAssets")}
          >
            Show Images & Assets
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
          <MenubarItem onSelect={() => dispatchMenuAction("mcpSettings")}>
            MCP Server…
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
  assetsVisible,
  markdownDocument = true,
  folderOpen,
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
  onAiSelectionAction,
  onAiDocumentImport,
  onOpenRecentFile
}: TitlebarProps) {
  const platform = window.nexus?.platform;
  const isMac = platform === "darwin";

  return (
    <div className="nexus-titlebar" data-platform={platform ?? "unknown"}>
      <div className="nexus-titlebar-left">
        {isMac ? null : (
          <AppMenuBar
            assetsVisible={assetsVisible}
            markdownDocument={markdownDocument}
            folderOpen={folderOpen}
            aiChatVisible={aiChatVisible}
            canEditFrontmatter={canEditFrontmatter}
            canToggleOutline={canToggleOutline}
            dispatchMenuAction={dispatchMenuAction}
            onAiSelectionAction={onAiSelectionAction}
            onAiDocumentImport={onAiDocumentImport}
            onOpenRecentFile={onOpenRecentFile}
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
