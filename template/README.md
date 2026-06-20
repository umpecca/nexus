# App Template

A self-contained starter for desktop apps: **Electron + React 18 + Vite + TypeScript** with a
themed, Radix-based design system. It's a stripped shell — a custom frameless titlebar, a menubar,
a status bar, themed dialogs, and a component showcase — ready to copy out and build on.

## What's included

- **Three themes** — Sky (default), Light, and Dark, plus a "System" preference that follows the OS.
  Everything is driven by CSS variables in [`src/styles.css`](src/styles.css), so retheming means
  editing the token blocks at the top.
- **Design-system components** ([`src/components/ui`](src/components/ui)) — `Button` (default /
  outline / ghost, three sizes), `ButtonGroup`, `Separator`, `Dialog`, `Menubar`, and `ContextMenu`,
  built on Radix primitives with `class-variance-authority` + `tailwind-merge` (`cn` helper).
- **Custom frameless chrome** — an in-app titlebar with a menubar and Windows-style window controls
  ([`src/components/titlebar`](src/components/titlebar)), and a status bar with a UI-scale zoom
  slider ([`src/components/statusbar`](src/components/statusbar)). On macOS the native traffic
  lights are kept and the menu lives in the native menu bar.
- **Electron main/preload** ([`electron/`](electron)) — frameless window creation, a native menu
  mirroring the in-app one, window-control + edit-command IPC, a single-instance lock, external-link
  handling, and a generic text **Open / Save / Save As** round-trip through native dialogs.
- **Settings** ([`src/lib/settings.ts`](src/lib/settings.ts)) — theme, font, and a sample toggle,
  persisted to `localStorage`, surfaced in a Settings dialog.
- **Build tooling** — Vite, `tsc --noEmit` type-checking, Vitest (one sample test), and
  electron-builder config for Windows (NSIS + portable) and macOS (dmg + zip).

The home screen ([`src/components/showcase/Showcase.tsx`](src/components/showcase/Showcase.tsx)) is a
living demo of every component. Delete it (and its import in `App.tsx`) when you start a real app.

## Getting started

```bash
npm install
npm run dev            # Vite dev server — open the printed URL in a browser to preview the UI
npm run start:electron # build, then launch the full desktop app (frameless window, menus, dialogs)
```

> The renderer runs fine in a plain browser (every `window.api` call is `?.`-guarded), so
> `npm run dev` is great for working on the UI. Window controls, native menus, and file dialogs only
> do something inside Electron via `npm run start:electron`.

On Windows you can also use [`scripts/run-electron.ps1`](scripts/run-electron.ps1)
(`-InstallIfMissing` to `npm install` first, `-SkipBuild` to skip the rebuild).

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | `tsc --noEmit` type-check, then `vite build` into `dist/` |
| `npm run preview` | Serve the production build |
| `npm run start:electron` | Build, then launch Electron |
| `npm test` | Run the Vitest suite |
| `npm run dist:win` / `npm run dist:mac` | Package installers with electron-builder |

## Architecture

```
electron/main.cjs   Main process: window, native menu, IPC, file dialogs
electron/preload.cjs Context bridge → window.api (typed in src/api.d.ts)
src/main.tsx        React entry; imports fonts + styles
src/App.tsx         Shell: theme + settings state, menu-action routing, file buffer
src/styles.css      Theme tokens + all chrome/component styling
src/lib/            cn() util, settings, app name
src/components/     ui/ primitives + titlebar/statusbar/about/settings/showcase
```

The renderer never touches Node directly. It calls `window.api.*` (defined in `electron/preload.cjs`,
typed in `src/api.d.ts`); each method maps to an `ipcMain.handle` in `electron/main.cjs`. Add a
capability by extending all three.

## Renaming for a new project

1. `APP_NAME` in [`src/lib/appInfo.ts`](src/lib/appInfo.ts).
2. `name`, `description`, and the `build.appId` / `build.productName` fields in
   [`package.json`](package.json).
3. The `<title>` in [`index.html`](index.html) and the settings `localStorage` key in
   `src/lib/settings.ts` (`app-template:settings:v1`).
4. Drop your own `icon.png` (≥512×512), `icon.ico`, and `icon.icns` next to `package.json` before
   running `npm run dist:*`. Without them the app still runs and packages with Electron's default
   icon.
5. Optional: the CSS class prefix is `nexus-`; rename it across `src/styles.css` and the component
   `className`s if you'd like a neutral prefix.
