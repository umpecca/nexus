# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-05-08

### Added

- T_001: Create the desktop application shell.
- T_002: Add Markdown editing modes and local draft persistence.
- T_003: Add Markdown import and export actions.
- T_004: Add baseline comparison and changed-lines review.
- T_005: Remove changed-lines and inline AI UI from the initial workflow.
- T_006: Replace the custom visual/source toggle with MDXEditor source mode.
- T_007: Remove the top document action bar.
- T_008: Enable the broad MDXEditor toolbar.
- T_009: Add a PowerShell NW.js runner script.
- T_010: Convert the desktop runtime from NW.js to Electron.
- T_011: Add Electron File menu document actions.
- T_012: Add an Electron File menu Exit action.
- T_013: Make the MDXEditor toolbar sticky.
- T_014: Add native Electron Edit menu actions.
- T_015: Replace the Kitchen Sink toolbar with a shadcn-styled MDXEditor toolbar.
- T_016: Fix shadcn toolbar wrapping and dropdown stacking.
- T_017: Remove desktop editor chrome around the workspace.
- T_018: Add traditional File/New dirty-buffer handling.
- T_019: Show the active document path in the application title.
- T_020: Put Nexus first in the title and mark unsaved documents.
- T_021: Add a Windows-only top separator above the editor toolbar.
- T_022: Prompt before closing with unsaved changes.
- T_023: Add a shadcn-styled editor context menu.
- T_024: Start each launch with a blank untitled document.
- T_025: Remove unused HorizonJS/ExtJS vendored dependency.
- T_026: Remove duplicate undo and redo toolbar controls.
- T_027: Add profile-scoped editor font settings.
- T_028: Add a Help/About dialog.
- T_029: Keep rich/source editor scroll positions in sync.
- T_030: Prompt before opening over unsaved changes.
- T_031: Prompt after selecting a file to open.
- T_032: Add multiple editor windows.
- T_033: Open OS-handed files from Finder or Explorer.
- T_034: Keep scroll-only interactions from marking opened files dirty.
- T_035: Replace Sandpack with a local JavaScript runner.
- T_036: Render Mermaid diagrams in rich text mode.
- T_037: Prompt when opened files change outside Nexus.
- T_038: Add manual refresh from disk.
- T_039: Add MDXEditor diff review workflow.
- T_040: Preserve pre-reload versions for diff review.
- T_041: Fix close cleanup after external file reloads.
- T_042: Keep external reloads clean after programmatic editor updates.
- T_043: Use Nexus PNG as the Electron app icon.
- T_044: Add GitHub Actions desktop builds.
- T_045: Add the Nexus ICO to Windows builds.

### Changed

- Removed the visible changed-lines review, baseline action, and inline AI command panel from the app shell while keeping the editor, source mode, import, export, and local draft persistence.
- Moved source editing into MDXEditor's built-in toolbar toggle and removed the custom editor mode tabs.
- Removed the top New, Import, and Export action section to focus the current app shell on the editor workspace.
- Replaced the minimal editor toolbar with MDXEditor's Kitchen Sink toolbar and enabled supporting plugins for links, images, tables, code blocks, admonitions, frontmatter, and Sandpack blocks.
- Added a Windows PowerShell desktop runner, later replaced by the Electron runner in T_010.
- Replaced NW.js package metadata, scripts, and runner with Electron main/preload files and an Electron PowerShell runner.
- Added native Electron File menu items for New, Open, Save, and Save As, backed by preload IPC and main-process file dialogs.
- Added a native File/Exit menu item that quits the Electron app.
- Updated the editor layout so the MDXEditor toolbar stays at the top of the editor frame while the document area scrolls below it.
- Added a native Electron Edit menu with Undo, Redo, Cut, Copy, and Paste actions.
- Added local shadcn-style UI primitives and replaced the built-in Kitchen Sink toolbar with a project-owned toolbar that keeps the same MDXEditor command coverage.
- Tightened the shadcn-styled toolbar layout so control groups wrap predictably and raised MDXEditor dropdown/popover surfaces above the sticky toolbar.
- Removed the outer editor padding, framed editor border, rounded frame corners, and rich-text focus outline so the editor reads more like a native desktop workspace.
- Updated File/New to prompt for unsaved changes, optionally save first, and then clear the editor content and current file path.
- Updated the application window title to show Untitled for new documents and the current document name plus full file path after opening or saving a file.
- Updated the application window title to put the app name first and prefix the document name with an asterisk when the current buffer has unsaved changes.
- Added a Windows-only toolbar top separator so the editor toolbar visually balances the bottom separator under the native menu.
- Updated window close and File/Exit flows to prompt for Save, Don't Save, or Cancel when the current buffer has unsaved changes.
- Added a shadcn-styled right-click context menu inside the editor with Cut, Copy, and Paste commands backed by Electron edit actions.
- Changed startup behavior so Nexus opens to a clean blank untitled document instead of restoring prior local draft content.
- Removed the unused HorizonJS/ExtJS vendored source and public assets from the project.
- Removed duplicate undo and redo controls from the editor toolbar because those actions are already available from the native Edit menu.
- Added a native Settings/Preferences menu item that opens a shadcn-styled settings dialog for choosing the editor font, persisted locally per OS profile name.
- Added a native Help/About menu item that opens a shadcn-styled About dialog with the copyright notice.
- Kept the editor's approximate scroll position aligned when switching between rich text and source views.
- Updated File/Open to use the same Save, Don't Save, or Cancel dirty-buffer prompt before replacing unsaved changes.
- Moved the File/Open dirty-buffer prompt until after a file is selected, so canceling the native open dialog does not trigger the save prompt.
- Added File/New Window so multiple editor windows can be open at the same time, with document actions scoped to the focused window and app quit prompting dirty windows one by one.
- Added OS file-open handoff support so Markdown/text files opened from macOS Finder or Windows Explorer load into Nexus editor windows.
- Updated dirty-buffer detection to ignore editor line-ending normalization so opening and scrolling a file does not mark it as modified.
- Removed Nexus's Sandpack toolbar/plugin usage and added local `js nexus-run` code blocks that execute in a sandboxed worker with console output.
- Added rich-text Mermaid diagram rendering for `mermaid` fenced code blocks, with source and diff modes preserving raw editable Markdown.
- Added per-window external file watchers that prompt to reload changed files, surface dirty-buffer conflicts, and keep buffers open when watched files are moved or deleted.
- Added a manual Refresh action in the editor toolbar and native Edit menu that reloads the current file from disk, prompting only when different disk content would replace unsaved edits.
- Added MDXEditor-backed diff review for dirty external-change conflicts and comparison against the previous saved version.
- Preserved the current editor contents before externally changed files are reloaded so diff review can compare the previous in-memory version with the new disk version.
- Fixed Electron window close cleanup so watcher teardown uses a captured webContents ID instead of reading from a destroyed window.
- Ignored stale MDXEditor change events during programmatic document reloads so externally reloaded files do not become dirty immediately.
- Applied the local `nexus.png` asset as the Electron window icon and macOS Dock icon when available.
- Added electron-builder package scripts and a GitHub Actions workflow that builds and uploads Windows and macOS desktop artifacts when changes land on `develop`.
- Configured electron-builder to apply `nexus.ico` to Windows executable and installer artifacts.
