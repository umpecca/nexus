import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { APP_NAME } from "./lib/appInfo";
import {
  createDefaultSettings,
  loadSettings,
  resetSettings,
  saveSettings,
  type AppThemePreference
} from "./lib/settings";
import type { AppMenuAction } from "./api";
import { Titlebar } from "./components/titlebar/Titlebar";
import StatusBar from "./components/statusbar/StatusBar";
import Showcase from "./components/showcase/Showcase";
import SettingsDialog from "./components/settings/SettingsDialog";
import AboutDialog from "./components/about/AboutDialog";

type ResolvedTheme = "light" | "sky" | "dark";

const MIN_ZOOM_PERCENT = 50;
const MAX_ZOOM_PERCENT = 200;
const ZOOM_STEP_PERCENT = 10;

function resolveThemePreference(themePreference: AppThemePreference): ResolvedTheme {
  if (themePreference === "light" || themePreference === "sky" || themePreference === "dark") {
    return themePreference;
  }

  // "system" follows the OS light/dark setting; light mode keeps the signature Sky look.
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "sky";
}

function clampZoomPercent(zoomPercent: number) {
  return Math.min(MAX_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT, zoomPercent));
}

function getFileName(filePath: string | undefined) {
  if (!filePath) {
    return null;
  }
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

function App() {
  const [settings, setSettings] = useState(createDefaultSettings);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveThemePreference(createDefaultSettings().themePreference)
  );
  const [zoomPercent, setZoomPercent] = useState(100);
  const [text, setText] = useState("");
  const [lastSavedText, setLastSavedText] = useState("");
  const [filePath, setFilePath] = useState<string | undefined>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  const isDirty = text !== lastSavedText;
  const fileName = getFileName(filePath);

  // Hydrate persisted settings once on mount, then persist on every change.
  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // Resolve the active theme, following the OS while "system" is selected.
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
    return () => colorSchemeQuery.removeEventListener("change", updateResolvedTheme);
  }, [settings.themePreference]);

  // Apply the resolved theme to the document root (CSS reads [data-theme]).
  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme === "dark" ? "dark" : "light";
    return () => {
      delete document.documentElement.dataset.theme;
      document.documentElement.style.colorScheme = "";
    };
  }, [resolvedTheme]);

  useEffect(() => {
    document.title = `${fileName ?? "Untitled"}${isDirty ? " •" : ""} - ${APP_NAME}`;
  }, [fileName, isDirty]);

  const openFile = useCallback(async () => {
    const result = await window.api?.openTextFile();
    if (result && !result.canceled) {
      setText(result.content);
      setLastSavedText(result.content);
      setFilePath(result.filePath);
    }
  }, []);

  const saveFile = useCallback(async () => {
    if (filePath) {
      await window.api?.saveTextFile(filePath, text);
      setLastSavedText(text);
      return;
    }

    const result = await window.api?.saveTextFileAs(undefined, text);
    if (result && !result.canceled) {
      setFilePath(result.filePath);
      setLastSavedText(text);
    }
  }, [filePath, text]);

  const saveFileAs = useCallback(async () => {
    const result = await window.api?.saveTextFileAs(filePath, text);
    if (result && !result.canceled) {
      setFilePath(result.filePath);
      setLastSavedText(text);
    }
  }, [filePath, text]);

  const newFile = useCallback(() => {
    setText("");
    setLastSavedText("");
    setFilePath(undefined);
  }, []);

  const dispatchMenuAction = useCallback(
    (action: AppMenuAction) => {
      switch (action) {
        case "new":
          newFile();
          break;
        case "open":
          void openFile();
          break;
        case "save":
          void saveFile();
          break;
        case "saveAs":
          void saveFileAs();
          break;
        case "zoomIn":
          setZoomPercent((current) => clampZoomPercent(current + ZOOM_STEP_PERCENT));
          break;
        case "zoomOut":
          setZoomPercent((current) => clampZoomPercent(current - ZOOM_STEP_PERCENT));
          break;
        case "resetZoom":
          setZoomPercent(100);
          break;
        case "toggleSample":
          setSettings((current) => ({ ...current, sampleToggle: !current.sampleToggle }));
          break;
        case "settings":
          setSettingsOpen(true);
          break;
        case "about":
          setAboutOpen(true);
          break;
      }
    },
    [newFile, openFile, saveFile, saveFileAs]
  );

  // The native menu (electron/main.cjs) sends actions over IPC; route them through the same handler
  // the in-app menubar uses. A ref keeps the subscription stable while always calling the latest one.
  const dispatchRef = useRef(dispatchMenuAction);
  dispatchRef.current = dispatchMenuAction;
  useEffect(() => {
    return window.api?.onMenuAction((action) => dispatchRef.current(action));
  }, []);

  const shellClassName =
    window.api?.platform === "win32" ? "app-shell app-shell-windows" : "app-shell";
  const contentStyle = {
    "--app-font-family": settings.fontFamily,
    "--app-zoom": String(zoomPercent / 100)
  } as CSSProperties;

  return (
    <div className={shellClassName}>
      <Titlebar
        fileName={fileName}
        isDirty={isDirty}
        sampleToggle={settings.sampleToggle}
        dispatchMenuAction={dispatchMenuAction}
      />

      <div className="workspace" style={contentStyle}>
        <Showcase text={text} onTextChange={setText} />
      </div>

      <StatusBar
        statusText={fileName ?? "Untitled"}
        isDirty={isDirty}
        zoomPercent={zoomPercent}
        minZoom={MIN_ZOOM_PERCENT}
        maxZoom={MAX_ZOOM_PERCENT}
        onZoomIn={() => dispatchMenuAction("zoomIn")}
        onZoomOut={() => dispatchMenuAction("zoomOut")}
        onZoomReset={() => dispatchMenuAction("resetZoom")}
        onZoomChange={(value) => setZoomPercent(clampZoomPercent(value))}
      />

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        themePreference={settings.themePreference}
        fontFamily={settings.fontFamily}
        sampleToggle={settings.sampleToggle}
        onThemeChange={(themePreference) =>
          setSettings((current) => ({ ...current, themePreference }))
        }
        onFontChange={(fontFamily) => setSettings((current) => ({ ...current, fontFamily }))}
        onSampleToggleChange={(value) =>
          setSettings((current) => ({ ...current, sampleToggle: value }))
        }
        onResetSettings={() => {
          resetSettings();
          setSettings(createDefaultSettings());
        }}
      />

      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </div>
  );
}

export default App;
