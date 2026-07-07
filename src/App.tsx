import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorView, highlightWhitespace } from "@codemirror/view";
import {
  codeBlockPlugin,
  codeMirrorPlugin,
  directivesPlugin,
  diffSourcePlugin,
  frontmatterPlugin,
  headingsPlugin,
  imagePlugin,
  insertFrontmatter$,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownProcessingError$,
  markdownShortcutPlugin,
  MDXEditor,
  MDXEditorMethods,
  quotePlugin,
  searchPlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  viewMode$
} from "@mdxeditor/editor";
import type { ViewMode } from "@mdxeditor/editor";
import { useCellValues, usePublisher } from "@mdxeditor/gurx";
import { areMarkdownBuffersEquivalent, createDefaultDraft, saveDraft } from "./lib/markdown";
import { isOpenableDocumentFilename } from "./lib/fileDrop";
import {
  createDefaultSettings,
  getEditorPageSizeOption,
  loadSettings,
  readLegacyMcpBearerToken,
  readLegacyQuickConnectToken,
  resetSettings,
  saveSettings
} from "./lib/settings";
import type { EditorThemePreference } from "./lib/settings";
import type {
  AiSelectionMenuPayload,
  McpEditorSelection,
  McpNgrokStatus,
  NexusMenuAction
} from "./electron";
import AboutDialog from "./components/about/AboutDialog";
import EditorContextMenu from "./components/editor/EditorContextMenu";
import FindTextPanel from "./components/editor/FindTextPanel";
import FileChangedDialog from "./components/editor/FileChangedDialog";
import ExportProgressDialog from "./components/editor/ExportProgressDialog";
import { listExitPlugin } from "./components/editor/ListExitPlugin";
import ParseErrorPanel from "./components/editor/ParseErrorPanel";
import type { ParseErrorInfo } from "./components/editor/ParseErrorPanel";
import OutlineSidebar from "./components/editor/OutlineSidebar";
import { Titlebar } from "./components/titlebar/Titlebar";
import { extractOutline, getActiveHeadingIndex, type OutlineHeading } from "./lib/outline";
import { cleanupMarkdownFormatting } from "./lib/format";
import { insertTableOfContentsIntoBuffer } from "./lib/toc";
import PublishWebDialog from "./components/publish/PublishWebDialog";
import type {
  PendingHostKey,
  PublishResult,
  PublishSubmitValues
} from "./components/publish/PublishWebDialog";
import QuickConnectDialog from "./components/publish/QuickConnectDialog";
import type {
  QuickConnectFields,
  QuickConnectPublishResult
} from "./components/publish/QuickConnectDialog";
import { katexCodeBlockDescriptor } from "./components/editor/KatexCodeBlock";
import { localJavaScriptRunnerCodeBlockDescriptor } from "./components/editor/LocalJavaScriptCodeBlock";
import { mermaidCodeBlockDescriptor } from "./components/editor/MermaidCodeBlock";
import { githubAlertDirectiveDescriptor } from "./components/editor/GithubAlert";
import { admonitionDirectiveDescriptor } from "./components/editor/Admonition";
import { githubAlertsPlugin } from "./components/editor/githubAlertsPlugin";
import { pasteLinkPlugin } from "./components/editor/pasteLinkPlugin";
import { alignmentPlugin } from "./components/editor/alignmentPlugin";
import { footnotesPlugin } from "./components/editor/footnotesPlugin";
import { drawioPlugin } from "./components/editor/drawioPlugin";
import { isoflowPlugin } from "./components/editor/isoflowPlugin";
import { codeMirrorThemeExtensions } from "./components/editor/codeMirrorThemes";
import { sourceImagePasteExtension } from "./components/editor/sourceImagePaste";
import { readImageFileAsDataUrl } from "./lib/imagePaste";
import { DEMO_DOCUMENT_MARKDOWN } from "./lib/demoDocument";
import SettingsDialog from "./components/settings/SettingsDialog";
import AiSettingsDialog from "./components/settings/AiSettingsDialog";
import AiEditPreviewDialog from "./components/ai/AiEditPreviewDialog";
import AiChatPanel from "./components/ai/AiChatPanel";
import AiNotice from "./components/ai/AiNotice";
import { isImageUnsupportedError, resolveActiveProvider, runAiChat } from "./lib/ai/client";
import {
  buildImageToMarkdownPrompt,
  buildSelectionPrompt,
  describeSelectionAction
} from "./lib/ai/prompts";
import type { SelectionActionId, SelectionActionOptions } from "./lib/ai/prompts";
import { externalizeDiagrams, inlineDiagrams } from "./lib/diagramFiles";
import ShadcnMdxToolbar from "./components/editor/ShadcnMdxToolbar";
import McpWriteConfirmDialog from "./components/mcp/McpWriteConfirmDialog";
import StatusBar from "./components/statusbar/StatusBar";

