import { type ReactNode, useRef } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuShortcut,
  ContextMenuTrigger
} from "../ui/context-menu";

type EditCommand = "cut" | "copy" | "paste";

type SavedSelection = {
  activeElement: HTMLElement | null;
  range: Range | null;
};

type EditorContextMenuProps = {
  children: ReactNode;
};

function getShortcut(command: EditCommand) {
  const modifier = window.nexus?.platform === "darwin" ? "Cmd" : "Ctrl";

  if (command === "cut") {
    return `${modifier}+X`;
  }

  if (command === "copy") {
    return `${modifier}+C`;
  }

  return `${modifier}+V`;
}

function saveCurrentSelection(): SavedSelection {
  const selection = window.getSelection();
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  return {
    activeElement,
    range: selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null
  };
}

function restoreSelection(savedSelection: SavedSelection | null) {
  if (!savedSelection) {
    return;
  }

  savedSelection.activeElement?.focus();

  if (!savedSelection.range) {
    return;
  }

  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(savedSelection.range);
}

function EditorContextMenu({ children }: EditorContextMenuProps) {
  const savedSelectionRef = useRef<SavedSelection | null>(null);

  if (window.nexus) {
    return (
      <div className="editor-context-menu-region" spellCheck>
        {children}
      </div>
    );
  }

  function handleContextMenu() {
    savedSelectionRef.current = saveCurrentSelection();
  }

  function handleEditCommand(command: EditCommand) {
    restoreSelection(savedSelectionRef.current);
    document.execCommand(command);
  }

  return (
    <ContextMenu modal={false}>
      <ContextMenuTrigger asChild onContextMenu={handleContextMenu}>
        <div className="editor-context-menu-region" spellCheck>
          {children}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => handleEditCommand("cut")}>
          Cut
          <ContextMenuShortcut>{getShortcut("cut")}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => handleEditCommand("copy")}>
          Copy
          <ContextMenuShortcut>{getShortcut("copy")}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => handleEditCommand("paste")}>
          Paste
          <ContextMenuShortcut>{getShortcut("paste")}</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export default EditorContextMenu;
