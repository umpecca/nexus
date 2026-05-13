export {};

type NexusMenuAction =
  | "new"
  | "open"
  | "save"
  | "saveAs"
  | "refresh"
  | "comparePreviousVersion"
  | "settings"
  | "about";
type NexusEditCommand = "cut" | "copy" | "paste";

type OpenMarkdownResult =
  | { canceled: true }
  | { canceled: false; filePath: string; markdown: string };

type SaveMarkdownResult =
  | { canceled: true }
  | { canceled?: false; filePath: string };

type ConfirmSaveChangesResult = "save" | "discard" | "cancel";
type ExternalFileChangeEvent = {
  filePath: string;
  kind: "changed" | "missing";
  timestamp: number;
};

declare global {
  interface Window {
    nexus?: {
      platform: NodeJS.Platform;
      onMenuAction(callback: (action: NexusMenuAction) => void): () => void;
      onCloseRequest(callback: () => void): () => void;
      onExternalFileChange(callback: (event: ExternalFileChangeEvent) => void): () => void;
      resolveCloseRequest(shouldClose: boolean): Promise<void>;
      runEditCommand(command: NexusEditCommand): Promise<void>;
      getProfileName(): Promise<string>;
      openMarkdownFile(): Promise<OpenMarkdownResult>;
      getInitialOpenFile(): Promise<OpenMarkdownResult>;
      readWatchedMarkdownFile(filePath: string): Promise<OpenMarkdownResult>;
      watchMarkdownFile(filePath: string): Promise<{ filePath: string }>;
      unwatchMarkdownFile(): Promise<void>;
      saveMarkdownFile(filePath: string, markdown: string): Promise<{ filePath: string }>;
      saveMarkdownFileAs(currentPath: string | undefined, markdown: string): Promise<SaveMarkdownResult>;
      confirmSaveChanges(): Promise<ConfirmSaveChangesResult>;
    };
  }
}
