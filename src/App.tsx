import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { highlightWhitespace } from "@codemirror/view";
import {
  AdmonitionDirectiveDescriptor,
  codeBlockPlugin,
  codeMirrorPlugin,
  directivesPlugin,
  diffSourcePlugin,
  frontmatterPlugin,
  headingsPlugin,
  imagePlugin,
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
import {
  createDefaultSettings,
  getEditorPageSizeOption,
  loadSettings,
  resetSettings,
  saveSettings
} from "./lib/settings";
import type { EditorThemePreference } from "./lib/settings";
import AboutDialog from "./components/about/AboutDialog";
import EditorContextMenu from "./components/editor/EditorContextMenu";
import FindTextPanel from "./components/editor/FindTextPanel";
import FileChangedDialog from "./components/editor/FileChangedDialog";
import { listExitPlugin } from "./components/editor/ListExitPlugin";
import ParseErrorPanel from "./components/editor/ParseErrorPanel";
import type { ParseErrorInfo } from "./components/editor/ParseErrorPanel";
import { localJavaScriptRunnerCodeBlockDescriptor } from "./components/editor/LocalJavaScriptCodeBlock";
import { mermaidCodeBlockDescriptor } from "./components/editor/MermaidCodeBlock";
import { DEMO_DOCUMENT_MARKDOWN } from "./lib/demoDocument";
import SettingsDialog from "./components/settings/SettingsDialog";
import ShadcnMdxToolbar from "./components/editor/ShadcnMdxToolbar";
import McpWriteConfirmDialog from "./components/mcp/McpWriteConfirmDialog";

const APP_TITLE = "Nexus";

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

type ResolvedTheme = "light" | "dark";

function getDocumentName(filePath: string) {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] || filePath;
}

