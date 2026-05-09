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
