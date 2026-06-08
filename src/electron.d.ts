export {};

export type NexusMenuAction =
  | "new"
  | "open"
  | "loadDemo"
  | "save"
  | "saveAs"
  | "exportHtml"
  | "exportWord"
  | "exportPdf"
  | "refresh"
  | "comparePreviousVersion"
  | "find"
  | "replace"
  | "zoomIn"
  | "zoomOut"
  | "resetZoom"
  | "toggleShowInvisibles"
  | "toggleOutline"
  | "togglePageOrientation"
  | "toggleResponsiveWrapping"
  | "settings"
  | "about"
  | "copyHtml"
  | "publishWeb"
  | "publishQuickConnect";

type NexusMenuState = {
  editorZoomPercent?: number;
  showInvisibleCharacters?: boolean;
  outlineVisible?: boolean;
  pageOrientation?: "portrait" | "landscape";
  responsiveContentWrappingEnabled?: boolean;
  paperViewEnabled?: boolean;
};
type NexusEditCommand = "cut" | "copy" | "paste" | "undo" | "redo";

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
type ExportMarkdownWordOptions = ExportMarkdownHtmlOptions & {
  pageMargins?: ExportMarkdownPageMargins;
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
  ngrokEnabled: boolean;
  ngrokDomain: string;
  ngrokUseCustomPath: boolean;
  ngrokPath: string;
};

export type McpNgrokStatus = {
  enabled: boolean;
  connected: boolean;
  url: string | null;
  error: string | null;
  domainFallback: boolean;
};

type ConfigureMcpServerResult =
  | { ok: true; listening: boolean; port?: number; ngrok: McpNgrokStatus }
  | { ok: false; listening?: false; error: string; ngrok?: McpNgrokStatus };

type RegisterMcpWindowInput = {
  windowId: string;
  title: string;
  filePath: string | null;
  dirty: boolean;
  markdown: string;
  exportOptions?: {
    word?: ExportMarkdownWordOptions;
  };
};

type UpdateMcpWindowStateInput = Partial<{
  title: string;
  filePath: string | null;
  dirty: boolean;
  markdown: string;
  exportOptions: {
    word?: ExportMarkdownWordOptions;
  };
}>;

type McpConfirmWriteEvent = {
  requestId: string;
  markdown: string;
  clientLabel: string;
};

type McpWriteDecision = "approve" | "reject";

type McpRequestSelectionEvent = {
  requestId: string;
};

export type McpEditorSelection = {
  ok: true;
  mode: "rich-text" | "source" | "diff" | "unknown";
  hasSelection: boolean;
  text: string;
};

type PublishWebConnection = {
  host: string;
  port: number;
  username: string;
  remoteDirectory: string;
  remoteFilename: string;
  publicBaseUrl: string;
};

type PublishWebAuth =
  | { kind: "password"; password: string }
  | { kind: "key"; privateKeyPath: string; passphrase?: string };

type PublishWebInput = {
  transport: "sftp";
  currentPath: string | undefined;
  markdown: string;
  options?: ExportMarkdownHtmlOptions;
  connection: PublishWebConnection;
  auth: PublishWebAuth;
};

type PublishWebResult =
  | { ok: true; remotePath: string; url: string | null }
  | { ok: false; canceled: true }
  | { ok: false; error: string };

type SelectPrivateKeyResult = { canceled: true } | { canceled: false; filePath: string };

type QuickConnectInput = {
  transport: "quickconnect";
  currentPath: string | undefined;
  markdown: string;
  options?: ExportMarkdownHtmlOptions;
  connection: {
    url: string;
    path: string;
    token: string;
  };
};

type QuickConnectResult =
  | { ok: true; url: string | null }
  | { ok: false; error: string };

type QuickConnectTokenSaveResult = {
  stored: boolean;
  encryptionAvailable: boolean;
};

type ConfirmHostKeyEvent = {
  requestId: string;
  host: string;
  port: number;
  fingerprint: string;
};

type HostKeyDecision = "accept" | "reject";

declare global {
  interface Window {
    nexus?: {
      platform: NodeJS.Platform;
      onMenuAction(callback: (action: NexusMenuAction) => void): () => void;
      onOpenRecentFile(callback: (filePath: string) => void): () => void;
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
      openRecentFile(filePath: string): Promise<OpenMarkdownResult>;
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
      exportMarkdownAsWord(
        currentPath: string | undefined,
        markdown: string,
        options?: ExportMarkdownWordOptions
      ): Promise<SaveMarkdownResult>;
      exportMarkdownAsPdf(
        currentPath: string | undefined,
        markdown: string,
        options?: ExportMarkdownPdfOptions
      ): Promise<SaveMarkdownResult>;
      selectLocalImage(documentPath?: string): Promise<SelectLocalImageResult>;
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
      onMcpRequestSelection(callback: (event: McpRequestSelectionEvent) => void): () => void;
      resolveMcpSelection(requestId: string, selection: McpEditorSelection): void;
      publishWeb(payload: PublishWebInput): Promise<PublishWebResult>;
      publishQuickConnect(payload: QuickConnectInput): Promise<QuickConnectResult>;
      getQuickConnectToken(profileName: string): Promise<string>;
      setQuickConnectToken(
        profileName: string,
        token: string
      ): Promise<QuickConnectTokenSaveResult>;
      selectPrivateKeyFile(): Promise<SelectPrivateKeyResult>;
      onConfirmHostKey(callback: (event: ConfirmHostKeyEvent) => void): () => void;
      resolveHostKey(requestId: string, decision: HostKeyDecision): void;
      minimizeWindow(): Promise<void>;
      toggleMaximizeWindow(): Promise<void>;
      closeWindow(): Promise<void>;
      isWindowMaximized(): Promise<boolean>;
      onWindowMaximizeChange(callback: (isMaximized: boolean) => void): () => void;
      newWindow(): Promise<void>;
      quitApp(): Promise<void>;
    };
  }
}