function formatWindowTitle(filePath: string | undefined, isDirty: boolean) {
  const dirtyPrefix = isDirty ? "*" : "";

  if (!filePath) {
    return `${APP_TITLE} - ${dirtyPrefix}Untitled`;
  }

  return `${APP_TITLE} - ${dirtyPrefix}${getDocumentName(filePath)} (${filePath})`;
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

function ViewModeTracker({
  viewModeRef
}: {
  viewModeRef: React.MutableRefObject<ViewMode>;
}) {
  const [mode] = useCellValues(viewMode$);

  useEffect(() => {
    viewModeRef.current = mode;
  }, [mode, viewModeRef]);

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
  if (themePreference === "light" || themePreference === "dark") {
    return themePreference;
  }

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function clampEditorZoomPercent(zoomPercent: number) {
  return Math.min(
    MAX_EDITOR_ZOOM_PERCENT,
    Math.max(MIN_EDITOR_ZOOM_PERCENT, zoomPercent)
  );
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
  const [editorZoomPercent, setEditorZoomPercent] = useState(100);
  const [profileName, setProfileName] = useState("default");
  const [settings, setSettings] = useState(createDefaultSettings);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveThemePreference(createDefaultSettings().themePreference)
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [externalFileChangePrompt, setExternalFileChangePrompt] =
    useState<ExternalFileChangePrompt | null>(null);
  const [pendingMcpWrite, setPendingMcpWrite] = useState<
    { requestId: string; markdown: string; clientLabel: string } | null
  >(null);
  const [parseError, setParseError] = useState<ParseErrorInfo | null>(null);
  const [dismissedErrorKey, setDismissedErrorKey] = useState<string | null>(null);
  const editorRef = useRef<MDXEditorMethods>(null);
  const editorSurfaceRef = useRef<HTMLDivElement>(null);
  const editorScrollSnapshotRef = useRef<ScrollSnapshot>({ ratio: 0, top: 0 });
  const activeScrollElementRef = useRef<HTMLElement | null>(null);
  const isApplyingScrollRef = useRef(false);
  const filePathRef = useRef(filePath);
  const hasHandledInitialOpenFileRef = useRef(false);
  const hasFocusedInitialEmptyEditorRef = useRef(false);
  const programmaticMarkdownChangeRef = useRef<ProgrammaticMarkdownChange | null>(null);
  const programmaticMarkdownChangeTimeoutRef = useRef<number | undefined>();
  const currentViewModeRef = useRef<ViewMode>("rich-text");
  const menuHandlersRef = useRef({
    createNewDocument,
    openDocument,
    loadDemoDocument,
    saveDocument,
    saveDocumentAs,
    exportDocumentAsHtml,
    exportDocumentAsPdf,
    refreshDocumentFromDisk,
    compareWithPreviousVersion,
    openFindPanel,
    zoomEditorIn,
    zoomEditorOut,
    resetEditorZoom,
    handleCloseRequest,
    focusInitialEmptyEditor,
    loadDocument,
    openSettings: () => setSettingsOpen(true),
    openAbout: () => setAboutOpen(true),
    toggleShowInvisibles: () =>
      setSettings((current) => ({
        ...current,
        showInvisibleCharacters: !current.showInvisibleCharacters
      })),
    copyHtmlSelection
  });
  const appShellClassName = window.nexus?.platform === "win32" ? "app-shell app-shell-windows" : "app-shell";
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
    "--editor-paragraph-spacing": `${settings.paragraphSpacingPixels * editorZoomScale}px`
  } as React.CSSProperties;
  const isDirty = hasUnsavedMarkdownChanges(markdown, lastSavedMarkdown);
  const parseErrorKey = parseError ? `${parseError.error}|${parseError.source}` : null;
  const showParseError = parseError !== null && parseErrorKey !== dismissedErrorKey;
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

  filePathRef.current = filePath;
  menuHandlersRef.current = {
    createNewDocument,
    openDocument,
    loadDemoDocument,
    saveDocument,
    saveDocumentAs,
    exportDocumentAsHtml,
    exportDocumentAsPdf,
    refreshDocumentFromDisk,
    compareWithPreviousVersion,
    openFindPanel,
    zoomEditorIn,
    zoomEditorOut,
    resetEditorZoom,
    handleCloseRequest,
    focusInitialEmptyEditor,
    loadDocument,
    openSettings: () => setSettingsOpen(true),
    openAbout: () => setAboutOpen(true),
    toggleShowInvisibles: () =>
      setSettings((current) => ({
        ...current,
        showInvisibleCharacters: !current.showInvisibleCharacters
      })),
    copyHtmlSelection
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

      setProfileName(nextProfileName);
      setSettings(loadSettings(nextProfileName));
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
    void window.nexus?.configureMcpServer({
      enabled: settings.mcpServer.enabled,
      port: settings.mcpServer.port,
      authMode: settings.mcpServer.authMode,
      bearerToken: settings.mcpServer.bearerToken
    });
  }, [
    settings.mcpServer.enabled,
    settings.mcpServer.port,
    settings.mcpServer.authMode,
    settings.mcpServer.bearerToken
  ]);

  useEffect(() => {
    window.nexus?.setMenuState({
      editorZoomPercent,
      showInvisibleCharacters: settings.showInvisibleCharacters
    });
  }, [editorZoomPercent, settings.showInvisibleCharacters]);

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
    document.documentElement.style.colorScheme = resolvedTheme;

    return () => {
      delete document.documentElement.dataset.theme;
      document.documentElement.style.colorScheme = "";
    };
  }, [resolvedTheme]);

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
      markdown
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
      markdown
    });
  }, [filePath, lastSavedMarkdown, markdown]);

  useEffect(() => {
    if (!window.nexus) {
      return;
    }

    return window.nexus.onMcpConfirmWrite((payload) => {
      setPendingMcpWrite((current) => {
        if (current) {
          window.nexus?.resolveMcpWrite(payload.requestId, "reject");
          return current;
        }
        return payload;
      });
    });
  }, []);

  function approvePendingMcpWrite() {
    setPendingMcpWrite((pending) => {
      if (!pending) {
        return null;
      }

      beginProgrammaticMarkdownChange(pending.markdown);
      editorRef.current?.setMarkdown(pending.markdown);
      setMarkdown(pending.markdown);
      window.nexus?.resolveMcpWrite(pending.requestId, "approve");
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

        setExternalFileChangePrompt({
          filePath: result.filePath,
          kind: event.kind,
          markdown: result.markdown,
          source: "external",
          timestamp: event.timestamp
        });
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

  function compareWithPreviousVersion() {
    if (previousVersionMarkdown === undefined) {
      return;
    }

    requestDiffView(previousVersionMarkdown);
  }

  function openFindPanel() {
    setPendingFindRequest((current) => current + 1);
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

  function loadDocument(
    nextMarkdown: string,
    nextFilePath: string | undefined,
    options: { previousVersionMarkdown?: string } = {}
  ) {
    editorScrollSnapshotRef.current = { ratio: 0, top: 0 };
    beginProgrammaticMarkdownChange(nextMarkdown);
    editorRef.current?.setMarkdown(nextMarkdown);
    setLastSavedMarkdown(nextMarkdown);
    setPreviousVersionMarkdown(options.previousVersionMarkdown);
    setDiffMarkdown(options.previousVersionMarkdown ?? "");
    setMarkdown(nextMarkdown);
    setFilePath(nextFilePath);
    setExternalFileChangePrompt(null);
  }

  function clearDocument() {
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

  async function rasterizeSvgToPngDataUrl(
    svg: SVGElement,
    width: number,
    height: number
  ): Promise<string | null> {
    const clone = svg.cloneNode(true) as SVGElement;
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));
    if (!clone.getAttribute("xmlns")) {
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    }

    const svgString = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);

    try {
      return await new Promise<string | null>((resolve) => {
        const image = new Image();
        image.onload = () => {
          const scale = 2;
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(width * scale));
          canvas.height = Math.max(1, Math.round(height * scale));
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.scale(scale, scale);
          ctx.drawImage(image, 0, 0, width, height);
          try {
            resolve(canvas.toDataURL("image/png"));
          } catch {
            resolve(null);
          }
        };
        image.onerror = () => resolve(null);
        image.src = svgUrl;
      });
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  }

  async function copyHtmlSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return;
    }

    const text = selection.toString();
    if (!text) {
      return;
    }

    const liveSvgs: { svg: SVGElement; width: number; height: number }[] = [];
    const allSvgs = Array.from(document.querySelectorAll("svg"));
    for (let index = 0; index < selection.rangeCount; index += 1) {
      const range = selection.getRangeAt(index);
      for (const svg of allSvgs) {
        if (!range.intersectsNode(svg)) {
          continue;
        }
        const rect = svg.getBoundingClientRect();
        liveSvgs.push({
          svg,
          width: rect.width,
          height: rect.height
        });
      }
    }

    const container = document.createElement("div");
    for (let index = 0; index < selection.rangeCount; index += 1) {
      container.appendChild(selection.getRangeAt(index).cloneContents());
    }

    const clonedSvgs = Array.from(container.querySelectorAll("svg"));
    const replaceableCount = Math.min(clonedSvgs.length, liveSvgs.length);
    for (let i = 0; i < replaceableCount; i += 1) {
      const cloned = clonedSvgs[i];
      const { svg, width, height } = liveSvgs[i];
      if (width <= 0 || height <= 0) {
        continue;
      }
      const dataUrl = await rasterizeSvgToPngDataUrl(svg, width, height);
      if (!dataUrl) {
        continue;
      }
      const img = document.createElement("img");
      img.src = dataUrl;
      img.width = Math.round(width);
      img.height = Math.round(height);
      cloned.parentNode?.replaceChild(img, cloned);
    }

    const imgs = Array.from(container.querySelectorAll("img"));
    for (const img of imgs) {
      const src = img.getAttribute("src");
      if (!src || src.startsWith("data:")) {
        continue;
      }
      const dataUrl = await window.nexus?.convertImageToDataUrl(src);
      if (dataUrl) {
        img.setAttribute("src", dataUrl);
      }
    }

    const html = container.innerHTML;

    void window.nexus?.writeHtmlToClipboard({ html, text });
  }

  async function saveDocument(): Promise<boolean> {
    const currentMarkdown = getCurrentMarkdown();

    if (filePath) {
      await window.nexus?.saveMarkdownFile(filePath, currentMarkdown);
      recordSuccessfulSave(currentMarkdown, filePath, true);
      return true;
    }

    const result = await window.nexus?.saveMarkdownFileAs(undefined, currentMarkdown);
    if (result && !result.canceled) {
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

    loadDocument(result.markdown, result.filePath);
  }

  async function loadDemoDocument() {
    const canReplace = await confirmDirtyBufferAction();
    if (!canReplace) {
      return;
    }

    loadDocument(DEMO_DOCUMENT_MARKDOWN, undefined);
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
        loadDocument(result.markdown, result.filePath, {
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

      loadDocument(result.markdown, result.filePath);
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

      menuHandlersRef.current.loadDocument(result.markdown, result.filePath);
    }

    const removeMenuActionListener = window.nexus.onMenuAction((action) => {
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
        case "settings":
          h.openSettings();
          break;
        case "about":
          h.openAbout();
          break;
        case "copyHtml":
          void h.copyHtmlSelection();
          break;
      }
    });

    const removeCloseRequestListener = window.nexus.onCloseRequest(() => {
      void menuHandlersRef.current.handleCloseRequest();
    });

    void loadInitialOpenFile();

    return () => {
      removeMenuActionListener();
      removeCloseRequestListener();
    };
  }, []);

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
      <section className="workspace">
        <div className="editor-column">
          <div className={editorSurfaceClassName} ref={editorSurfaceRef} style={editorStyle}>
            <EditorContextMenu>
              <MDXEditor
                key={`editor-${settings.showInvisibleCharacters}`}
                ref={editorRef}
                markdown={markdown}
                onChange={handleMarkdownChange}
                contentEditableClassName="markdown-body"
                plugins={[
                  headingsPlugin(),
                  listsPlugin(),
                  listExitPlugin(),
                  quotePlugin(),
                  thematicBreakPlugin(),
                  linkPlugin(),
                  linkDialogPlugin(),
                  imagePlugin({ imagePreviewHandler }),
                  tablePlugin(),
                  frontmatterPlugin(),
                  directivesPlugin({ directiveDescriptors: [AdmonitionDirectiveDescriptor] }),
                  codeBlockPlugin({
                    defaultCodeBlockLanguage: "txt",
                    codeBlockEditorDescriptors: [
                      mermaidCodeBlockDescriptor,
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
                      bash: "Bash",
                      powershell: "PowerShell"
                    },
                    codeMirrorExtensions: settings.showInvisibleCharacters
                      ? [highlightWhitespace()]
                      : []
                  }),
                  markdownShortcutPlugin(),
                  searchPlugin(),
                  diffSourcePlugin({
                    diffMarkdown,
                    readOnlyDiff: true,
                    viewMode: currentViewModeRef.current,
                    codeMirrorExtensions: settings.showInvisibleCharacters
                      ? [highlightWhitespace()]
                      : []
                  }),
                  toolbarPlugin({
                    toolbarContents: () => (
                      <>
                        <DiffViewController request={pendingDiffViewRequest} />
                        <FindTextPanel
                          onActiveMatchChange={scrollFindMatchIntoView}
                          openRequest={pendingFindRequest}
                        />
                        <ViewModeTracker viewModeRef={currentViewModeRef} />
                        <ParseErrorTracker onErrorChange={setParseError} />
                        <ShadcnMdxToolbar
                          onPageOrientationChange={(pageOrientation) =>
                            setSettings((current) => ({ ...current, pageOrientation }))
                          }
                          onPaperViewChange={(paperViewEnabled) =>
                            setSettings((current) => ({ ...current, paperViewEnabled }))
                          }
                          onResponsiveContentWrappingChange={(responsiveContentWrappingEnabled) =>
                            setSettings((current) => ({
                              ...current,
                              responsiveContentWrappingEnabled
                            }))
                          }
                          pageOrientation={settings.pageOrientation}
                          paperViewEnabled={settings.paperViewEnabled}
                          responsiveContentWrappingEnabled={
                            settings.responsiveContentWrappingEnabled
                          }
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
      </section>
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
        onOpenChange={setSettingsOpen}
        open={settingsOpen}
        pageMargins={settings.pageMargins}
        pageOrientation={settings.pageOrientation}
        pageSize={settings.pageSize}
        paragraphSpacingPixels={settings.paragraphSpacingPixels}
        profileName={profileName}
        themePreference={settings.themePreference}
      />
      <AboutDialog onOpenChange={setAboutOpen} open={aboutOpen} />
      <McpWriteConfirmDialog
        open={pendingMcpWrite !== null}
        clientLabel={pendingMcpWrite?.clientLabel ?? ""}
        currentMarkdown={markdown}
        proposedMarkdown={pendingMcpWrite?.markdown ?? ""}
        onApprove={approvePendingMcpWrite}
        onReject={rejectPendingMcpWrite}
      />
    </main>
  );
}

export default App;
