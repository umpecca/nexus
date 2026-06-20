export {};

/** Actions dispatched from the menus (native + in-app) into App.tsx's dispatchMenuAction. */
export type AppMenuAction =
  | "new"
  | "open"
  | "save"
  | "saveAs"
  | "zoomIn"
  | "zoomOut"
  | "resetZoom"
  | "toggleSample"
  | "settings"
  | "about";

type EditCommand = "cut" | "copy" | "paste" | "undo" | "redo";

type OpenTextResult =
  | { canceled: true }
  | { canceled: false; filePath: string; content: string };

type SaveTextResult =
  | { canceled: true }
  | { canceled?: false; filePath: string };

declare global {
  interface Window {
    /**
     * The preload context bridge (electron/preload.cjs). Optional because the renderer also runs in
     * a plain browser during `npm run dev` + preview, where there is no Electron host — every call
     * site uses `window.api?.…` so it degrades gracefully.
     */
    api?: {
      platform: NodeJS.Platform;
      onMenuAction(callback: (action: AppMenuAction) => void): () => void;
      onWindowMaximizeChange(callback: (isMaximized: boolean) => void): () => void;
      minimizeWindow(): Promise<void>;
      toggleMaximizeWindow(): Promise<void>;
      closeWindow(): Promise<void>;
      isWindowMaximized(): Promise<boolean>;
      newWindow(): Promise<void>;
      quitApp(): Promise<void>;
      runEditCommand(command: EditCommand): Promise<void>;
      openTextFile(): Promise<OpenTextResult>;
      saveTextFile(filePath: string, content: string): Promise<SaveTextResult>;
      saveTextFileAs(currentPath: string | undefined, content: string): Promise<SaveTextResult>;
      openExternal(url: string): Promise<void>;
    };
  }
}
