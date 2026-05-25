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
  | "find"
  | "zoomIn"
  | "zoomOut"
  | "resetZoom"
  | "toggleShowInvisibles"
  | "settings"
  | "about"
  | "copyHtml";

type NexusMenuState = {
  editorZoomPercent?: number;
  showInvisibleCharacters?: boolean;
};
type NexusEditCommand = "cut" | "copy" | "paste";

type OpenMarkdownResult =
  | { canceled: true }
  | { canceled: false; filePath: string; markdown: string };

type SaveMarkdownResult =
  | { canceled: true }
  | { canceled?: false; filePath: string };

type CopyHtmlResult = { copied: boolean };
type ConfirmSaveChangesResult = "save" | "discard" | "cancel";
type ExportMarkdownPageMargins = {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
};
type ExportMarkdownHtmlOptions = {
  fontFamily?: string;
  fontSizePixels?: number;
  paragraphSpacingPixels?: number;
};
type ExportMarkdownPdfOptions = {
  fontFamily?: string;
  fontSizePixels?: number;
  paragraphSpacingPixels?: number;
  pageSize?: "Letter" | "A4";
  pageOrientation?: "portrait" | "landscape";
  pageMargins?: ExportMarkdownPageMargins;
};
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

type ConfigureMcpServerInput = {
  enabled: boolean;
  port: number;
  authMode: "bearer" | "none";
  bearerToken: string;
};

type ConfigureMcpServerResult =
  | { ok: true; listening: boolean; port?: number }
  | { ok: false; listening?: false; error: string };

type RegisterMcpWindowInput = {
  windowId: string;
  title: string;
  filePath: string | null;
  dirty: boolean;
  markdown: string;
};

type UpdateMcpWindowStateInput = Partial<{
  title: string;
  filePath: string | null;
  dirty: boolean;
  markdown: string;
}>;

type McpConfirmWriteEvent = {
  requestId: string;
  markdown: string;
  clientLabel: string;
};

type McpWriteDecision = "approve" | "reject";

declare global {
  interface Window {
    nexus?: {
      platform: NodeJS.Platform;
      onMenuAction(callback: (action: NexusMenuAction) => void): () => void;
      onCloseRequest(callback: () => void): () => void;
      onExternalFileChange(callback: (event: ExternalFileChangeEvent) => void): () => void;
      resolveCloseRequest(shouldClose: boolean): Promise<void>;
      runEditCommand(command: NexusEditCommand): Promise<void>;
      writeHtmlToClipboard(payload: { html: string; text: string }): Promise<{ written: boolean }>;
      copyMarkdownAsHtml(
        currentPath: string | undefined,
        markdown: string,
        options?: ExportMarkdownHtmlOptions
      ): Promise<CopyHtmlResult>;
      convertImageToDataUrl(source: string): Promise<string | null>;
      getProfileName(): Promise<string>;
      openMarkdownFile(): Promise<OpenMarkdownResult>;
      getInitialOpenFile(): Promise<OpenMarkdownResult>;
      readWatchedMarkdownFile(filePath: string): Promise<OpenMarkdownResult>;
      watchMarkdownFile(filePath: string): Promise<{ filePath: string }>;
      unwatchMarkdownFile(): Promise<void>;
      saveMarkdownFile(filePath: string, markdown: string): Promise<{ filePath: string }>;
      saveMarkdownFileAs(currentPath: string | undefined, markdown: string): Promise<SaveMarkdownResult>;
      exportMarkdownAsHtml(
        currentPath: string | undefined,
        markdown: string,
        options?: ExportMarkdownHtmlOptions
      ): Promise<SaveMarkdownResult>;
      exportMarkdownAsPdf(
        currentPath: string | undefined,
        markdown: string,
        options?: ExportMarkdownPdfOptions
      ): Promise<SaveMarkdownResult>;
      selectLocalImage(): Promise<SelectLocalImageResult>;
      selectBase64Image(): Promise<SelectBase64ImageResult>;
      resolveImagePreview(documentPath: string | undefined, imageSource: string): Promise<string>;
      confirmSaveChanges(): Promise<ConfirmSaveChangesResult>;
      setMenuState(state: NexusMenuState): void;
      configureMcpServer(config: ConfigureMcpServerInput): Promise<ConfigureMcpServerResult>;
      registerMcpWindow(payload: RegisterMcpWindowInput): void;
      updateMcpWindowState(state: UpdateMcpWindowStateInput): void;
      unregisterMcpWindow(): void;
      onMcpConfirmWrite(callback: (event: McpConfirmWriteEvent) => void): () => void;
      resolveMcpWrite(requestId: string, decision: McpWriteDecision): void;
    };
  }
}
