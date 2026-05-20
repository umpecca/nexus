import { useEffect, useMemo, useRef, useState } from "react";
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
  markdownShortcutPlugin,
  MDXEditor,
  MDXEditorMethods,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  viewMode$
} from "@mdxeditor/editor";
import { usePublisher } from "@mdxeditor/gurx";
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
import FileChangedDialog from "./components/editor/FileChangedDialog";
import { listExitPlugin } from "./components/editor/ListExitPlugin";
import { localJavaScriptRunnerCodeBlockDescriptor } from "./components/editor/LocalJavaScriptCodeBlock";
import { mermaidCodeBlockDescriptor } from "./components/editor/MermaidCodeBlock";
import { DEMO_DOCUMENT_MARKDOWN } from "./lib/demoDocument";
import SettingsDialog from "./components/settings/SettingsDialog";
import ShadcnMdxToolbar from "./components/editor/ShadcnMdxToolbar";

const APP_TITLE = "Nexus";
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

function resolveThemePreference(themePreference: EditorThemePreference): ResolvedTheme {
  if (themePreference === "light" || themePreference === "dark") {
    return themePreference;
  }

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function App() {
  const initialDraft = useMemo(createDefaultDraft, []);
  const [markdown, setMarkdown] = useState(initialDraft.markdown);
  const [filePath, setFilePath] = useState<string | undefined>(initialDraft.filePath);
  const [lastSavedMarkdown, setLastSavedMarkdown] = useState(initialDraft.markdown);
  const [previousVersionMarkdown, setPreviousVersionMarkdown] = useState<string | undefined>();
  const [diffMarkdown, setDiffMarkdown] = useState("");
  const [pendingDiffViewRequest, setPendingDiffViewRequest] = useState(0);
  const [profileName, setProfileName] = useState("default");
  const [settings, setSettings] = useState(createDefaultSettings);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveThemePreference(createDefaultSettings().themePreference)
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [externalFileChangePrompt, setExternalFileChangePrompt] =
    useState<ExternalFileChangePrompt | null>(null);
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
  const editorStyle = {
    "--editor-font-family": settings.fontFamily,
    "--editor-font-size": `${settings.fontSizePixels}px`,
    "--editor-page-width": `${editorPageWidthInches}in`,
    "--editor-page-height": `${editorPageHeightInches}in`,
    "--editor-page-margin-top": `${settings.pageMargins.top}in`,
    "--editor-page-margin-right": `${settings.pageMargins.right}in`,
    "--editor-page-margin-bottom": `${settings.pageMargins.bottom}in`,
    "--editor-page-margin-left": `${settings.pageMargins.left}in`,
    "--editor-paragraph-spacing": `${settings.paragraphSpacingPixels}px`
  } as React.CSSProperties;
  const isDirty = hasUnsavedMarkdownChanges(markdown, lastSavedMarkdown);
  const imagePreviewHandler = useMemo(() => {
    return (imageSource: string) => {
      return window.nexus?.resolveImagePreview(filePath, imageSource) ?? Promise.resolve(imageSource);
    };
  }, [filePath]);

  filePathRef.current = filePath;

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
        focusInitialEmptyEditor();
        return;
      }

      loadDocument(result.markdown, result.filePath);
    }

    const removeMenuActionListener = window.nexus.onMenuAction((action) => {
      if (action === "new") {
        void createNewDocument();
      }

      if (action === "open") {
        void openDocument();
      }

      if (action === "loadDemo") {
        void loadDemoDocument();
      }

      if (action === "save") {
        void saveDocument();
      }

      if (action === "saveAs") {
        void saveDocumentAs();
      }

      if (action === "exportHtml") {
        void exportDocumentAsHtml();
      }

      if (action === "exportPdf") {
        void exportDocumentAsPdf();
      }

      if (action === "refresh") {
        void refreshDocumentFromDisk();
      }

      if (action === "comparePreviousVersion") {
        compareWithPreviousVersion();
      }

      if (action === "settings") {
        setSettingsOpen(true);
      }

      if (action === "about") {
        setAboutOpen(true);
      }
    });

    const removeCloseRequestListener = window.nexus.onCloseRequest(() => {
      void handleCloseRequest();
    });

    void loadInitialOpenFile();

    return () => {
      removeMenuActionListener();
      removeCloseRequestListener();
    };
  }, [filePath, lastSavedMarkdown, markdown, previousVersionMarkdown, settings]);

  return (
    <main className={appShellClassName} data-theme={resolvedTheme}>
      <section className="workspace">
        <div className="editor-column">
          <div className={editorSurfaceClassName} ref={editorSurfaceRef} style={editorStyle}>
            <EditorContextMenu>
              <MDXEditor
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
                    }
                  }),
                  markdownShortcutPlugin(),
                  diffSourcePlugin({
                    diffMarkdown,
                    readOnlyDiff: true,
                    viewMode: "rich-text"
                  }),
                  toolbarPlugin({
                    toolbarContents: () => (
                      <>
                        <DiffViewController request={pendingDiffViewRequest} />
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
        onFontFamilyChange={(fontFamily) => setSettings((current) => ({ ...current, fontFamily }))}
        onFontSizePixelsChange={(fontSizePixels) =>
          setSettings((current) => ({ ...current, fontSizePixels }))
        }
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
    </main>
  );
}

export default App;
