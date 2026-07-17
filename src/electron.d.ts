export {};

import type {
  AiAgentChatPayload,
  AiChatPayload,
  AiChatResult,
  AiChatStreamEvent,
  AiProviderId
} from "./lib/ai/providers";
import type { SelectionActionId, SelectionActionOptions } from "./lib/ai/prompts";

/** A tool advertised by the in-process MCP host (mirrors an MCP `tools/list` entry). */
export type McpToolDefinition = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

/** The content envelope an MCP tool call returns (matches the JSON-RPC `tools/call` result). */
export type McpToolResult = {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
};

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
  | "toggleSpellCheck"
  | "toggleOutline"
  | "togglePageOrientation"
  | "toggleResponsiveWrapping"
  | "togglePaperView"
  | "settings"
  | "aiSettings"
  | "about"
  | "copyHtml"
  | "editFrontmatter"
  | "publishWeb"
  | "publishQuickConnect"
  | "toggleAiChat"
  | "aiSelection"
  | "documentImport";

/**
 * Payload accompanying the "aiSelection" menu action; every other menu action carries no payload.
 * Mirrors the arguments of the renderer's selection-AI runner so a native menu click can drive it.
 */
export type AiSelectionMenuPayload = {
  action: SelectionActionId;
  options?: SelectionActionOptions;
};

type NexusMenuState = {
  editorZoomPercent?: number;
  showInvisibleCharacters?: boolean;
  spellCheckEnabled?: boolean;
  outlineVisible?: boolean;
  pageOrientation?: "portrait" | "landscape";
  responsiveContentWrappingEnabled?: boolean;
  paperViewEnabled?: boolean;
  aiChatVisible?: boolean;
  editorViewMode?: "rich-text" | "source" | "diff";
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

type ExportProgressEvent =
  | { active: true; title: string; message: string }
  | { active: false };

type SelectLocalImageResult =
  | { canceled: true }
  | { canceled: false; filePath: string; src: string };

type SelectBase64ImageResult =
  | { canceled: true }
  | { canceled: false; filePath: string; mimeType: string; dataUrl: string };

type DocumentImportImage = { mimeType: string; dataUrl: string; alt?: string };
type DocumentImportItem = {
  id: string;
  label: string;
  text: string;
  visionImage?: DocumentImportImage;
  embeddedImages: DocumentImportImage[];
};
type SelectDocumentImportResult =
  | { canceled: true }
  | { canceled: false; error: string }
  | { canceled: false; items: DocumentImportItem[]; warnings: string[] };

// Result of editing a diagram in the drawio editor window. On save, `dataUrl` is an editable-SVG
// `data:image/svg+xml` URL (the diagram source XML is embedded in the SVG) and `xml` is that source.
type EditDiagramResult =
  | { canceled: true }
  | { canceled: false; dataUrl: string; xml: string };

// Result of editing a diagram in the isoflow editor window. On save, `dataUrl` is an editable-SVG
// `data:image/svg+xml` URL (a PNG snapshot of the diagram with the isoflow model embedded in the
// SVG's `data-isoflow` attribute) and `model` is that source isoflow `Model` (JSON).
type EditIsoflowResult =
  | { canceled: true }
  | { canceled: false; dataUrl: string; model: unknown };

type EditOpenApiResult =
  | { canceled: true }
  | { canceled: false; yaml: string };

type EditSqlSchemaResult =
  | { canceled: true }
  | { canceled: false; schema: string };

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

export type McpConnectionProbe = {
  ok: boolean;
  status?: number;
  error?: string;
  url?: string;
};

export type McpConnectionTestResult = {
  local: McpConnectionProbe;
  ngrok: McpConnectionProbe | null;
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
      getAppVersion(): Promise<string>;
      onMenuAction(
        callback: (action: NexusMenuAction, payload?: AiSelectionMenuPayload) => void
      ): () => void;
      onOpenRecentFile(callback: (filePath: string) => void): () => void;
      onCloseRequest(callback: () => void): () => void;
      onExternalFileChange(callback: (event: ExternalFileChangeEvent) => void): () => void;
      onExportProgress(callback: (event: ExportProgressEvent) => void): () => void;
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
      getPathForFile(file: File): string;
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
      selectDocumentImportSources(): Promise<SelectDocumentImportResult>;
      resolveImagePreview(documentPath: string | undefined, imageSource: string): Promise<string>;
      readDiagramSvg(documentPath: string | undefined, src: string): Promise<string | null>;
      writeDiagramSvg(
        documentPath: string,
        svgText: string,
        kind: "drawio" | "isoflow"
      ): Promise<{ src: string; name: string } | { error: string }>;
      cleanupDiagramAssets(
        documentPath: string,
        keepNames: string[]
      ): Promise<{ removed: number }>;
      editDiagram(payload: { xml: string }): Promise<EditDiagramResult>;
      editIsoflow(payload: { model: unknown | null }): Promise<EditIsoflowResult>;
      editOpenApi(payload: { yaml: string; theme: "light" | "dark" }): Promise<EditOpenApiResult>;
      editSqlSchema(payload: { schema: string; theme: "light" | "dark" }): Promise<EditSqlSchemaResult>;
      confirmSaveChanges(): Promise<ConfirmSaveChangesResult>;
      setMenuState(state: NexusMenuState): void;
      configureMcpServer(config: ConfigureMcpServerInput): Promise<ConfigureMcpServerResult>;
      testMcpConnection(): Promise<McpConnectionTestResult>;
      stopMcpNgrok(): Promise<McpNgrokStatus>;
      restartMcpNgrok(config: ConfigureMcpServerInput): Promise<McpNgrokStatus>;
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
      getMcpBearerToken(profileName: string): Promise<string>;
      setMcpBearerToken(profileName: string, token: string): Promise<QuickConnectTokenSaveResult>;
      getAiProviderKey(profileName: string, providerId: AiProviderId): Promise<string>;
      setAiProviderKey(
        profileName: string,
        providerId: AiProviderId,
        key: string
      ): Promise<QuickConnectTokenSaveResult>;
      aiChat(payload: AiChatPayload): Promise<AiChatResult>;
      listMcpTools(): Promise<McpToolDefinition[]>;
      callMcpTool(payload: { name: string; args?: unknown }): Promise<McpToolResult>;
      startAiChatStream(requestId: string, payload: AiAgentChatPayload): void;
      abortAiChatStream(requestId: string): void;
      onAiChatStreamEvent(
        callback: (payload: { requestId: string; event: AiChatStreamEvent }) => void
      ): () => void;
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
    nexusOpenApiHost?: {
      ready(): void;
      onInit(callback: (payload: { yaml: string; theme: "light" | "dark" }) => void): void;
      save(result: { yaml: string }): void;
      cancel(): void;
    };
    nexusSqlSchemaHost?: {
      ready(): void;
      onInit(callback: (payload: { schema: string; theme: "light" | "dark" }) => void): void;
      save(result: { schema: string }): void;
      cancel(): void;
    };
  }
}