const MCP_WINDOW_ID = (() => {
  const cryptoApi = typeof globalThis !== "undefined" ? (globalThis as { crypto?: Crypto }).crypto : undefined;
  if (cryptoApi?.randomUUID) {
    return `nexus-${cryptoApi.randomUUID()}`;
  }
  return `nexus-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
})();
const EDITOR_ZOOM_STEP_PERCENT = 10;
const MIN_EDITOR_ZOOM_PERCENT = 50;
const MAX_EDITOR_ZOOM_PERCENT = 200;
const EDITOR_SCROLL_SELECTORS = [
  ".mdxeditor-source-editor .cm-scroller",
  ".mdxeditor-diff-editor .cm-scroller",
  ".mdxeditor-rich-text-editor",
  ".mdxeditor-source-editor",
  ".mdxeditor-diff-editor"
];

type ScrollSnapshot = {
  ratio: number;
  top: number;
};

type ExternalFileChangePrompt = {
  filePath: string;
  kind: "changed" | "missing";
  markdown?: string;
  source: "external" | "refresh";
  timestamp: number;
};

type ProgrammaticMarkdownChange = {
  staleMarkdown: string;
  targetMarkdown: string;
};

type ResolvedTheme = "light" | "sky" | "dark";

function getDocumentName(filePath: string) {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] || filePath;
}

function slugifyForFilename(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "untitled";
}

function formatWindowTitle(filePath: string | undefined, isDirty: boolean) {
  const dirtyPrefix = isDirty ? "*" : "";

  if (!filePath) {
    return `${dirtyPrefix}Untitled`;
  }

  return `${dirtyPrefix}${getDocumentName(filePath)} (${filePath})`;
}

function hasUnsavedMarkdownChanges(markdown: string, lastSavedMarkdown: string) {
  return !areMarkdownBuffersEquivalent(markdown, lastSavedMarkdown);
}

function normalizeFilePathForComparison(filePath: string) {
  if (window.nexus?.platform !== "win32") {
    return filePath;
  }

  return filePath.replace(/\//g, "\\").toLowerCase();
}

function areFilePathsEquivalent(first: string | undefined, second: string | undefined) {
  return Boolean(
    first &&
      second &&
      normalizeFilePathForComparison(first) === normalizeFilePathForComparison(second)
  );
}

function DiffViewController({ request }: { request: number }) {
  const setViewMode = usePublisher(viewMode$);
  const handledRequestRef = useRef(0);

  useEffect(() => {
    if (request <= handledRequestRef.current) {
      return;
    }

    handledRequestRef.current = request;
    setViewMode("diff");
  }, [request, setViewMode]);

  return null;
}

// Triggers MDXEditor's frontmatter action from outside the toolbar (the Edit menu lives in the
// titlebar, outside the editor realm). Publishing insertFrontmatter$ creates the frontmatter
// block if absent and opens the editor dialog, covering both insert and edit.
function FrontmatterController({ request }: { request: number }) {
  const insertFrontmatter = usePublisher(insertFrontmatter$);
  const handledRequestRef = useRef(0);

  useEffect(() => {
    if (request <= handledRequestRef.current) {
      return;
    }

    handledRequestRef.current = request;
    insertFrontmatter();
  }, [request, insertFrontmatter]);

  return null;
}

function ViewModeTracker({
  viewModeRef,
  onModeChange
}: {
  viewModeRef: React.MutableRefObject<ViewMode>;
  onModeChange: (mode: ViewMode) => void;
}) {
  const [mode] = useCellValues(viewMode$);

  useEffect(() => {
    viewModeRef.current = mode;
    onModeChange(mode);
  }, [mode, onModeChange, viewModeRef]);

  return null;
}

function ParseErrorTracker({
  onErrorChange
}: {
  onErrorChange: (error: ParseErrorInfo | null) => void;
}) {
  const [error] = useCellValues(markdownProcessingError$);
  const callbackRef = useRef(onErrorChange);
  callbackRef.current = onErrorChange;

  useEffect(() => {
    callbackRef.current(error ?? null);
  }, [error]);

  return null;
}

function isVisibleElement(element: HTMLElement) {
  const styles = window.getComputedStyle(element);
  return (
    element.getClientRects().length > 0 &&
    styles.display !== "none" &&
    styles.visibility !== "hidden"
  );
}

function getEditorScrollElements(root: HTMLElement) {
  return EDITOR_SCROLL_SELECTORS.flatMap((selector) =>
    Array.from(root.querySelectorAll<HTMLElement>(selector))
  ).filter(isVisibleElement);
}

function getActiveEditorScrollElement(root: HTMLElement) {
  const elements = getEditorScrollElements(root);
  return elements.find((element) => element.scrollHeight > element.clientHeight) ?? elements[0];
}

function getScrollSnapshot(element: HTMLElement): ScrollSnapshot {
  const maxScrollTop = Math.max(element.scrollHeight - element.clientHeight, 0);

  return {
    ratio: maxScrollTop > 0 ? element.scrollTop / maxScrollTop : 0,
    top: element.scrollTop
  };
}

type SourceEditorView = {
  state: {
    doc: {
      length: number;
      lines: number;
      line: (lineNumber: number) => { from: number };
      toString: () => string;
    };
    selection: { main: { from: number; to: number } };
  };
  dispatch: (spec: { changes: { from: number; to: number; insert: string } }) => void;
  lineBlockAt: (position: number) => { top: number };
  scrollDOM: HTMLElement;
};

/**
 * The selection captured for an AI action. Held in a ref and refreshed on every non-empty editor
 * selection, so an action triggered from the AI menu (which moves focus and may collapse the live
 * DOM selection) still operates on the user's last real selection. `range` drives the rich-text apply
 * (restore + `insertMarkdown`); `source` drives the source-mode apply (a CodeMirror range dispatch).
 */
type EditorSelectionSnapshot = {
  mode: ViewMode;
  text: string;
  range: Range | null;
  source: { from: number; to: number } | null;
  activeElement: HTMLElement | null;
};

type PendingAiEdit = {
  actionLabel: string;
  originalText: string;
  proposedText: string;
};

type AiNoticeState = {
  message: string;
  needsProvider: boolean;
};

// Cap on the image sent to the vision model (decoded bytes), to avoid request timeouts / 413s on the
// `ai:chat` path. Checked against the base64 length before sending.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Reach the CodeMirror EditorView backing MDXEditor's source mode. MDXEditor does
 * not expose it, so we read the view CodeMirror stores on the content DOM node.
 * Deliberately defensive: any CodeMirror internals change degrades to "no
 * source-mode outline positions" (and a setMarkdown fallback for the clean-up
 * command) rather than throwing.
 */
function getSourceEditorView(root: HTMLElement): SourceEditorView | null {
  const content = root.querySelector(".mdxeditor-source-editor .cm-content") as
    | (HTMLElement & { cmTile?: { view?: SourceEditorView } })
    | null;
  const view = content?.cmTile?.view ?? null;
  if (
    !view ||
    typeof view.lineBlockAt !== "function" ||
    typeof view.dispatch !== "function" ||
    !view.scrollDOM
  ) {
    return null;
  }
  return view;
}

/** Top offset (within the source scroller's content) of a 0-based heading line. */
function getSourceHeadingTop(view: SourceEditorView, line: number): number {
  const lineNumber = line + 1;
  const { doc } = view.state;
  if (lineNumber < 1 || lineNumber > doc.lines) {
    return Number.POSITIVE_INFINITY;
  }
  return view.lineBlockAt(doc.line(lineNumber).from).top;
}

/**
 * Resolve each outline heading's top offset within the active scroll container for
 * the current editor mode, plus that scroller. Rich-text reads the rendered heading
 * elements (one per outline entry, in document order); source mode reads
 * CodeMirror's height model so positions are correct even for virtualized
 * (off-screen) lines. Returns null when the editor DOM for the mode is not ready.
 */
function getOutlineHeadingMetrics(
  root: HTMLElement,
  mode: ViewMode,
  headings: OutlineHeading[]
): { tops: number[]; scroller: HTMLElement } | null {
  if (mode === "source") {
    const view = getSourceEditorView(root);
    const scroller = root.querySelector<HTMLElement>(".mdxeditor-source-editor .cm-scroller");
    if (!view || !scroller) {
      return null;
    }
    return { tops: headings.map((heading) => getSourceHeadingTop(view, heading.line)), scroller };
  }

  const richText = root.querySelector<HTMLElement>(".mdxeditor-rich-text-editor");
  if (!richText) {
    return null;
  }

  const elements = Array.from(richText.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"));
  const containerTop = richText.getBoundingClientRect().top;
  const tops = headings.map((_heading, index) => {
    const element = elements[index];
    return element
      ? element.getBoundingClientRect().top - containerTop + richText.scrollTop
      : Number.POSITIVE_INFINITY;
  });
  return { tops, scroller: richText };
}

function applyScrollSnapshot(element: HTMLElement, snapshot: ScrollSnapshot) {
  const maxScrollTop = Math.max(element.scrollHeight - element.clientHeight, 0);
  element.scrollTop = maxScrollTop > 0 ? snapshot.ratio * maxScrollTop : snapshot.top;
}

function getRangeElement(range: Range) {
  const container = range.commonAncestorContainer;
  return container.nodeType === Node.ELEMENT_NODE
    ? (container as HTMLElement)
    : container.parentElement;
}

function resolveThemePreference(themePreference: EditorThemePreference): ResolvedTheme {
  if (themePreference === "light" || themePreference === "sky" || themePreference === "dark") {
    return themePreference;
  }

  // "system" follows the OS light/dark setting; light mode keeps the signature Sky look.
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "sky";
}

function clampEditorZoomPercent(zoomPercent: number) {
  return Math.min(
    MAX_EDITOR_ZOOM_PERCENT,
    Math.max(MIN_EDITOR_ZOOM_PERCENT, zoomPercent)
  );
}

/**
 * Approximate word count for the status bar: fenced code is skipped, and a
 * whitespace-separated token counts as a word when it has a letter or digit
 * (so bare Markdown punctuation like `*` or `---` is not counted).
 */
function countWords(markdown: string) {
  const withoutCodeBlocks = markdown.replace(/```[\s\S]*?```/g, " ");
  let count = 0;
  for (const token of withoutCodeBlocks.split(/\s+/)) {
    if (/[\p{L}\p{N}]/u.test(token)) {
      count += 1;
    }
  }
  return count;
}

function App() {
  const initialDraft = useMemo(createDefaultDraft, []);
  const [markdown, setMarkdown] = useState(initialDraft.markdown);
  const [filePath, setFilePath] = useState<string | undefined>(initialDraft.filePath);
  const [lastSavedMarkdown, setLastSavedMarkdown] = useState(initialDraft.markdown);
  const [previousVersionMarkdown, setPreviousVersionMarkdown] = useState<string | undefined>();
  const [diffMarkdown, setDiffMarkdown] = useState("");
  const [pendingDiffViewRequest, setPendingDiffViewRequest] = useState(0);
  const [pendingFindRequest, setPendingFindRequest] = useState(0);
  const [pendingReplaceRequest, setPendingReplaceRequest] = useState(0);
  const [pendingEditFrontmatterRequest, setPendingEditFrontmatterRequest] = useState(0);
  const [editorZoomPercent, setEditorZoomPercent] = useState(100);
  const [profileName, setProfileName] = useState("default");
  const [settings, setSettings] = useState(createDefaultSettings);
  // The QuickConnect bearer token is held in memory only; it is persisted encrypted at rest by the
  // main process (Electron safeStorage) rather than in localStorage with the other settings.
  const [quickConnectToken, setQuickConnectToken] = useState("");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveThemePreference(createDefaultSettings().themePreference)
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNotice, setAiNotice] = useState<AiNoticeState | null>(null);
  const [pendingAiEdit, setPendingAiEdit] = useState<PendingAiEdit | null>(null);
  const [exportProgress, setExportProgress] = useState<{ title: string; message: string } | null>(
    null
  );
  const [mcpNgrokStatus, setMcpNgrokStatus] = useState<McpNgrokStatus | null>(null);
  const [externalFileChangePrompt, setExternalFileChangePrompt] =
    useState<ExternalFileChangePrompt | null>(null);
  const [pendingMcpWrite, setPendingMcpWrite] = useState<
    { requestId: string; markdown: string; clientLabel: string } | null
  >(null);
  const [parseError, setParseError] = useState<ParseErrorInfo | null>(null);
  const [dismissedErrorKey, setDismissedErrorKey] = useState<string | null>(null);
  const [editorViewMode, setEditorViewMode] = useState<ViewMode>("rich-text");
  const [activeHeadingIndex, setActiveHeadingIndex] = useState(0);
  const [publishOpen, setPublishOpen] = useState(false);
  const [quickConnectOpen, setQuickConnectOpen] = useState(false);
  const [pendingHostKey, setPendingHostKey] = useState<
    (PendingHostKey & { requestId: string }) | null
  >(null);
  const editorRef = useRef<MDXEditorMethods>(null);
  const editorSurfaceRef = useRef<HTMLDivElement>(null);
  // Counts in-flight exports so overlapping exports keep the progress modal up until the last one
  // finishes (the renderer can't block the native menu the way the old modal window did).
  const exportProgressDepthRef = useRef(0);
  const editorScrollSnapshotRef = useRef<ScrollSnapshot>({ ratio: 0, top: 0 });
  const activeScrollElementRef = useRef<HTMLElement | null>(null);
  const isApplyingScrollRef = useRef(false);
  const filePathRef = useRef(filePath);
  const autoApproveMcpWritesRef = useRef(settings.mcpServer.autoApproveWrites);
  // Tracks the bearer token already written to the encrypted store, so the persist effect only writes
  // on genuine changes (and skips re-writing the value hydrated at startup).
  const persistedBearerTokenRef = useRef<string | null>(null);
  const hasHandledInitialOpenFileRef = useRef(false);
  const hasFocusedInitialEmptyEditorRef = useRef(false);
  const programmaticMarkdownChangeRef = useRef<ProgrammaticMarkdownChange | null>(null);
  const programmaticMarkdownChangeTimeoutRef = useRef<number | undefined>();
  // Bumped whenever a fresh document baseline is established (load, clear, save). A load defers
  // capturing MDXEditor's normalized serialization as the baseline; comparing the live token against
  // the one captured when that work was scheduled lets it bail out when a newer load/clear/save has
  // since superseded it.
  const documentLoadTokenRef = useRef(0);
  const currentViewModeRef = useRef<ViewMode>("rich-text");
  // The last non-empty editor selection, refreshed continuously so AI actions survive the focus
  // change of opening the AI menu. `pendingAiApplyRef` carries the snapshot + proposed text from the
  // preview dialog's accept handler to the deferred apply.
  const editorSelectionSnapshotRef = useRef<EditorSelectionSnapshot | null>(null);
  const pendingAiApplyRef = useRef<{ snapshot: EditorSelectionSnapshot; proposedText: string } | null>(
    null
  );
  const outlineHeadingsRef = useRef<OutlineHeading[]>([]);
  const menuHandlersRef = useRef({
    createNewDocument,
    openDocument,
    openRecentFile,
    loadDemoDocument,
    saveDocument,
    saveDocumentAs,
    exportDocumentAsHtml,
    exportDocumentAsWord,
    exportDocumentAsPdf,
    refreshDocumentFromDisk,
    compareWithPreviousVersion,
    openFindPanel,
    openReplacePanel,
    openFrontmatterEditor,
    zoomEditorIn,
    zoomEditorOut,
    resetEditorZoom,
    handleCloseRequest,
    focusInitialEmptyEditor,
    loadDocument,
    handleExternalFileChanged,
    openSettings: () => setSettingsOpen(true),
    openAiSettings: () => setAiSettingsOpen(true),
    openAbout: () => setAboutOpen(true),
    openPublishWeb: () => setPublishOpen(true),
    openPublishQuickConnect: () => setQuickConnectOpen(true),
    toggleShowInvisibles: () =>
      setSettings((current) => ({
        ...current,
        showInvisibleCharacters: !current.showInvisibleCharacters
      })),
    toggleSpellCheck: () =>
      setSettings((current) => ({
        ...current,
        spellCheckEnabled: !current.spellCheckEnabled
      })),
    toggleOutline: () =>
      setSettings((current) => ({
        ...current,
        outlineVisible: !current.outlineVisible
      })),
    toggleAiChat: () =>
      setSettings((current) => ({
        ...current,
        aiChatVisible: !current.aiChatVisible
      })),
    togglePageOrientation: () =>
      setSettings((current) => ({
        ...current,
        pageOrientation: current.pageOrientation === "landscape" ? "portrait" : "landscape"
      })),
    toggleResponsiveWrapping: () =>
      setSettings((current) => ({
        ...current,
        responsiveContentWrappingEnabled: !current.responsiveContentWrappingEnabled
      })),
    togglePaperView: () =>
      setSettings((current) => ({
        ...current,
        paperViewEnabled: !current.paperViewEnabled
      })),
    copyDocumentAsHtml,
    runSelectionAiAction,
    runImageToMarkdown
  });
  const appShellClassName = window.nexus?.platform === "win32" ? "app-shell app-shell-windows" : "app-shell";
  const titlebarFileName = filePath ? filePath.split(/[\\/]/).pop() ?? filePath : null;
  const editorSurfaceClassName = [
    "editor-surface",
    settings.paperViewEnabled ? "editor-surface-paper" : "editor-surface-plain",
    !settings.paperViewEnabled && settings.responsiveContentWrappingEnabled
      ? "editor-surface-responsive-wrap"
      : ""
  ]
    .filter(Boolean)
    .join(" ");
  const pageSizeOption = getEditorPageSizeOption(settings.pageSize);
  const editorPageWidthInches =
    settings.pageOrientation === "landscape"
      ? pageSizeOption.heightInches
      : pageSizeOption.widthInches;
  const editorPageHeightInches =
    settings.pageOrientation === "landscape"
      ? pageSizeOption.widthInches
      : pageSizeOption.heightInches;
  const editorZoomScale = editorZoomPercent / 100;
  const editorStyle = {
    "--editor-font-family": settings.fontFamily,
    "--editor-font-size": `${settings.fontSizePixels * editorZoomScale}px`,
    "--editor-page-width": `${editorPageWidthInches * editorZoomScale}in`,
    "--editor-page-height": `${editorPageHeightInches * editorZoomScale}in`,
    "--editor-page-margin-top": `${settings.pageMargins.top * editorZoomScale}in`,
    "--editor-page-margin-right": `${settings.pageMargins.right * editorZoomScale}in`,
    "--editor-page-margin-bottom": `${settings.pageMargins.bottom * editorZoomScale}in`,
    "--editor-page-margin-left": `${settings.pageMargins.left * editorZoomScale}in`,
    "--editor-paragraph-spacing": `${settings.paragraphSpacingPixels * editorZoomScale}px`,
    "--outline-width": `${settings.outlineWidthPixels}px`
  } as React.CSSProperties;
  const isDirty = hasUnsavedMarkdownChanges(markdown, lastSavedMarkdown);
  const parseErrorKey = parseError ? `${parseError.error}|${parseError.source}` : null;
  const showParseError = parseError !== null && parseErrorKey !== dismissedErrorKey;
  const outlineHeadings = useMemo(() => extractOutline(markdown), [markdown]);
  const wordCount = useMemo(() => countWords(markdown), [markdown]);
  // CodeMirror (code blocks + source mode) gets a theme matched to the app theme: nord for dark,
  // the idea light theme for sky/light. Whitespace markers layer on top when enabled.
  const codeMirrorExtensions = useMemo(
    () => [
      ...codeMirrorThemeExtensions(resolvedTheme),
      ...(settings.showInvisibleCharacters ? [highlightWhitespace()] : [])
    ],
    [resolvedTheme, settings.showInvisibleCharacters]
  );
  // The source/diff editor gets the shared CodeMirror config plus image-paste support, so pasting a
  // clipboard image embeds it as a base64 markdown image (mirroring rich-text mode). Code blocks keep
  // the plain `codeMirrorExtensions` so an image paste there is left to the default behavior.
  const sourceCodeMirrorExtensions = useMemo(
    () => [
      ...codeMirrorExtensions,
      sourceImagePasteExtension(),
      // CodeMirror disables spell check by default; mirror the editor-wide preference so source mode
      // matches rich-text mode. (Code blocks keep the plain `codeMirrorExtensions` and stay unchecked.)
      EditorView.contentAttributes.of({
        spellcheck: settings.spellCheckEnabled ? "true" : "false"
      })
    ],
    [codeMirrorExtensions, settings.spellCheckEnabled]
  );
  outlineHeadingsRef.current = outlineHeadings;
  // The outline lives only in rich-text mode; source and diff modes hide it and disable the toggle.
  // settings.outlineVisible is left untouched while in those modes, so the panel's open/closed state
  // is remembered and restored automatically when the user returns to rich-text.
  const canToggleOutline = editorViewMode === "rich-text";
  const showOutlineSidebar = settings.outlineVisible && canToggleOutline;
  const defaultPublishFilename = useMemo(() => {
    if (filePath) {
      const base = getDocumentName(filePath).replace(/\.[^.]+$/, "");
      return `${slugifyForFilename(base)}.html`;
    }

    const firstHeading = outlineHeadings[0]?.text;
    if (firstHeading) {
      return `${slugifyForFilename(firstHeading)}.html`;
    }

    return "untitled.html";
  }, [filePath, outlineHeadings]);
  const imagePreviewHandler = useMemo(() => {
    return (imageSource: string) => {
      return window.nexus?.resolveImagePreview(filePath, imageSource) ?? Promise.resolve(imageSource);
    };
  }, [filePath]);
  const scrollFindMatchIntoView = useCallback((range: Range) => {
    const root = editorSurfaceRef.current;
    const rangeElement = getRangeElement(range);
    const rangeRect = Array.from(range.getClientRects()).find(
      (rect) => rect.width > 0 && rect.height > 0
    );

    if (!root || !rangeElement || !rangeRect) {
      rangeElement?.scrollIntoView({ block: "center", inline: "nearest" });
      return;
    }

    const scrollElement =
      getEditorScrollElements(root).find(
        (element) => element.contains(rangeElement) && element.scrollHeight > element.clientHeight
      ) ?? getActiveEditorScrollElement(root);

    if (!scrollElement) {
      rangeElement.scrollIntoView({ block: "center", inline: "nearest" });
      return;
    }

    const containerRect = scrollElement.getBoundingClientRect();
    const matchTop = rangeRect.top - containerRect.top;
    const matchBottom = rangeRect.bottom - containerRect.top;
    const topComfort = Math.min(120, scrollElement.clientHeight * 0.28);
    const bottomComfort = Math.min(96, scrollElement.clientHeight * 0.24);

    if (matchTop >= topComfort && matchBottom <= scrollElement.clientHeight - bottomComfort) {
      return;
    }

    const targetTop =
      scrollElement.scrollTop + matchTop - Math.max(topComfort, scrollElement.clientHeight * 0.38);
    scrollElement.scrollTo({
      behavior: "smooth",
      top: Math.max(0, targetTop)
    });
  }, []);

  const scrollOutlineHeadingIntoView = useCallback((heading: OutlineHeading) => {
    const root = editorSurfaceRef.current;
    if (!root) {
      return;
    }

    if (currentViewModeRef.current === "source") {
      const view = getSourceEditorView(root);
      if (view) {
        const top = getSourceHeadingTop(view, heading.line);
        if (Number.isFinite(top)) {
          const comfort = Math.min(24, view.scrollDOM.clientHeight * 0.1);
          view.scrollDOM.scrollTo({ behavior: "smooth", top: Math.max(0, top - comfort) });
        }
        return;
      }
      // Fall through to the DOM-based path if the CodeMirror view is unavailable.
    }

    const richTextEditor = root.querySelector<HTMLElement>(".mdxeditor-rich-text-editor");
    const headingScope = richTextEditor ?? root;
    const headings = Array.from(
      headingScope.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")
    );
    const target = headings[heading.index];
    if (!target) {
      return;
    }

    const scrollElement =
      getEditorScrollElements(root).find(
        (element) => element.contains(target) && element.scrollHeight > element.clientHeight
      ) ?? getActiveEditorScrollElement(root);

    if (!scrollElement) {
      target.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }

    const containerRect = scrollElement.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const comfort = Math.min(24, scrollElement.clientHeight * 0.1);
    const targetTop = scrollElement.scrollTop + (targetRect.top - containerRect.top) - comfort;

    scrollElement.scrollTo({
      behavior: "smooth",
      top: Math.max(0, targetTop)
    });
  }, []);

  filePathRef.current = filePath;
  autoApproveMcpWritesRef.current = settings.mcpServer.autoApproveWrites;
  menuHandlersRef.current = {
    createNewDocument,
    openDocument,
    openRecentFile,
    loadDemoDocument,
    saveDocument,
    saveDocumentAs,
    exportDocumentAsHtml,
    exportDocumentAsWord,
    exportDocumentAsPdf,
    refreshDocumentFromDisk,
    compareWithPreviousVersion,
    openFindPanel,
    openReplacePanel,
    openFrontmatterEditor,
    zoomEditorIn,
    zoomEditorOut,
    resetEditorZoom,
    handleCloseRequest,
    focusInitialEmptyEditor,
    loadDocument,
    handleExternalFileChanged,
    openSettings: () => setSettingsOpen(true),
    openAiSettings: () => setAiSettingsOpen(true),
    openAbout: () => setAboutOpen(true),
    openPublishWeb: () => setPublishOpen(true),
    openPublishQuickConnect: () => setQuickConnectOpen(true),
    toggleShowInvisibles: () =>
      setSettings((current) => ({
        ...current,
        showInvisibleCharacters: !current.showInvisibleCharacters
      })),
    toggleSpellCheck: () =>
      setSettings((current) => ({
        ...current,
        spellCheckEnabled: !current.spellCheckEnabled
      })),
    toggleOutline: () =>
      setSettings((current) => ({
        ...current,
        outlineVisible: !current.outlineVisible
      })),
    toggleAiChat: () =>
      setSettings((current) => ({
        ...current,
        aiChatVisible: !current.aiChatVisible
      })),
    togglePageOrientation: () =>
      setSettings((current) => ({
        ...current,
        pageOrientation: current.pageOrientation === "landscape" ? "portrait" : "landscape"
      })),
    toggleResponsiveWrapping: () =>
      setSettings((current) => ({
        ...current,
        responsiveContentWrappingEnabled: !current.responsiveContentWrappingEnabled
      })),
    togglePaperView: () =>
      setSettings((current) => ({
        ...current,
        paperViewEnabled: !current.paperViewEnabled
      })),
    copyDocumentAsHtml,
    runSelectionAiAction,
    runImageToMarkdown
  };

  useEffect(() => {
    return () => {
      if (programmaticMarkdownChangeTimeoutRef.current !== undefined) {
        window.clearTimeout(programmaticMarkdownChangeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    saveDraft({ markdown, filePath });
  }, [filePath, markdown]);

  useEffect(() => {
    if (parseError === null) {
      setDismissedErrorKey(null);
    }
  }, [parseError]);

  useEffect(() => {
    let isMounted = true;

    async function initializeProfileSettings() {
      const nextProfileName = (await window.nexus?.getProfileName()) ?? "default";
      if (!isMounted) {
        return;
      }

      // Capture any legacy plaintext tokens before setSettings triggers the save effect, which
      // rewrites localStorage without them (these secrets are no longer persisted there).
      const legacyToken = readLegacyQuickConnectToken(nextProfileName);
      const legacyBearerToken = readLegacyMcpBearerToken(nextProfileName);

      setProfileName(nextProfileName);
      setSettings(loadSettings(nextProfileName));

      // The token now lives only in the main-process encrypted store. Load it, migrating a legacy
      // plaintext token into the encrypted store on the first launch after upgrading.
      let token = (await window.nexus?.getQuickConnectToken(nextProfileName)) ?? "";
      if (!token && legacyToken) {
        token = legacyToken;
        await window.nexus?.setQuickConnectToken(nextProfileName, legacyToken);
      }

      if (isMounted) {
        setQuickConnectToken(token);
      }

      // The MCP bearer token is likewise encrypted at rest. Load it (migrating a legacy plaintext
      // token once), then merge it into the in-memory settings so the server and dialog see it.
      let bearerToken = (await window.nexus?.getMcpBearerToken(nextProfileName)) ?? "";
      if (!bearerToken && legacyBearerToken) {
        bearerToken = legacyBearerToken;
        await window.nexus?.setMcpBearerToken(nextProfileName, legacyBearerToken);
      }

      if (isMounted && bearerToken) {
        // Record the hydrated value so the persist effect does not write it straight back.
        persistedBearerTokenRef.current = bearerToken;
        setSettings((current) => ({
          ...current,
          mcpServer: { ...current.mcpServer, bearerToken }
        }));
      }
    }

    void initializeProfileSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    saveSettings(profileName, settings);
  }, [profileName, settings]);

  useEffect(() => {
    const bearerToken = settings.mcpServer.bearerToken;
    // An empty token means "none yet" — never clear the encrypted store from here, which would race
    // the startup hydration that loads it. Only persist a genuine new value (enable/regenerate).
    if (!bearerToken || bearerToken === persistedBearerTokenRef.current) {
      return;
    }
    persistedBearerTokenRef.current = bearerToken;
    void window.nexus?.setMcpBearerToken(profileName, bearerToken);
  }, [profileName, settings.mcpServer.bearerToken]);

  useEffect(() => {
    let isCurrent = true;

    async function configureMcp() {
      const result = await window.nexus?.configureMcpServer({
        enabled: settings.mcpServer.enabled,
        port: settings.mcpServer.port,
        authMode: settings.mcpServer.authMode,
        bearerToken: settings.mcpServer.bearerToken,
        ngrokEnabled: settings.mcpServer.ngrokEnabled,
        ngrokDomain: settings.mcpServer.ngrokDomain,
        ngrokUseCustomPath: settings.mcpServer.ngrokUseCustomPath,
        ngrokPath: settings.mcpServer.ngrokPath
      });

      if (isCurrent) {
        setMcpNgrokStatus(result?.ngrok ?? null);
      }
    }

    void configureMcp();

    return () => {
      isCurrent = false;
    };
  }, [
    settings.mcpServer.enabled,
    settings.mcpServer.port,
    settings.mcpServer.authMode,
    settings.mcpServer.bearerToken,
    settings.mcpServer.ngrokEnabled,
    settings.mcpServer.ngrokDomain,
    settings.mcpServer.ngrokUseCustomPath,
    settings.mcpServer.ngrokPath
  ]);

  useEffect(() => {
    window.nexus?.setMenuState({
      editorZoomPercent,
      showInvisibleCharacters: settings.showInvisibleCharacters,
      spellCheckEnabled: settings.spellCheckEnabled,
      outlineVisible: settings.outlineVisible,
      pageOrientation: settings.pageOrientation,
      responsiveContentWrappingEnabled: settings.responsiveContentWrappingEnabled,
      paperViewEnabled: settings.paperViewEnabled,
      aiChatVisible: settings.aiChatVisible,
      editorViewMode
    });
  }, [
    editorZoomPercent,
    settings.showInvisibleCharacters,
    settings.spellCheckEnabled,
    settings.outlineVisible,
    settings.pageOrientation,
    settings.responsiveContentWrappingEnabled,
    settings.paperViewEnabled,
    settings.aiChatVisible,
    editorViewMode
  ]);

  useEffect(() => {
    const updateResolvedTheme = () => {
      setResolvedTheme(resolveThemePreference(settings.themePreference));
    };

    updateResolvedTheme();

    if (settings.themePreference !== "system" || !window.matchMedia) {
      return;
    }

    const colorSchemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    colorSchemeQuery.addEventListener("change", updateResolvedTheme);

    return () => {
      colorSchemeQuery.removeEventListener("change", updateResolvedTheme);
    };
  }, [settings.themePreference]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    // Sky is a light-based theme; only dark maps to the dark color-scheme keyword.
    document.documentElement.style.colorScheme = resolvedTheme === "dark" ? "dark" : "light";

    return () => {
      delete document.documentElement.dataset.theme;
      document.documentElement.style.colorScheme = "";
    };
  }, [resolvedTheme]);

  // The overlaid outline starts just below the docked ribbon, but the ribbon is not a fixed
  // 64px bar: its height grows by the height of the horizontal scrollbar when the toolbar
  // overflows. Track the live toolbar height in a CSS variable so the outline sits flush
  // beneath it (sharing the ribbon's bottom border) instead of overlapping the scrollbar.
  // Re-find the toolbar whenever the editor remounts (key change) or the view mode swaps the
  // docked bar for the floating one; a ResizeObserver keeps it in sync as the window resizes.
  useEffect(() => {
    const surface = editorSurfaceRef.current;
    if (!surface) {
      return;
    }

    let frame = 0;
    let attempts = 0;
    let resizeObserver: ResizeObserver | null = null;

    const attach = () => {
      const toolbar = surface.querySelector<HTMLElement>(
        ".mdxeditor-toolbar:not(:has(.nexus-shadcn-toolbar-floating))"
      );
      if (!toolbar) {
        // No docked bar yet (still mounting) or it is floating (diff mode); fall back to the
        // CSS default and retry a few frames in case MDXEditor has not painted the bar.
        surface.style.removeProperty("--nexus-toolbar-height");
        if (attempts++ < 10) {
          frame = requestAnimationFrame(attach);
        }
        return;
      }

      const syncHeight = () => {
        surface.style.setProperty("--nexus-toolbar-height", `${toolbar.offsetHeight}px`);
      };
      resizeObserver = new ResizeObserver(syncHeight);
      resizeObserver.observe(toolbar);
      syncHeight();
    };

    attach();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
    };
  }, [editorViewMode, resolvedTheme, settings.showInvisibleCharacters, settings.spellCheckEnabled]);

  useEffect(() => {
    document.title = formatWindowTitle(
      filePath,
      hasUnsavedMarkdownChanges(markdown, lastSavedMarkdown)
    );
  }, [filePath, lastSavedMarkdown, markdown]);

  useEffect(() => {
    if (!window.nexus) {
      return;
    }

    window.nexus.registerMcpWindow({
      windowId: MCP_WINDOW_ID,
      title: formatWindowTitle(filePath, hasUnsavedMarkdownChanges(markdown, lastSavedMarkdown)),
      filePath: filePath ?? null,
      dirty: hasUnsavedMarkdownChanges(markdown, lastSavedMarkdown),
      markdown,
      exportOptions: {
        word: getWordExportOptions()
      }
    });

    const handleBeforeUnload = () => {
      window.nexus?.unregisterMcpWindow();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.nexus?.unregisterMcpWindow();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    window.nexus?.updateMcpWindowState({
      title: formatWindowTitle(filePath, hasUnsavedMarkdownChanges(markdown, lastSavedMarkdown)),
      filePath: filePath ?? null,
      dirty: hasUnsavedMarkdownChanges(markdown, lastSavedMarkdown),
      markdown,
      exportOptions: {
        // Derived inline from settings (already a dependency below) so this effect's dependency
        // list is exhaustive without depending on the per-render getWordExportOptions identity.
        word: {
          fontFamily: settings.fontFamily,
          fontSizePixels: settings.fontSizePixels,
          paragraphSpacingPixels: settings.paragraphSpacingPixels,
          pageMargins: settings.pageMargins
        }
      }
    });
  }, [filePath, lastSavedMarkdown, markdown, settings]);

  useEffect(() => {
    if (!window.nexus) {
      return;
    }

    return window.nexus.onMcpConfirmWrite((payload) => {
      // When the user has opted into auto-approve, apply the write immediately and skip the dialog.
      if (autoApproveMcpWritesRef.current) {
        applyApprovedMcpWrite(payload.requestId, payload.markdown);
        return;
      }

      setPendingMcpWrite((current) => {
        if (current) {
          window.nexus?.resolveMcpWrite(payload.requestId, "reject");
          return current;
        }
        return payload;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!window.nexus) {
      return;
    }

    return window.nexus.onMcpRequestSelection((payload) => {
      window.nexus?.resolveMcpSelection(payload.requestId, readEditorSelection());
    });
  }, []);

  useEffect(() => {
    if (!window.nexus) {
      return;
    }

    return window.nexus.onConfirmHostKey((payload) => {
      setPendingHostKey(payload);
    });
  }, []);

  // Continuously snapshot the editor's selection so AI actions can run from the AI menu — opening it
  // moves focus and may collapse the live selection. Only non-empty selections inside the editor
  // surface update the snapshot, so the last real selection survives the focus change.
  useEffect(() => {
    function handleSelectionChange() {
      const surface = editorSurfaceRef.current;
      const selection = typeof window !== "undefined" ? window.getSelection() : null;
      if (!surface || !selection || selection.rangeCount === 0) {
        return;
      }

      const anchorNode = selection.anchorNode;
      if (!anchorNode || !surface.contains(anchorNode)) {
        return;
      }

      const text = selection.toString();
      if (!text.trim()) {
        // The selection collapsed *inside* the editor (the user clicked or typed here). Forget the
        // snapshot so the AI chat and selection actions don't act on a selection that no longer
        // exists. A collapse caused by focus moving into the chat keeps the snapshot, because that
        // selection change has its anchor outside the surface and returned above.
        editorSelectionSnapshotRef.current = null;
        return;
      }

      const mode = currentViewModeRef.current ?? "rich-text";
      let source: { from: number; to: number } | null = null;
      if (mode === "source") {
        const view = getSourceEditorView(surface);
        const main = view?.state.selection?.main;
        if (main && main.from !== main.to) {
          source = { from: main.from, to: main.to };
        }
      }

      editorSelectionSnapshotRef.current = {
        mode,
        text,
        range: selection.getRangeAt(0).cloneRange(),
        source,
        activeElement: document.activeElement instanceof HTMLElement ? document.activeElement : null
      };
    }

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, []);

  useEffect(() => {
    if (!window.nexus) {
      return;
    }

    // The main process drives this while a long export runs. Counting active exports keeps the modal
    // visible until the last one settles, even if the user kicks off a second export mid-render.
    return window.nexus.onExportProgress((event) => {
      if (event.active) {
        exportProgressDepthRef.current += 1;
        setExportProgress({ title: event.title, message: event.message });
        return;
      }

      exportProgressDepthRef.current = Math.max(0, exportProgressDepthRef.current - 1);
      if (exportProgressDepthRef.current === 0) {
        setExportProgress(null);
      }
    });
  }, []);

  function applyApprovedMcpWrite(requestId: string, nextMarkdown: string) {
    beginProgrammaticMarkdownChange(nextMarkdown);
    editorRef.current?.setMarkdown(nextMarkdown);
    setMarkdown(nextMarkdown);
    window.nexus?.resolveMcpWrite(requestId, "approve");
  }

  function approvePendingMcpWrite() {
    setPendingMcpWrite((pending) => {
      if (!pending) {
        return null;
      }

      applyApprovedMcpWrite(pending.requestId, pending.markdown);
      return null;
    });
  }

  function rejectPendingMcpWrite() {
    setPendingMcpWrite((pending) => {
      if (!pending) {
        return null;
      }

      window.nexus?.resolveMcpWrite(pending.requestId, "reject");
      return null;
    });
  }

  async function handlePublishSubmit(values: PublishSubmitValues): Promise<PublishResult> {
    // Persist only the non-secret connection fields so the next publish is pre-filled.
    setSettings((current) => ({
      ...current,
      publishTarget: {
        host: values.connection.host,
        port: values.connection.port,
        username: values.connection.username,
        remoteDirectory: values.connection.remoteDirectory,
        publicBaseUrl: values.connection.publicBaseUrl
      }
    }));

    if (!window.nexus) {
      return { ok: false, error: "Publishing is only available in the desktop app." };
    }

    const result = await window.nexus.publishWeb({
      transport: "sftp",
      currentPath: filePath,
      markdown: getCurrentMarkdown(),
      options: {
        fontFamily: settings.fontFamily,
        fontSizePixels: settings.fontSizePixels,
        paragraphSpacingPixels: settings.paragraphSpacingPixels
      },
      connection: values.connection,
      auth: values.auth
    });

    // The publish has settled; drop any host-key prompt that is still showing.
    setPendingHostKey(null);
    return result;
  }

  function acceptHostKey() {
    setPendingHostKey((current) => {
      if (current) {
        window.nexus?.resolveHostKey(current.requestId, "accept");
      }
      return null;
    });
  }

  function rejectHostKey() {
    setPendingHostKey((current) => {
      if (current) {
        window.nexus?.resolveHostKey(current.requestId, "reject");
      }
      return null;
    });
  }

  async function handleQuickConnectSubmit(
    values: QuickConnectFields
  ): Promise<QuickConnectPublishResult> {
    // Persist only the non-secret url and path in local settings for next time.
    setSettings((current) => ({
      ...current,
      quickConnect: {
        url: values.url,
        path: values.path
      }
    }));

    // Keep the token in memory for this session and store it encrypted at rest via the main process.
    setQuickConnectToken(values.token);
    void window.nexus?.setQuickConnectToken(profileName, values.token);

    if (!window.nexus) {
      return { ok: false, error: "Publishing is only available in the desktop app." };
    }

    return window.nexus.publishQuickConnect({
      transport: "quickconnect",
      currentPath: filePath,
      markdown: getCurrentMarkdown(),
      options: {
        fontFamily: settings.fontFamily,
        fontSizePixels: settings.fontSizePixels,
        paragraphSpacingPixels: settings.paragraphSpacingPixels
      },
      connection: values
    });
  }

  useEffect(() => {
    if (!window.nexus) {
      return;
    }

    if (!filePath) {
      void window.nexus.unwatchMarkdownFile();
      return;
    }

    void window.nexus.watchMarkdownFile(filePath).catch(() => {
      // The document can stay open even if the file disappears before watching starts.
    });

    return () => {
      void window.nexus?.unwatchMarkdownFile();
    };
  }, [filePath]);

  // Drag a Markdown file onto the window to open it (same as File → Open). Capture phase so a file
  // dropped inside the editor is intercepted before Lexical's own drop handling swallows it; image and
  // other non-document drops fall through to the editor. Internal text drags carry no "Files" type and
  // are left untouched, so reordering text by drag still works.
  useEffect(() => {
    if (!window.nexus) {
      return;
    }

    function allowFileDrag(event: DragEvent) {
      if (Array.from(event.dataTransfer?.types ?? []).includes("Files")) {
        event.preventDefault();
      }
    }

    function handleFileDrop(event: DragEvent) {
      const transfer = event.dataTransfer;
      if (!transfer || !Array.from(transfer.types).includes("Files")) {
        return;
      }

      const documentFile = Array.from(transfer.files).find((file) =>
        isOpenableDocumentFilename(file.name)
      );

      if (documentFile) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const droppedPath = window.nexus?.getPathForFile(documentFile);
        if (droppedPath) {
          void menuHandlersRef.current.openRecentFile(droppedPath);
        }
        return;
      }

      // A non-document file dropped onto the chrome (outside the editor) would otherwise navigate the
      // window to that file; swallow it. Drops inside the editor stay with its own image handling.
      if (!editorSurfaceRef.current?.contains(event.target as Node)) {
        event.preventDefault();
      }
    }

    window.addEventListener("dragover", allowFileDrag, true);
    window.addEventListener("drop", handleFileDrop, true);
    return () => {
      window.removeEventListener("dragover", allowFileDrag, true);
      window.removeEventListener("drop", handleFileDrop, true);
    };
  }, []);

  useEffect(() => {
    if (!window.nexus) {
      return;
    }

    async function showExternalFileChangePrompt(event: {
      filePath: string;
      kind: "changed" | "missing";
      timestamp: number;
    }) {
      if (!areFilePathsEquivalent(filePathRef.current, event.filePath)) {
        return;
      }

      if (event.kind === "missing") {
        setExternalFileChangePrompt({
          filePath: event.filePath,
          kind: event.kind,
          source: "external",
          timestamp: event.timestamp
        });
        return;
      }

      try {
        const result = await window.nexus?.readWatchedMarkdownFile(event.filePath);
        if (!result || result.canceled) {
          return;
        }

        // Decision (auto-reload vs. conflict dialog) needs the current dirty state, so route it through
        // the fresh-closure handlers ref rather than this once-mounted effect's stale scope.
        menuHandlersRef.current.handleExternalFileChanged(
          result.filePath,
          result.markdown,
          event.timestamp
        );
      } catch {
        setExternalFileChangePrompt({
          filePath: event.filePath,
          kind: "missing",
          source: "external",
          timestamp: Date.now()
        });
      }
    }

    return window.nexus.onExternalFileChange((event) => {
      void showExternalFileChangePrompt(event);
    });
  }, []);

  function requestDiffView(nextDiffMarkdown: string) {
    setDiffMarkdown(nextDiffMarkdown);
    setPendingDiffViewRequest((current) => current + 1);
  }

  function reviewExternalFileDiff() {
    if (typeof externalFileChangePrompt?.markdown !== "string") {
      return;
    }

    requestDiffView(externalFileChangePrompt.markdown);
    setExternalFileChangePrompt(null);
  }

  // Pull an external change into the editor and show a normalized before/after diff. Both sides pass
  // through MDXEditor's serializer (the pre-reload editor content is already normalized; the incoming
  // disk content is normalized by loadDocument), so a coding-harness rewrite that only differs in raw
  // Markdown style — `-` vs `*` bullets, `_x_` vs `*x*`, blank-line padding — collapses to nothing and
  // only the real edits show. The editor lands on the new content so editing continues on top of it.
  async function reloadExternalChangeIntoDiff(diskMarkdown: string, changedFilePath: string) {
    const previousMarkdown = getCurrentMarkdown();
    setExternalFileChangePrompt(null);
    await loadDocument(diskMarkdown, changedFilePath, { previousVersionMarkdown: previousMarkdown });
    requestDiffView(previousMarkdown);
  }

  // A watched file changed on disk. With no unsaved edits (the common "let the harness edit while I
  // watch" case) there is no conflict, so skip the dialog entirely: auto-reload and drop straight into
  // the clean diff. Unsaved edits mean a genuine conflict — fall back to the dialog so nothing is lost.
  function handleExternalFileChanged(changedFilePath: string, diskMarkdown: string, timestamp: number) {
    const currentIsDirty = hasUnsavedMarkdownChanges(getCurrentMarkdown(), lastSavedMarkdown);
    if (!currentIsDirty) {
      void reloadExternalChangeIntoDiff(diskMarkdown, changedFilePath);
      return;
    }
    setExternalFileChangePrompt({
      filePath: changedFilePath,
      kind: "changed",
      markdown: diskMarkdown,
      source: "external",
      timestamp
    });
  }

  function compareWithPreviousVersion() {
    if (previousVersionMarkdown === undefined) {
      return;
    }

    requestDiffView(previousVersionMarkdown);
  }

  function openFindPanel() {
    setPendingFindRequest((current) => current + 1);
  }

  function openReplacePanel() {
    setPendingReplaceRequest((current) => current + 1);
  }

  function openFrontmatterEditor() {
    setPendingEditFrontmatterRequest((current) => current + 1);
  }

  function insertTableOfContents() {
    const current = getCurrentMarkdown();
    const next = insertTableOfContentsIntoBuffer(current);
    if (next === current) {
      return;
    }

    // Rewrite the whole buffer (TOC goes at the top), reusing the same programmatic-change guard
    // the MCP write path uses so the edit is not misread as a stale onChange.
    beginProgrammaticMarkdownChange(next);
    editorRef.current?.setMarkdown(next);
    setMarkdown(next);
  }

  function cleanUpFormatting() {
    const current = getCurrentMarkdown();
    const next = cleanupMarkdownFormatting(current);
    if (next === current) {
      return;
    }

    // The command is offered only in source mode. Replace the CodeMirror buffer in place instead of
    // calling setMarkdown: setMarkdown re-runs MDXEditor's own Markdown serializer, which would undo
    // the surgical cleanup (re-imposing `*` bullets, `***` breaks, escaping, etc.). Editing the
    // source buffer directly keeps the cleaned text verbatim, and the source plugin still syncs the
    // change into MDXEditor's markdown state. The onChange this triggers updates dirty tracking; we
    // also set it here so React state is consistent immediately.
    const sourceView = editorSurfaceRef.current
      ? getSourceEditorView(editorSurfaceRef.current)
      : null;
    if (sourceView) {
      sourceView.dispatch({
        changes: { from: 0, to: sourceView.state.doc.length, insert: next }
      });
      setMarkdown(next);
      return;
    }

    // Fallback when the CodeMirror view is unreachable: round-trip through the editor API. This
    // re-serializes through MDXEditor, but keeps the command working.
    beginProgrammaticMarkdownChange(next);
    editorRef.current?.setMarkdown(next);
    setMarkdown(next);
  }

  function zoomEditorIn() {
    setEditorZoomPercent((current) =>
      clampEditorZoomPercent(current + EDITOR_ZOOM_STEP_PERCENT)
    );
  }

  function zoomEditorOut() {
    setEditorZoomPercent((current) =>
      clampEditorZoomPercent(current - EDITOR_ZOOM_STEP_PERCENT)
    );
  }

  function resetEditorZoom() {
    setEditorZoomPercent(100);
  }

  function beginProgrammaticMarkdownChange(targetMarkdown: string) {
    const staleMarkdown = getCurrentMarkdown();

    programmaticMarkdownChangeRef.current = {
      staleMarkdown,
      targetMarkdown
    };

    if (programmaticMarkdownChangeTimeoutRef.current !== undefined) {
      window.clearTimeout(programmaticMarkdownChangeTimeoutRef.current);
    }

    programmaticMarkdownChangeTimeoutRef.current = window.setTimeout(() => {
      programmaticMarkdownChangeRef.current = null;
      programmaticMarkdownChangeTimeoutRef.current = undefined;
    }, 1000);
  }

  function handleMarkdownChange(nextMarkdown: string) {
    const programmaticChange = programmaticMarkdownChangeRef.current;

    if (programmaticChange) {
      const matchesStaleMarkdown = areMarkdownBuffersEquivalent(
        nextMarkdown,
        programmaticChange.staleMarkdown
      );
      const matchesTargetMarkdown = areMarkdownBuffersEquivalent(
        nextMarkdown,
        programmaticChange.targetMarkdown
      );

      if (matchesStaleMarkdown && !matchesTargetMarkdown) {
        return;
      }

      if (matchesTargetMarkdown) {
        setMarkdown(nextMarkdown);
        return;
      }

      programmaticMarkdownChangeRef.current = null;
      if (programmaticMarkdownChangeTimeoutRef.current !== undefined) {
        window.clearTimeout(programmaticMarkdownChangeTimeoutRef.current);
        programmaticMarkdownChangeTimeoutRef.current = undefined;
      }
    }

    setMarkdown(nextMarkdown);
  }

  // After a programmatic load, MDXEditor re-serializes the imported Markdown into its own dialect
  // (`-` bullets become `*`, thematic breaks become `***`, blocks gain blank-line padding, a leading
  // `#` without a space is escaped, tables are re-aligned, trailing whitespace is trimmed). That
  // normalized text — not the raw bytes we passed in — is what getMarkdown() returns and what a later
  // save writes to disk, yet it only becomes readable on the next microtask (setMarkdown's re-import
  // exports the Lexical tree back to markdown asynchronously). Adopt it as the clean baseline so the
  // dirty check and the "compare with previous version" diff compare like-for-like (both in
  // MDXEditor's dialect) instead of raw-disk bytes vs. re-serialized output, which otherwise surfaced
  // the entire normalization as phantom changes.
  function adoptNormalizedBaselineAfterLoad(markClean: boolean) {
    const token = (documentLoadTokenRef.current += 1);
    queueMicrotask(() => {
      if (documentLoadTokenRef.current !== token) {
        return;
      }
      const normalized = editorRef.current?.getMarkdown();
      if (typeof normalized !== "string") {
        return;
      }
      setMarkdown(normalized);
      setLastSavedMarkdown(markClean ? normalized : "");
    });
  }

  async function loadDocument(
    nextMarkdown: string,
    nextFilePath: string | undefined,
    options: { previousVersionMarkdown?: string; markClean?: boolean } = {}
  ) {
    const { markClean = true } = options;
    // Diagrams may be stored as sidecar `.svg` files; inline them back to base64 so they stay editable
    // (the editor only understands inline diagrams). A no-op for untitled buffers and plain documents.
    const editorMarkdown = nextFilePath
      ? await inlineDiagrams(nextMarkdown, (src) =>
          window.nexus?.readDiagramSvg(nextFilePath, src) ?? Promise.resolve(null)
        )
      : nextMarkdown;
    editorScrollSnapshotRef.current = { ratio: 0, top: 0 };
    beginProgrammaticMarkdownChange(editorMarkdown);
    editorRef.current?.setMarkdown(editorMarkdown);
    setLastSavedMarkdown(markClean ? editorMarkdown : "");
    setPreviousVersionMarkdown(options.previousVersionMarkdown);
    setDiffMarkdown(options.previousVersionMarkdown ?? "");
    setMarkdown(editorMarkdown);
    setFilePath(nextFilePath);
    setExternalFileChangePrompt(null);
    adoptNormalizedBaselineAfterLoad(markClean);
  }

  function clearDocument() {
    // Supersede any load baseline capture still pending on a microtask.
    documentLoadTokenRef.current += 1;
    beginProgrammaticMarkdownChange("");
    editorRef.current?.setMarkdown("");
    editorScrollSnapshotRef.current = { ratio: 0, top: 0 };
    setLastSavedMarkdown("");
    setPreviousVersionMarkdown(undefined);
    setDiffMarkdown("");
    setMarkdown("");
    setFilePath(undefined);
    setExternalFileChangePrompt(null);
  }

  function recordSuccessfulSave(currentMarkdown: string, nextFilePath: string, hadSavedVersion: boolean) {
    // The saved text is already MDXEditor's serialized output; supersede any pending load capture.
    documentLoadTokenRef.current += 1;
    if (hadSavedVersion) {
      setPreviousVersionMarkdown(lastSavedMarkdown);
      setDiffMarkdown(lastSavedMarkdown);
    } else {
      setPreviousVersionMarkdown(undefined);
      setDiffMarkdown("");
    }

    setLastSavedMarkdown(currentMarkdown);
    setMarkdown(currentMarkdown);
    setFilePath(nextFilePath);
  }

  function getCurrentMarkdown() {
    return editorRef.current?.getMarkdown() ?? markdown;
  }

  function readEditorSelection(): McpEditorSelection {
    const mode = currentViewModeRef.current ?? "rich-text";
    const surface = editorSurfaceRef.current;
    const selection = typeof window !== "undefined" ? window.getSelection() : null;

    // Only report selections that live inside the editor surface, so a selection in a dialog or
    // elsewhere in the chrome is not leaked to the MCP client as the document selection.
    const anchorNode = selection?.anchorNode;
    const liveText =
      surface && selection && selection.rangeCount > 0 && anchorNode && surface.contains(anchorNode)
        ? selection.toString()
        : "";

    if (liveText.length > 0) {
      return { ok: true, mode, hasSelection: true, text: liveText };
    }

    // Focus may have moved into the AI chat (or elsewhere), collapsing the live DOM selection. Fall
    // back to the last selection captured inside the editor so nexus_get_selection — and therefore
    // the AI chat — still sees what the user had highlighted before clicking into the chat.
    const snapshot = editorSelectionSnapshotRef.current;
    if (snapshot && snapshot.text.trim()) {
      return { ok: true, mode: snapshot.mode, hasSelection: true, text: snapshot.text };
    }

    return { ok: true, mode, hasSelection: false, text: "" };
  }

  // Run an AI selection action: take the last captured selection, prompt the model, and (on success)
  // open the preview dialog. Failures and the "no provider" / "no selection" cases surface in the AI
  // notice banner rather than the preview.
  async function runSelectionAiAction(
    action: SelectionActionId,
    options: SelectionActionOptions = {}
  ) {
    const snapshot = editorSelectionSnapshotRef.current;
    if (!snapshot || !snapshot.text.trim()) {
      setAiNotice({
        message: "Select some text in the editor first, then choose an AI action.",
        needsProvider: false
      });
      return;
    }

    if (!resolveActiveProvider(settings.ai)) {
      setAiNotice({
        message: "No AI provider is enabled yet. Open AI ▸ AI Providers… to set one up.",
        needsProvider: true
      });
      return;
    }

    setAiNotice(null);
    setAiBusy(true);
    try {
      const prompt = buildSelectionPrompt(action, snapshot.text, options);
      const result = await runAiChat({
        ai: settings.ai,
        profileName,
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }]
      });

      if (!result.ok) {
        setAiNotice({ message: result.error, needsProvider: false });
        return;
      }

      const proposedText = result.text.trim();
      if (!proposedText) {
        setAiNotice({
          message: "The model returned an empty response. Try again or rephrase the selection.",
          needsProvider: false
        });
        return;
      }

      pendingAiApplyRef.current = { snapshot, proposedText };
      setPendingAiEdit({
        actionLabel: describeSelectionAction(action, options),
        originalText: snapshot.text,
        proposedText
      });
    } catch {
      setAiNotice({ message: "The AI request failed unexpectedly.", needsProvider: false });
    } finally {
      setAiBusy(false);
    }
  }

  function restoreEditorSelection(snapshot: EditorSelectionSnapshot) {
    if (!snapshot.range) {
      return;
    }
    snapshot.activeElement?.focus();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    try {
      selection?.addRange(snapshot.range);
    } catch {
      // The cloned range can be detached if the DOM changed; fall back to the current caret.
    }
  }

  function applyPendingAiEdit() {
    const pending = pendingAiApplyRef.current;
    pendingAiApplyRef.current = null;
    setPendingAiEdit(null);
    if (!pending) {
      return;
    }

    const { snapshot, proposedText } = pending;

    // Source mode: replace the exact captured character range in the CodeMirror buffer. This is
    // reliable regardless of focus, so it does not need the selection restored.
    if (snapshot.mode === "source" && snapshot.source) {
      const surface = editorSurfaceRef.current;
      const view = surface ? getSourceEditorView(surface) : null;
      if (view) {
        view.dispatch({
          changes: { from: snapshot.source.from, to: snapshot.source.to, insert: proposedText }
        });
        setMarkdown(view.state.doc.toString());
        return;
      }
    }

    // Rich-text (and the source fallback): restore the captured selection, then replace it via
    // insertMarkdown (Lexical's $insertNodes replaces a non-collapsed selection). Defer to the next
    // frames so the dialog's focus handling settles and Lexical reconciles the restored selection
    // before the insert runs.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        restoreEditorSelection(snapshot);
        editorRef.current?.insertMarkdown(proposedText);
        setMarkdown(getCurrentMarkdown());
      });
    });
  }

  // Capture where transcribed Markdown should land *before* the file picker steals editor focus.
  // Unlike the selection snapshot (cleared when the caret collapses), this records a zero-width
  // insertion point at the current caret. Source mode reads CodeMirror's state directly (reliable
  // regardless of focus); rich-text clones the live caret when it is still inside the editor and
  // otherwise leaves it to Lexical's preserved selection.
  function captureInsertionPoint(): EditorSelectionSnapshot {
    const mode = currentViewModeRef.current ?? "rich-text";
    const surface = editorSurfaceRef.current;

    if (mode === "source" && surface) {
      const view = getSourceEditorView(surface);
      const caret = view?.state.selection?.main.to;
      if (typeof caret === "number") {
        return { mode, text: "", range: null, source: { from: caret, to: caret }, activeElement: null };
      }
    }

    let range: Range | null = null;
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && surface) {
      const candidate = selection.getRangeAt(0);
      if (surface.contains(candidate.commonAncestorContainer)) {
        range = candidate.cloneRange();
        range.collapse(false);
      }
    }
    const editable = surface?.querySelector<HTMLElement>(".mdxeditor-root-contenteditable") ?? null;
    return { mode, text: "", range, source: null, activeElement: editable };
  }

  // "Image to Markdown": pick an image, have a vision model transcribe it to Markdown, and insert the
  // result at the caret. Mirrors runSelectionAiAction's provider/busy/notice handling, but generates
  // and inserts (rather than transforming a selection) and reuses applyPendingAiEdit for the insert.
  async function runImageToMarkdown() {
    if (!resolveActiveProvider(settings.ai)) {
      setAiNotice({
        message: "No AI provider is enabled yet. Open AI ▸ AI Providers… to set one up.",
        needsProvider: true
      });
      return;
    }

    const insertAt = captureInsertionPoint();

    const picked = await window.nexus?.selectBase64Image();
    if (!picked || picked.canceled) {
      return;
    }

    if (!picked.mimeType.startsWith("image/")) {
      setAiNotice({ message: "That file is not an image.", needsProvider: false });
      return;
    }

    const commaIndex = picked.dataUrl.indexOf(",");
    const base64 = commaIndex >= 0 ? picked.dataUrl.slice(commaIndex + 1) : "";
    if (!base64) {
      setAiNotice({ message: "Could not read the selected image.", needsProvider: false });
      return;
    }
    if (base64.length * 0.75 > MAX_IMAGE_BYTES) {
      setAiNotice({
        message: "That image is too large to send (limit 8 MB). Try a smaller or compressed image.",
        needsProvider: false
      });
      return;
    }

    setAiNotice(null);
    setAiBusy(true);
    try {
      const prompt = buildImageToMarkdownPrompt();
      const result = await runAiChat({
        ai: settings.ai,
        profileName,
        system: prompt.system,
        maxTokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt.user },
              { type: "image", mediaType: picked.mimeType, data: base64 }
            ]
          }
        ]
      });

      if (!result.ok) {
        const noVision = isImageUnsupportedError(result.error);
        setAiNotice({
          message: noVision
            ? "This model doesn't support image input. Pick a vision-capable model (e.g. gpt-4o, Claude, or a local vision model) in AI ▸ AI Providers…."
            : result.error,
          needsProvider: noVision
        });
        return;
      }

      const proposedText = result.text.trim();
      if (!proposedText) {
        setAiNotice({
          message:
            "The model returned no text for this image. Try a clearer image or a vision-capable model.",
          needsProvider: false
        });
        return;
      }

      pendingAiApplyRef.current = { snapshot: insertAt, proposedText };
      applyPendingAiEdit();
    } catch {
      setAiNotice({ message: "The AI request failed unexpectedly.", needsProvider: false });
    } finally {
      setAiBusy(false);
    }
  }

  function focusInitialEmptyEditor() {
    if (hasFocusedInitialEmptyEditorRef.current) {
      return;
    }

    hasFocusedInitialEmptyEditorRef.current = true;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (filePathRef.current || !areMarkdownBuffersEquivalent(getCurrentMarkdown(), "")) {
          return;
        }

        editorRef.current?.focus(undefined, {
          defaultSelection: "rootStart",
          preventScroll: true
        });
      });
    });
  }

  // When "store diagrams as files" is on and a destination path is known, externalize inline base64
  // diagrams to sibling `.svg` files and return markdown that references them by relative path. The
  // editor keeps holding base64, so this only changes the bytes written to disk; otherwise a no-op.
  async function prepareMarkdownForDisk(base64Markdown: string, targetPath: string): Promise<string> {
    if (!settings.diagramsAsFiles || !window.nexus) {
      return base64Markdown;
    }
    const { markdown: externalized, usedNames } = await externalizeDiagrams(
      base64Markdown,
      async (svgText, kind) => {
        const written = await window.nexus?.writeDiagramSvg(targetPath, svgText, kind);
        if (!written || "error" in written) {
          return null;
        }
        return written;
      }
    );
    // Remove this document's now-unreferenced diagram files (e.g. after an edit changed the hash).
    await window.nexus.cleanupDiagramAssets(targetPath, [...usedNames]);
    return externalized;
  }

  async function saveDocument(): Promise<boolean> {
    const currentMarkdown = getCurrentMarkdown();

    if (filePath) {
      const diskMarkdown = await prepareMarkdownForDisk(currentMarkdown, filePath);
      await window.nexus?.saveMarkdownFile(filePath, diskMarkdown);
      recordSuccessfulSave(currentMarkdown, filePath, true);
      return true;
    }

    const result = await window.nexus?.saveMarkdownFileAs(undefined, currentMarkdown);
    if (result && !result.canceled) {
      // Path is only known now; re-save with sidecar files written into the chosen folder if enabled.
      const diskMarkdown = await prepareMarkdownForDisk(currentMarkdown, result.filePath);
      if (diskMarkdown !== currentMarkdown) {
        await window.nexus?.saveMarkdownFile(result.filePath, diskMarkdown);
      }
      recordSuccessfulSave(currentMarkdown, result.filePath, false);
      return true;
    }

    return false;
  }

  async function saveDocumentAs(): Promise<boolean> {
    const currentMarkdown = getCurrentMarkdown();
    const hadSavedVersion = Boolean(filePath);
    const result = await window.nexus?.saveMarkdownFileAs(filePath, currentMarkdown);
    if (result && !result.canceled) {
      // Externalize into the (possibly new) destination folder if enabled.
      const diskMarkdown = await prepareMarkdownForDisk(currentMarkdown, result.filePath);
      if (diskMarkdown !== currentMarkdown) {
        await window.nexus?.saveMarkdownFile(result.filePath, diskMarkdown);
      }
      recordSuccessfulSave(currentMarkdown, result.filePath, hadSavedVersion);
      return true;
    }

    return false;
  }

  async function exportDocumentAsHtml() {
    const currentMarkdown = getCurrentMarkdown();
    await window.nexus?.exportMarkdownAsHtml(filePath, currentMarkdown, {
      fontFamily: settings.fontFamily,
      fontSizePixels: settings.fontSizePixels,
      paragraphSpacingPixels: settings.paragraphSpacingPixels
    });
  }

  async function exportDocumentAsWord() {
    const currentMarkdown = getCurrentMarkdown();
    await window.nexus?.exportMarkdownAsWord(filePath, currentMarkdown, getWordExportOptions());
  }

  function getWordExportOptions() {
    return {
      fontFamily: settings.fontFamily,
      fontSizePixels: settings.fontSizePixels,
      paragraphSpacingPixels: settings.paragraphSpacingPixels,
      pageMargins: settings.pageMargins
    };
  }

  async function copyDocumentAsHtml() {
    const currentMarkdown = getCurrentMarkdown();
    await window.nexus?.copyMarkdownAsHtml(filePath, currentMarkdown, {
      fontFamily: settings.fontFamily,
      fontSizePixels: settings.fontSizePixels,
      paragraphSpacingPixels: settings.paragraphSpacingPixels
    });
  }

  async function exportDocumentAsPdf() {
    const currentMarkdown = getCurrentMarkdown();
    await window.nexus?.exportMarkdownAsPdf(filePath, currentMarkdown, getPdfExportOptions());
  }

  function getPdfExportOptions() {
    return {
      fontFamily: settings.fontFamily,
      fontSizePixels: settings.fontSizePixels,
      paragraphSpacingPixels: settings.paragraphSpacingPixels,
      pageSize: settings.pageSize,
      pageOrientation: settings.pageOrientation,
      pageMargins: settings.pageMargins
    };
  }

  async function confirmDirtyBufferAction() {
    const currentMarkdown = getCurrentMarkdown();
    const currentIsDirty = hasUnsavedMarkdownChanges(currentMarkdown, lastSavedMarkdown);

    if (!currentIsDirty) {
      return true;
    }

    const choice = await window.nexus?.confirmSaveChanges();

    if (choice === "cancel" || !choice) {
      return false;
    }

    if (choice === "save") {
      return saveDocument();
    }

    return true;
  }

  async function openDocument() {
    const result = await window.nexus?.openMarkdownFile();
    if (!result || result.canceled) {
      return;
    }

    const canReplace = await confirmDirtyBufferAction();
    if (!canReplace) {
      return;
    }

    await loadDocument(result.markdown, result.filePath);
  }

  async function openRecentFile(filePath: string) {
    const canReplace = await confirmDirtyBufferAction();
    if (!canReplace) {
      return;
    }

    const result = await window.nexus?.openRecentFile(filePath);
    if (!result || result.canceled) {
      return;
    }

    await loadDocument(result.markdown, result.filePath);
  }

  async function loadDemoDocument() {
    const canReplace = await confirmDirtyBufferAction();
    if (!canReplace) {
      return;
    }

    await loadDocument(DEMO_DOCUMENT_MARKDOWN, undefined, { markClean: false });
  }

  async function createNewDocument() {
    const canReplace = await confirmDirtyBufferAction();
    if (!canReplace) {
      return;
    }

    clearDocument();
  }

  async function handleCloseRequest() {
    const canClose = await confirmDirtyBufferAction();
    await window.nexus?.resolveCloseRequest(canClose);
  }

  function ignoreExternalFileChange() {
    setExternalFileChangePrompt(null);
  }

  async function reloadExternalFileChange() {
    if (!externalFileChangePrompt) {
      return;
    }

    const previousMarkdown = getCurrentMarkdown();

    try {
      const result = await window.nexus?.readWatchedMarkdownFile(externalFileChangePrompt.filePath);
      if (result && !result.canceled) {
        await loadDocument(result.markdown, result.filePath, {
          previousVersionMarkdown: previousMarkdown
        });
      }
    } catch {
      setExternalFileChangePrompt({
        filePath: externalFileChangePrompt.filePath,
        kind: "missing",
        markdown: undefined,
        source: externalFileChangePrompt.source,
        timestamp: Date.now()
      });
    }
  }

  async function saveExternalFileChangeAs() {
    const didSave = await saveDocumentAs();
    if (didSave) {
      setExternalFileChangePrompt(null);
    }
  }

  async function refreshDocumentFromDisk() {
    if (!filePath) {
      return;
    }

    try {
      const result = await window.nexus?.readWatchedMarkdownFile(filePath);
      if (!result || result.canceled) {
        return;
      }

      const currentMarkdown = getCurrentMarkdown();
      const currentIsDirty = hasUnsavedMarkdownChanges(currentMarkdown, lastSavedMarkdown);
      const diskDiffersFromCurrent = !areMarkdownBuffersEquivalent(
        result.markdown,
        currentMarkdown
      );

      if (currentIsDirty && diskDiffersFromCurrent) {
        setExternalFileChangePrompt({
          filePath: result.filePath,
          kind: "changed",
          markdown: result.markdown,
          source: "refresh",
          timestamp: Date.now()
        });
        return;
      }

      await loadDocument(result.markdown, result.filePath);
    } catch {
      setExternalFileChangePrompt({
        filePath,
        kind: "missing",
        markdown: undefined,
        source: "refresh",
        timestamp: Date.now()
      });
    }
  }

  useEffect(() => {
    const root = editorSurfaceRef.current;
    if (!root) {
      return;
    }

    const editorRoot: HTMLElement = root;
    const removeScrollListeners: Array<() => void> = [];

    function captureScrollPosition(element: HTMLElement) {
      if (isApplyingScrollRef.current) {
        return;
      }

      editorScrollSnapshotRef.current = getScrollSnapshot(element);
      activeScrollElementRef.current = element;
    }

    function bindScrollListeners() {
      while (removeScrollListeners.length > 0) {
        removeScrollListeners.pop()?.();
      }

      getEditorScrollElements(editorRoot).forEach((element) => {
        const handleScroll = () => captureScrollPosition(element);
        element.addEventListener("scroll", handleScroll, { passive: true });
        removeScrollListeners.push(() => element.removeEventListener("scroll", handleScroll));
      });
    }

    function syncActiveEditorScroll() {
      const activeElement = getActiveEditorScrollElement(editorRoot);
      if (!activeElement) {
        return;
      }

      if (activeScrollElementRef.current === activeElement) {
        captureScrollPosition(activeElement);
        return;
      }

      activeScrollElementRef.current = activeElement;
      isApplyingScrollRef.current = true;

      requestAnimationFrame(() => {
        applyScrollSnapshot(activeElement, editorScrollSnapshotRef.current);
        requestAnimationFrame(() => {
          applyScrollSnapshot(activeElement, editorScrollSnapshotRef.current);
          isApplyingScrollRef.current = false;
        });
      });
    }

    bindScrollListeners();
    syncActiveEditorScroll();

    const observer = new MutationObserver(() => {
      bindScrollListeners();
      syncActiveEditorScroll();
    });

    observer.observe(editorRoot, {
      attributes: true,
      childList: true,
      subtree: true
    });

    window.addEventListener("resize", syncActiveEditorScroll);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncActiveEditorScroll);
      while (removeScrollListeners.length > 0) {
        removeScrollListeners.pop()?.();
      }
    };
  }, []);

  // Scroll-spy: highlight the outline entry for the section currently under the top
  // of the editor viewport, in both rich-text and source mode. Re-runs when the mode
  // or outline visibility changes; recomputes on scroll, resize, and editor DOM
  // mutations (typing, mode swap) using the latest headings through a ref.
  useEffect(() => {
    if (!showOutlineSidebar) {
      setActiveHeadingIndex((previous) => (previous === 0 ? previous : 0));
      return;
    }

    const root = editorSurfaceRef.current;
    if (!root) {
      return;
    }

    let frame = 0;
    const removeScrollListeners: Array<() => void> = [];

    const recomputeActiveHeading = () => {
      const metrics = getOutlineHeadingMetrics(
        root,
        currentViewModeRef.current,
        outlineHeadingsRef.current
      );
      if (!metrics) {
        return;
      }

      const { tops, scroller } = metrics;
      const activationOffset = Math.min(120, scroller.clientHeight * 0.3);
      const index = getActiveHeadingIndex(
        tops,
        {
          scrollTop: scroller.scrollTop,
          clientHeight: scroller.clientHeight,
          scrollHeight: scroller.scrollHeight
        },
        activationOffset
      );
      if (index >= 0) {
        setActiveHeadingIndex((previous) => (previous === index ? previous : index));
      }
    };

    const scheduleRecompute = () => {
      if (frame) {
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = 0;
        recomputeActiveHeading();
      });
    };

    const bindScrollListeners = () => {
      while (removeScrollListeners.length > 0) {
        removeScrollListeners.pop()?.();
      }
      getEditorScrollElements(root).forEach((element) => {
        element.addEventListener("scroll", scheduleRecompute, { passive: true });
        removeScrollListeners.push(() => element.removeEventListener("scroll", scheduleRecompute));
      });
    };

    bindScrollListeners();
    scheduleRecompute();

    // Rebind + recompute when the editor DOM changes: a mode switch mounts a new
    // scroller, and edits move headings.
    const observer = new MutationObserver(() => {
      bindScrollListeners();
      scheduleRecompute();
    });
    observer.observe(root, { attributes: true, childList: true, subtree: true });
    window.addEventListener("resize", scheduleRecompute);

    return () => {
      if (frame) {
        cancelAnimationFrame(frame);
      }
      observer.disconnect();
      window.removeEventListener("resize", scheduleRecompute);
      while (removeScrollListeners.length > 0) {
        removeScrollListeners.pop()?.();
      }
    };
  }, [showOutlineSidebar, editorViewMode]);

  const dispatchMenuAction = useCallback((action: NexusMenuAction, payload?: AiSelectionMenuPayload) => {
    const h = menuHandlersRef.current;
    switch (action) {
      case "new":
        void h.createNewDocument();
        break;
      case "open":
        void h.openDocument();
        break;
      case "loadDemo":
        void h.loadDemoDocument();
        break;
      case "save":
        void h.saveDocument();
        break;
      case "saveAs":
        void h.saveDocumentAs();
        break;
      case "exportHtml":
        void h.exportDocumentAsHtml();
        break;
      case "exportWord":
        void h.exportDocumentAsWord();
        break;
      case "exportPdf":
        void h.exportDocumentAsPdf();
        break;
      case "refresh":
        void h.refreshDocumentFromDisk();
        break;
      case "comparePreviousVersion":
        h.compareWithPreviousVersion();
        break;
      case "find":
        h.openFindPanel();
        break;
      case "replace":
        h.openReplacePanel();
        break;
      case "editFrontmatter":
        h.openFrontmatterEditor();
        break;
      case "zoomIn":
        h.zoomEditorIn();
        break;
      case "zoomOut":
        h.zoomEditorOut();
        break;
      case "resetZoom":
        h.resetEditorZoom();
        break;
      case "toggleShowInvisibles":
        h.toggleShowInvisibles();
        break;
      case "toggleSpellCheck":
        h.toggleSpellCheck();
        break;
      case "toggleOutline":
        h.toggleOutline();
        break;
      case "toggleAiChat":
        h.toggleAiChat();
        break;
      case "togglePageOrientation":
        h.togglePageOrientation();
        break;
      case "toggleResponsiveWrapping":
        h.toggleResponsiveWrapping();
        break;
      case "togglePaperView":
        h.togglePaperView();
        break;
      case "settings":
        h.openSettings();
        break;
      case "aiSettings":
        h.openAiSettings();
        break;
      case "aiSelection":
        if (payload) {
          void h.runSelectionAiAction(payload.action, payload.options);
        }
        break;
      case "imageToMarkdown":
        void h.runImageToMarkdown();
        break;
      case "about":
        h.openAbout();
        break;
      case "copyHtml":
        void h.copyDocumentAsHtml();
        break;
      case "publishWeb":
        h.openPublishWeb();
        break;
      case "publishQuickConnect":
        h.openPublishQuickConnect();
        break;
    }
  }, []);

  useEffect(() => {
    if (!window.nexus) {
      return;
    }

    async function loadInitialOpenFile() {
      if (hasHandledInitialOpenFileRef.current) {
        return;
      }

      hasHandledInitialOpenFileRef.current = true;
      const result = await window.nexus?.getInitialOpenFile();
      if (!result || result.canceled) {
        menuHandlersRef.current.focusInitialEmptyEditor();
        return;
      }

      await menuHandlersRef.current.loadDocument(result.markdown, result.filePath);
    }

    const removeMenuActionListener = window.nexus.onMenuAction(dispatchMenuAction);

    const removeOpenRecentListener = window.nexus.onOpenRecentFile((filePath) => {
      void menuHandlersRef.current.openRecentFile(filePath);
    });

    const removeCloseRequestListener = window.nexus.onCloseRequest(() => {
      void menuHandlersRef.current.handleCloseRequest();
    });

    void loadInitialOpenFile();

    return () => {
      removeMenuActionListener();
      removeOpenRecentListener();
      removeCloseRequestListener();
    };
  }, [dispatchMenuAction]);

  useEffect(() => {
    function handleViewShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || (!event.ctrlKey && !event.metaKey)) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "f") {
        event.preventDefault();
        menuHandlersRef.current.openFindPanel();
        return;
      }

      if (key === "h") {
        event.preventDefault();
        menuHandlersRef.current.openReplacePanel();
        return;
      }

      if (key === "+" || key === "=") {
        event.preventDefault();
        menuHandlersRef.current.zoomEditorIn();
        return;
      }

      if (key === "-" || key === "_") {
        event.preventDefault();
        menuHandlersRef.current.zoomEditorOut();
        return;
      }

      if (key === "0") {
        event.preventDefault();
        menuHandlersRef.current.resetEditorZoom();
      }
    }

    window.addEventListener("keydown", handleViewShortcut);

    return () => {
      window.removeEventListener("keydown", handleViewShortcut);
    };
  }, []);

  return (
    <main className={appShellClassName} data-theme={resolvedTheme}>
      <Titlebar
        canEditFrontmatter={editorViewMode === "rich-text"}
        canToggleOutline={canToggleOutline}
        dispatchMenuAction={dispatchMenuAction}
        onAiSelectionAction={runSelectionAiAction}
        onAiImageToMarkdown={runImageToMarkdown}
        fileName={titlebarFileName}
        filePath={filePath ?? null}
        isDirty={isDirty}
        outlineVisible={settings.outlineVisible}
        aiChatVisible={settings.aiChatVisible}
        pageOrientation={settings.pageOrientation}
        paperViewEnabled={settings.paperViewEnabled}
        responsiveContentWrappingEnabled={settings.responsiveContentWrappingEnabled}
        showInvisibleCharacters={settings.showInvisibleCharacters}
        spellCheckEnabled={settings.spellCheckEnabled}
      />
      <section className="workspace">
        <div className="editor-column">
          <div
            className={
              showOutlineSidebar
                ? `${editorSurfaceClassName} editor-surface-with-outline`
                : editorSurfaceClassName
            }
            ref={editorSurfaceRef}
            style={editorStyle}
          >
            {showOutlineSidebar ? (
              <OutlineSidebar
                headings={outlineHeadings}
                width={settings.outlineWidthPixels}
                activeIndex={activeHeadingIndex}
                onSelect={scrollOutlineHeadingIntoView}
                onResize={(outlineWidthPixels) =>
                  setSettings((current) => ({ ...current, outlineWidthPixels }))
                }
              />
            ) : null}
            <EditorContextMenu>
              <MDXEditor
                // spellCheckEnabled is in the key because diffSourcePlugin only reads
                // codeMirrorExtensions on init: a remount is what lets source mode pick up the new
                // spell-check contentAttributes (rich text also re-reads the spellCheck prop here).
                key={`editor-${settings.showInvisibleCharacters}-${resolvedTheme}-${settings.spellCheckEnabled}`}
                ref={editorRef}
                markdown={markdown}
                onChange={handleMarkdownChange}
                contentEditableClassName="markdown-body"
                spellCheck={settings.spellCheckEnabled}
                plugins={[
                  headingsPlugin(),
                  listsPlugin(),
                  listExitPlugin(),
                  quotePlugin(),
                  thematicBreakPlugin(),
                  linkPlugin(),
                  linkDialogPlugin(),
                  pasteLinkPlugin(),
                  imagePlugin({ imagePreviewHandler, imageUploadHandler: readImageFileAsDataUrl }),
                  drawioPlugin(),
                  isoflowPlugin(),
                  tablePlugin(),
                  frontmatterPlugin(),
                  directivesPlugin({
                    directiveDescriptors: [githubAlertDirectiveDescriptor, admonitionDirectiveDescriptor]
                  }),
                  githubAlertsPlugin(),
                  alignmentPlugin(),
                  footnotesPlugin(),
                  codeBlockPlugin({
                    defaultCodeBlockLanguage: "txt",
                    codeBlockEditorDescriptors: [
                      mermaidCodeBlockDescriptor,
                      katexCodeBlockDescriptor,
                      localJavaScriptRunnerCodeBlockDescriptor
                    ]
                  }),
                  codeMirrorPlugin({
                    codeBlockLanguages: {
                      txt: "Text",
                      md: "Markdown",
                      js: "JavaScript",
                      jsx: "JavaScript React",
                      ts: "TypeScript",
                      tsx: "TypeScript React",
                      css: "CSS",
                      html: "HTML",
                      json: "JSON",
                      mermaid: "Mermaid",
                      math: "Math (LaTeX)",
                      bash: "Bash",
                      powershell: "PowerShell"
                    },
                    codeMirrorExtensions
                  }),
                  markdownShortcutPlugin(),
                  searchPlugin(),
                  diffSourcePlugin({
                    diffMarkdown,
                    readOnlyDiff: true,
                    viewMode: currentViewModeRef.current,
                    codeMirrorExtensions: sourceCodeMirrorExtensions
                  }),
                  toolbarPlugin({
                    toolbarContents: () => (
                      <>
                        <DiffViewController request={pendingDiffViewRequest} />
                        <FrontmatterController request={pendingEditFrontmatterRequest} />
                        <FindTextPanel
                          onActiveMatchChange={scrollFindMatchIntoView}
                          openRequest={pendingFindRequest}
                          replaceRequest={pendingReplaceRequest}
                        />
                        <ViewModeTracker
                          viewModeRef={currentViewModeRef}
                          onModeChange={setEditorViewMode}
                        />
                        <ParseErrorTracker onErrorChange={setParseError} />
                        <ShadcnMdxToolbar
                          documentPath={filePath}
                          onCleanUpFormatting={cleanUpFormatting}
                          onInsertTableOfContents={insertTableOfContents}
                        />
                      </>
                    ),
                    toolbarClassName: "nexus-editor-toolbar"
                  })
                ]}
              />
            </EditorContextMenu>
            {showParseError && parseError ? (
              <ParseErrorPanel
                error={parseError}
                filePath={filePath}
                onDismiss={() => setDismissedErrorKey(parseErrorKey)}
              />
            ) : null}
          </div>
        </div>
        {settings.aiChatVisible ? (
          <AiChatPanel
            ai={settings.ai}
            profileName={profileName}
            windowId={MCP_WINDOW_ID}
            fileName={titlebarFileName}
            width={settings.aiChatWidthPixels}
            getEditorSelection={() => {
              const snapshot = editorSelectionSnapshotRef.current;
              return snapshot && snapshot.text.trim()
                ? { text: snapshot.text, mode: snapshot.mode }
                : null;
            }}
            onResize={(aiChatWidthPixels) =>
              setSettings((current) => ({ ...current, aiChatWidthPixels }))
            }
            onClose={() => setSettings((current) => ({ ...current, aiChatVisible: false }))}
            onOpenAiSettings={() => setAiSettingsOpen(true)}
          />
        ) : null}
      </section>
      {aiNotice ? (
        <AiNotice
          message={aiNotice.message}
          needsProvider={aiNotice.needsProvider}
          onConfigure={() => {
            setAiNotice(null);
            setAiSettingsOpen(true);
          }}
          onDismiss={() => setAiNotice(null)}
        />
      ) : null}
      <StatusBar
        aiBusy={aiBusy}
        aiChatVisible={settings.aiChatVisible}
        canToggleOutline={canToggleOutline}
        isDirty={isDirty}
        maxZoom={MAX_EDITOR_ZOOM_PERCENT}
        minZoom={MIN_EDITOR_ZOOM_PERCENT}
        onToggleAiChat={() => dispatchMenuAction("toggleAiChat")}
        onZoomChange={(zoomPercent) => setEditorZoomPercent(clampEditorZoomPercent(zoomPercent))}
        onZoomIn={zoomEditorIn}
        onZoomOut={zoomEditorOut}
        onToggleOutline={() => dispatchMenuAction("toggleOutline")}
        onZoomReset={resetEditorZoom}
        outlineVisible={settings.outlineVisible}
        wordCount={wordCount}
        zoomPercent={editorZoomPercent}
      />
      {externalFileChangePrompt ? (
        <FileChangedDialog
          filePath={externalFileChangePrompt.filePath}
          isDirty={isDirty}
          kind={externalFileChangePrompt.kind}
          onIgnore={ignoreExternalFileChange}
          onReload={() => void reloadExternalFileChange()}
          onReviewDiff={reviewExternalFileDiff}
          onSaveAs={() => void saveExternalFileChangeAs()}
          open
          source={externalFileChangePrompt.source}
        />
      ) : null}
      <SettingsDialog
        fontFamily={settings.fontFamily}
        fontSizePixels={settings.fontSizePixels}
        mcpServer={settings.mcpServer}
        mcpNgrokStatus={mcpNgrokStatus}
        onTestMcpConnection={() => window.nexus?.testMcpConnection() ?? Promise.resolve(undefined)}
        onStopNgrok={async () => {
          const status = await window.nexus?.stopMcpNgrok();
          if (status) {
            setMcpNgrokStatus(status);
          }
        }}
        onRestartNgrok={async () => {
          const status = await window.nexus?.restartMcpNgrok({
            enabled: settings.mcpServer.enabled,
            port: settings.mcpServer.port,
            authMode: settings.mcpServer.authMode,
            bearerToken: settings.mcpServer.bearerToken,
            ngrokEnabled: settings.mcpServer.ngrokEnabled,
            ngrokDomain: settings.mcpServer.ngrokDomain,
            ngrokUseCustomPath: settings.mcpServer.ngrokUseCustomPath,
            ngrokPath: settings.mcpServer.ngrokPath
          });
          if (status) {
            setMcpNgrokStatus(status);
          }
        }}
        onFontFamilyChange={(fontFamily) => setSettings((current) => ({ ...current, fontFamily }))}
        onFontSizePixelsChange={(fontSizePixels) =>
          setSettings((current) => ({ ...current, fontSizePixels }))
        }
        onMcpServerChange={(mcpServer) => setSettings((current) => ({ ...current, mcpServer }))}
        onPageMarginsChange={(pageMargins) =>
          setSettings((current) => ({ ...current, pageMargins }))
        }
        onPageOrientationChange={(pageOrientation) =>
          setSettings((current) => ({ ...current, pageOrientation }))
        }
        onPageSizeChange={(pageSize) => setSettings((current) => ({ ...current, pageSize }))}
        onParagraphSpacingPixelsChange={(paragraphSpacingPixels) =>
          setSettings((current) => ({ ...current, paragraphSpacingPixels }))
        }
        onResetSettings={() => {
          resetSettings(profileName);
          setSettings(createDefaultSettings());
        }}
        onThemePreferenceChange={(themePreference) =>
          setSettings((current) => ({ ...current, themePreference }))
        }
        diagramsAsFiles={settings.diagramsAsFiles}
        onDiagramsAsFilesChange={(diagramsAsFiles) =>
          setSettings((current) => ({ ...current, diagramsAsFiles }))
        }
        onOpenChange={setSettingsOpen}
        open={settingsOpen}
        pageMargins={settings.pageMargins}
        pageOrientation={settings.pageOrientation}
        pageSize={settings.pageSize}
        paragraphSpacingPixels={settings.paragraphSpacingPixels}
        profileName={profileName}
        themePreference={settings.themePreference}
      />
      <AiSettingsDialog
        open={aiSettingsOpen}
        onOpenChange={setAiSettingsOpen}
        profileName={profileName}
        ai={settings.ai}
        onAiChange={(ai) => setSettings((current) => ({ ...current, ai }))}
      />
      {pendingAiEdit ? (
        <AiEditPreviewDialog
          open
          actionLabel={pendingAiEdit.actionLabel}
          originalText={pendingAiEdit.originalText}
          proposedText={pendingAiEdit.proposedText}
          onAccept={applyPendingAiEdit}
          onReject={() => {
            pendingAiApplyRef.current = null;
            setPendingAiEdit(null);
          }}
        />
      ) : null}
      <AboutDialog onOpenChange={setAboutOpen} open={aboutOpen} />
      <ExportProgressDialog
        open={exportProgress !== null}
        title={exportProgress?.title ?? ""}
        message={exportProgress?.message ?? ""}
      />
      <McpWriteConfirmDialog
        open={pendingMcpWrite !== null}
        clientLabel={pendingMcpWrite?.clientLabel ?? ""}
        currentMarkdown={markdown}
        proposedMarkdown={pendingMcpWrite?.markdown ?? ""}
        onApprove={approvePendingMcpWrite}
        onReject={rejectPendingMcpWrite}
      />
      <PublishWebDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        initialConnection={settings.publishTarget}
        defaultRemoteFilename={defaultPublishFilename}
        pendingHostKey={pendingHostKey}
        onAcceptHostKey={acceptHostKey}
        onRejectHostKey={rejectHostKey}
        onSubmit={handlePublishSubmit}
        onSelectPrivateKey={async () => {
          const result = await window.nexus?.selectPrivateKeyFile();
          return result && !result.canceled ? result.filePath : null;
        }}
      />
      <QuickConnectDialog
        open={quickConnectOpen}
        onOpenChange={setQuickConnectOpen}
        initialValues={{ ...settings.quickConnect, token: quickConnectToken }}
        onSubmit={handleQuickConnectSubmit}
      />
    </main>
  );
}

export default App;
