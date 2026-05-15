export {};

type NexusMenuAction =
  | "new"
  | "open"
  | "loadDemo"
  | "save"
  | "saveAs"
  | "exportHtml"
  | "exportPdf"
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

type SelectLocalImageResult =
  | { canceled: true }
  | { canceled: false; filePath: string; src: string };

type SelectBase64ImageResult =
  | { canceled: true }
  | { canceled: false; filePath: string; mimeType: string; dataUrl: string };

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
      exportMarkdownAsHtml(currentPath: string | undefined, markdown: string): Promise<SaveMarkdownResult>;
      exportMarkdownAsPdf(currentPath: string | undefined, markdown: string): Promise<SaveMarkdownResult>;
      selectLocalImage(): Promise<SelectLocalImageResult>;
      selectBase64Image(): Promise<SelectBase64ImageResult>;
      resolveImagePreview(documentPath: string | undefined, imageSource: string): Promise<string>;
      confirmSaveChanges(): Promise<ConfirmSaveChangesResult>;
    };
  }
}
