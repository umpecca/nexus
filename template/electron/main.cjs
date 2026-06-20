const path = require("node:path");
const fs = require("node:fs/promises");
const { existsSync } = require("node:fs");
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require("electron");

const APP_NAME = "App Template";

// `vite` prints a dev-server URL; the launcher script sets APP_DEV_SERVER_URL to it so the window
// loads from Vite (with HMR) in development, and from the built dist/ folder in production.
const isDev = Boolean(process.env.APP_DEV_SERVER_URL);
const appIconPath = path.join(__dirname, "..", "icon.png");

function getAppIconPath() {
  // Ship your own icon.png / icon.ico / icon.icns next to package.json. When absent, Electron's
  // default icon is used, so the template still runs and packages without any icon assets.
  return existsSync(appIconPath) ? appIconPath : undefined;
}

function createWindow() {
  const isMac = process.platform === "darwin";
  const window = new BrowserWindow({
    title: APP_NAME,
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    backgroundColor: "#e9eef7",
    icon: getAppIconPath(),
    // Custom in-app titlebar (see src/components/titlebar). On macOS we keep the native traffic
    // lights via "hidden"; on Windows/Linux the window is fully frameless.
    ...(isMac
      ? { titleBarStyle: "hidden", trafficLightPosition: { x: 12, y: 11 } }
      : { frame: false }),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  });

  // Keep the custom titlebar's maximize/restore button in sync with the real window state.
  const sendMaximizeState = () => {
    if (!window.isDestroyed()) {
      window.webContents.send("window:maximize-changed", window.isMaximized());
    }
  };
  window.on("maximize", sendMaximizeState);
  window.on("unmaximize", sendMaximizeState);

  // Open web links (e.g. window.open) in the user's default browser, never a new Electron window.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // Never let an external link navigate the app window away from its own page.
  window.webContents.on("will-navigate", (event, url) => {
    let target;
    try {
      target = new URL(url);
    } catch {
      return;
    }

    if (target.protocol !== "http:" && target.protocol !== "https:") {
      return;
    }

    let current = null;
    try {
      current = new URL(window.webContents.getURL());
    } catch {
      current = null;
    }

    if (!current || target.host !== current.host) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  if (isDev) {
    window.loadURL(process.env.APP_DEV_SERVER_URL);
  } else {
    window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  return window;
}

// Forward a menu click to the focused window's renderer, where App.tsx's dispatchMenuAction runs it.
function sendMenuAction(action) {
  const window = BrowserWindow.getFocusedWindow();
  if (window) {
    window.webContents.send("menu:action", action);
  }
}

// Run a clipboard/history command on a window's web contents. Used by the in-app Edit menu, which
// (unlike the native menu) cannot use Electron menu roles.
function runEditCommand(window, command) {
  if (!window || window.isDestroyed()) {
    return;
  }

  const commands = {
    cut: () => window.webContents.cut(),
    copy: () => window.webContents.copy(),
    paste: () => window.webContents.paste(),
    undo: () => window.webContents.undo(),
    redo: () => window.webContents.redo()
  };
  commands[command]?.();
}

function buildMenu() {
  const isMac = process.platform === "darwin";

  const template = [
    ...(isMac
      ? [
          {
            label: APP_NAME,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { label: "Preferences…", accelerator: "Cmd+,", click: () => sendMenuAction("settings") },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" }
            ]
          }
        ]
      : []),
    {
      label: "File",
      submenu: [
        { label: "New Window", accelerator: "CmdOrCtrl+Shift+N", click: () => createWindow() },
        { type: "separator" },
        { label: "New", accelerator: "CmdOrCtrl+N", click: () => sendMenuAction("new") },
        { label: "Open…", accelerator: "CmdOrCtrl+O", click: () => sendMenuAction("open") },
        { label: "Save", accelerator: "CmdOrCtrl+S", click: () => sendMenuAction("save") },
        { label: "Save As…", accelerator: "CmdOrCtrl+Shift+S", click: () => sendMenuAction("saveAs") },
        { type: "separator" },
        isMac ? { role: "close" } : { label: "Exit", role: "quit" }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" }
      ]
    },
    {
      label: "View",
      submenu: [
        { label: "Zoom In", accelerator: "CmdOrCtrl+Plus", click: () => sendMenuAction("zoomIn") },
        { label: "Zoom Out", accelerator: "CmdOrCtrl+-", click: () => sendMenuAction("zoomOut") },
        { label: "Reset Zoom", accelerator: "CmdOrCtrl+0", click: () => sendMenuAction("resetZoom") },
        { type: "separator" },
        { label: "Toggle Sample Setting", click: () => sendMenuAction("toggleSample") },
        { type: "separator" },
        { role: "toggleDevTools" }
      ]
    },
    ...(isMac
      ? []
      : [
          {
            label: "Settings",
            submenu: [
              { label: "Preferences…", accelerator: "CmdOrCtrl+,", click: () => sendMenuAction("settings") }
            ]
          }
        ]),
    {
      label: "Help",
      submenu: [{ label: `About ${APP_NAME}`, click: () => sendMenuAction("about") }]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── IPC: window controls (driven by the custom titlebar) ─────────────────────────────────────
ipcMain.handle("window:minimize", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});
ipcMain.handle("window:toggle-maximize", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) {
    return;
  }
  if (window.isMaximized()) {
    window.unmaximize();
  } else {
    window.maximize();
  }
});
ipcMain.handle("window:close", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});
ipcMain.handle("window:is-maximized", (event) => {
  return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
});
ipcMain.handle("window:new", () => {
  createWindow();
});
ipcMain.handle("app:quit", () => {
  app.quit();
});
ipcMain.handle("app:open-external", (_event, url) => {
  if (typeof url === "string" && /^https?:/i.test(url)) {
    return shell.openExternal(url);
  }
});

// ── IPC: edit commands (for the in-app Edit menu) ────────────────────────────────────────────
ipcMain.handle("edit:command", (event, command) => {
  runEditCommand(BrowserWindow.fromWebContents(event.sender), command);
});

// ── IPC: generic text file open/save (demonstrates the native-dialog round-trip) ─────────────
ipcMain.handle("file:open", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(window, {
    properties: ["openFile"],
    filters: [
      { name: "Text", extensions: ["txt", "md", "json", "csv", "log"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const filePath = result.filePaths[0];
  const content = await fs.readFile(filePath, "utf8");
  return { canceled: false, filePath, content };
});

ipcMain.handle("file:save", async (_event, { filePath, content }) => {
  await fs.writeFile(filePath, content ?? "", "utf8");
  return { filePath };
});

ipcMain.handle("file:saveAs", async (event, { currentPath, content }) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(window, {
    defaultPath: currentPath,
    filters: [
      { name: "Text", extensions: ["txt"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  await fs.writeFile(result.filePath, content ?? "", "utf8");
  return { filePath: result.filePath };
});

// ── App lifecycle ────────────────────────────────────────────────────────────────────────────
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [existing] = BrowserWindow.getAllWindows();
    if (existing) {
      if (existing.isMinimized()) {
        existing.restore();
      }
      existing.focus();
    } else {
      createWindow();
    }
  });

  app.whenReady().then(() => {
    buildMenu();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
