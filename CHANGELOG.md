# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Offline "Isoflow for data models" schema designer: portable, executable-looking `sql sqlschema`
  PostgreSQL document blocks, React Flow table/relationship editing, canonical SQL copy/download, static rich-text SVG
  diagrams, and matching HTML/PDF/web-publish rendering.
- Embedded offline OpenAPI editor for portable `yaml openapi` document blocks, with visual route,
  response, schema, server, tag, and security-scheme editing, YAML preview/import, undo/redo, compact
  rich-text summaries, and loss-preserving round trips for unknown fields and vendor extensions.
- Expandable Swagger-style OpenAPI references in rich-text documents, including method-colored
  operations grouped by tag, servers, security requirements, parameters, request bodies, responses,
  examples, and locally resolved schema details. The preview remains read-only and offline.
- Visual OpenAPI 3 request-body editing in the route editor: add/remove and rename media types,
  component-schema selection, inline object fields with required-state controls, descriptions, and
  validated JSON examples.
- Guided request-body payload-format selector for JSON, standard form fields, multipart file uploads,
  plain text, XML, and retained custom media types, with contextual form/file-field guidance.
- HTML, PDF, and web-publish exports now render valid embedded OpenAPI blocks as expanded,
  print-safe static API references instead of raw YAML, while malformed and ordinary YAML fences
  remain code blocks.
- AI/Import PDF or Images can import one PDF or multiple ordered images as Markdown at the current
  WYSIWYG/source caret. Selectable PDF text is extracted locally, scanned pages and standalone images
  use the configured vision model, and embedded PDF raster pictures are retained as Markdown images.

## [2.2.0] - 2026-07-06

### Added

- AI chat panel with configurable providers for drafting and revising alongside the document.
- Embedded draw.io editor: insert and edit diagrams inline, stored as editable images.
- Embedded Isoflow editor for isometric network/architecture diagrams.
- Footnotes: insert footnote references and definitions, with a naming dialog.
- Option to store diagrams as sidecar asset files next to the document instead of inline base64.
- Resize handle for rasterized diagram images.
- Block text alignment (left / center / right) toolbar control, round-tripped as `<div align="…">`.
- Open a Markdown file by dragging it onto the window.
- Pasting a URL over selected text wraps the selection in a link.
- When a watched file changes on disk with no unsaved edits, auto-reload it and open a clean
  before/after diff instead of prompting.

### Changed

- Consolidate the separate draw.io / Isoflow / Mermaid insert controls into a single diagram menu.
- Titlebar refinements.

### Fixed

- Draw.io and Isoflow diagrams inserted from WYSIWYG mode now return to the caret that was active
  before the native diagram window opened instead of sometimes being appended to the document end.
- Diff and dirty-state comparisons no longer report the rich-text editor's Markdown re-serialization
  (bullet style, block spacing, escaping) as edits: the baseline is normalized on load, so the diff and
  the unsaved-changes indicator reflect only real changes.

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
- T_046: Add local, remote, and base64 image imports.
- T_047: Resolve relative local image previews from the Markdown file folder.
- T_048: Exit lists from empty list items with Enter.
- T_049: Add HTML and PDF export from the File menu.
- T_050: Replace the editor toolbar with an Office-inspired grouped toolbar.
- T_051: Render Mermaid diagrams in HTML and PDF exports.
- T_052: Add a built-in feature demo document.
- T_053: Exclude frontmatter from PDF export.
- T_054: Render admonitions correctly in exports.
- T_055: Focus the initial empty editor on launch.
- T_056: Add paper-size editing and matching PDF export.
- T_057: Add adjustable visual editor and PDF margins.
- T_058: Add base font size settings for editing and export.
- T_059: Add a saved paper/plain editor view toggle.
- T_060: Align visual paper margins with first block spacing.
- T_061: Render Markdown highlights in HTML and PDF exports.
- T_062: Replace the Office-inspired editor toolbar with white shadcn button groups.
- T_063: Add a plain-view responsive content wrapping toggle.
- T_064: Match the editable page background to the toolbar background.
- T_065: Float the view controls over source and diff modes.
- T_066: Make the paper-view editor background white.
- T_067: Add a gray bottom border to the rich-text toolbar.
- T_068: Make the diff editor background white.
- T_069: Align export typography and PDF margin units with editor settings.
- T_070: Show units for numeric settings values and keep PDF margins in inches.
- T_071: Add bundled web font choices for editor and exports.
- T_072: Add a saved light, dark, and system-following app theme.
- T_073: Add a packaged macOS app bundle icon.
- T_074: Improve dark theme contrast and editor caret visibility.
- T_075: Add settings reset to defaults.
- T_076: Add portrait and landscape paper orientation for editor preview and PDF export.
- T_077: Add a toolbar paper orientation toggle.
- T_078: Add PDF print preview from the File menu.
- T_079: Wait for PDF preview paint before printing.
- T_080: Route PDF paper settings through CSS page sizing.
- T_081: Add resilient PDF print fallbacks for preview generation.
- T_082: Add profile-scoped paragraph spacing settings.
- T_083: Harden PDF preview generation against hidden-window print failures.
- T_084: Add a text-first fallback PDF renderer.
- T_085: Remove PDF print preview.
- T_086: Add editor spell checking.
- T_087: Fix spellcheck context menu timing.
- T_088: Use native spellcheck context menu.
- T_089: Add in-editor text find.
- T_090: Scroll active find matches into view.
- T_091: Add editor zoom controls.
- T_092: Move editor zoom controls to the View menu only.
- T_093: Keep PDF export on rich rendered output.
- T_094: Restore the pre-print-preview PDF export flow.
- T_095: Add MCP server settings and preferences UI scaffold.
- T_096: Add the embedded MCP HTTP server with read-only document tools.
- T_097: Add the MCP replace_document tool with diff confirmation modal.
- T_098: Add an opt-in no-auth mode for the embedded MCP server.
- T_099: Add Microsoft Word (.docx) export from the File menu.
- T_100: Fix Word export so images, Mermaid diagrams, and text formatting survive the .docx conversion.
- T_101: Switch the Word export pipeline to the actively-maintained TurboDocx fork (`@turbodocx/html-to-docx`).
- T_102: Fix the Word export Marked renderer crash by forwarding `this` to the captured default renderers so Marked's parser context resolves correctly.
- T_103: Remove the File / Export as Word Document feature (`@turbodocx/html-to-docx` dependency, the `file:export-docx` IPC handler, the `Export as Word Document…` menu item, the DOCX-only inline-style renderer overrides, `inlineLocalImageDataUrls`, `rasterizeExportSvgsViaCapture`, `getDocxPageSetup`, the preload bridge, and the TypeScript declarations) because the post-T_102 .docx output was blank in Word/LibreOffice.
- T_104: Reimplement File / Export as HTML as a self-contained static document with base64 local images, base64 Mermaid SVG image data URLs, and embedded bundled font assets.
- T_105: Add a collapsible outline / table-of-contents sidebar with a clickable, depth-indented heading tree, jump-to-section scrolling, a toolbar visibility toggle, and a per-OS-profile visibility preference.
- T_106: Add Publish as Web, uploading the self-contained HTML rendering of the current document to a user-specified SFTP server with per-publish credentials that are never stored, per-publish host-key fingerprint confirmation, and per-OS-profile persistence of only the non-secret connection fields.
- T_107: Add Publish as HTML over QuickConnect, sending the same self-contained HTML rendering to a user-configured HTTP endpoint via POST with an Authorization bearer token and an X-QuickConnect-Path header, with the URL, path, and token saved per OS profile and a bounded request timeout.
- T_108: Add an optional, off-by-default ngrok tunnel for the embedded MCP server that forwards to the loopback MCP port (outbound agent, no inbound port opened), shows the public URL and `/mcp` endpoint in settings, persists the ngrok authtoken and an optional reserved/custom domain per OS profile (using the domain when set and falling back to a random URL when it is unavailable), keeps bearer-token auth and write confirmation over the tunnel, and warns when exposing a no-auth server.
- T_109: Replace the bundled `@ngrok/ngrok` native SDK with the user's externally-installed ngrok CLI (spawned as a background process) for minimal dependencies; the ngrok authtoken now lives in the ngrok CLI configuration and is no longer stored in Nexus settings, while the optional custom domain, fallback, public-URL display, and no-auth warning are retained. On macOS the tunnel also checks the common Homebrew bin locations so a Finder-launched app can find ngrok.
- T_110: Add an optional custom ngrok executable path (a settings checkbox plus a path field) so the tunnel can use an explicit ngrok binary instead of resolving it from PATH, falling back to PATH auto-detection when the path is empty.
- T_111: Make the outline sidebar horizontally resizable by dragging (or keyboard-nudging) its right edge so long headings are no longer clipped, clamping the width to a sensible range that always leaves room for the editor and persisting it per OS profile.
- T_112: Encrypt the QuickConnect bearer token at rest using the operating system's secure storage (Electron safeStorage) in a per-profile store under userData instead of saving it in plaintext local settings, migrating any previously saved plaintext token on first launch and keeping the non-secret URL and path in local settings; when secure storage is unavailable the token is used for the publish but not persisted.
- T_113: Extend the in-editor find panel into find and replace, adding a collapsible replace row with replace-current and replace-all controls (literal replacement text), an Edit/Replace menu item and Ctrl/Cmd+H shortcut that opens the panel with the replace row expanded, and Enter-to-replace in the replace field.
- T_114: Add a File/Open Recent submenu that remembers recently opened and saved documents across sessions (most-recent-first, deduped, capped at ten) in a main-process store mirrored to the OS recent documents, reopens an entry with the same dirty-buffer confirmation as File/Open, prunes entries that can no longer be read, and offers a Clear Recent command.
- T_115: Add outline scroll-spy that highlights the heading for the section at the top of the editor viewport as the user scrolls, and extend the outline sidebar (selection-scroll and scroll-spy) to source mode in addition to rich-text, hiding it only in diff mode.
- T_116: Add a source-mode-only "Clean up formatting" toolbar command that normalizes the raw Markdown in place — consistent `-` list markers and marker spacing, one blank line around ATX headings, padded/aligned GFM tables, `---` thematic breaks, collapsed blank-line runs, and trimmed trailing whitespace (hard breaks preserved) — leaving fenced code and frontmatter untouched. It rewrites the CodeMirror buffer directly so the surgical cleanup survives instead of being re-imposed by MDXEditor's serializer.
- T_117: Expand the embedded MCP server's read tool surface with `nexus_get_outline` (the heading tree with level, text, unique slug, ordinal index, and 1-based line), `nexus_get_section` (one section's Markdown selected by heading index, slug, or text, including deeper subsections), `nexus_search_document` (literal or regex search returning 1-based line/column positions, a preview, the true total, and a truncation flag), and `nexus_get_selection` (the user's currently highlighted text and editor mode). The first three are served from the cached per-window document state; the selection tool routes through a renderer round trip. All four are read-only and never touch the write-confirmation gate or change the document.
- T_118: Expand the embedded MCP server's write tool surface beyond full-buffer replacement with three granular, in-buffer write tools: `nexus_apply_edits` (ordered string-anchored find/replace edits that fail the whole batch — without changing the document — when an anchor is missing or ambiguous, so a stale read is rejected rather than mis-applied), `nexus_replace_section` (replace a whole section by heading index, slug, or text), and `nexus_set_frontmatter` (set/merge/remove scalar YAML frontmatter fields). Each computes a proposed buffer from the cached document and routes it through the same diff-confirmation gate as `nexus_replace_document`; filesystem tools (save/open/export) remain out of scope.
- T_119: Add an opt-in, per-OS-profile "Auto-approve writes" MCP setting (off by default) that applies MCP write tool calls immediately without the per-call diff confirmation dialog, for trusted local sessions. The settings dialog shows a warning that escalates when the ngrok tunnel is on, since auto-approve plus the tunnel would let a remote client change the document without review.
- T_120: Add an authenticated `GET /health` verification endpoint to the embedded MCP server (same loopback bind and bearer-token check as `/mcp`, returning server name/version/auth mode) and a "Test setup" button in the MCP settings section that probes the local server and, when the ngrok tunnel is connected, the public ngrok URL too — reporting clear pass/fail for each so the user can confirm reachability and that the token works without wiring up an external client.
- T_121: Add "Restart tunnel" and "Stop tunnel" buttons that operate the running ngrok agent directly (restart stops and respawns to recover a wedged tunnel or refresh a random URL; stop tears it down), and serve a simple unauthenticated landing page at `/` that reports the server is reachable so the local or public ngrok URL can be opened in a browser to verify the path. The MCP settings section shows the local "Test page" URL and, when the tunnel is connected, the "Public test page" URL.
- T_122: Guarantee the ngrok agent is killed when the app closes by killing it synchronously in the `will-quit` handler (instead of a fire-and-forget async stop that was not guaranteed to run before exit) plus a `process.on("exit")` fallback, so the tunnel cannot be left running after a graceful quit. A hard kill or crash of the main process still cannot run cleanup and remains out of scope.
- T_123: Add OAuth 2.1 support to the embedded MCP server so clients that require the MCP authorization spec (ChatGPT custom connectors, Claude.ai) can connect: RFC 9728/8414 discovery metadata (with `WWW-Authenticate` challenges on 401s), RFC 7591 dynamic client registration persisted per machine, a browser consent page, and a PKCE-only (S256) authorization-code flow whose token endpoint issues the server's existing static bearer token — so `/mcp` validation is unchanged, issued access survives restarts, and Regenerate token revokes every client. Active only in bearer-token mode; the write-confirmation gate is unaffected.
- T_124: Encrypt the MCP bearer token at rest with the operating system's secure storage (Electron safeStorage) in a per-profile store under userData instead of saving it in plaintext renderer localStorage, migrating any previously saved plaintext token on first launch; the token stays in memory for the session and, when secure storage is unavailable, is not written to disk (and must be regenerated next launch). Mirrors the QuickConnect token treatment from T_112.
- T_125: Add a comprehension-oriented `nexus_find` MCP read tool that searches the focused document (literal or regex) and returns matches grouped by line, each with surrounding context lines and the heading the line falls under, so an AI client can understand what it found and where without a follow-up read. Complements `nexus_search_document` (which stays the lightweight per-occurrence positions/counts tool); the two cross-reference each other so the right one is picked.

### Fixed

- Decoded HTML character references (for example `&#x20;`, `&amp;`) when building the outline so headings that the editor serializes with escaped characters display as readable text instead of raw entities.
- Superseded the renderer-fetched spellcheck context menu path after it still failed to show suggestions consistently in the desktop app.
- Replaced the Electron desktop editor's renderer-owned context menu with a native Electron context menu so spelling suggestions appear directly from Electron's misspelled-word event.

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
- Added a manual Refresh action in the native Edit menu that reloads the current file from disk, prompting only when different disk content would replace unsaved edits.
- Added MDXEditor-backed diff review for dirty external-change conflicts and comparison against the previous saved version.
- Preserved the current editor contents before externally changed files are reloaded so diff review can compare the previous in-memory version with the new disk version.
- Fixed Electron window close cleanup so watcher teardown uses a captured webContents ID instead of reading from a destroyed window.
- Ignored stale MDXEditor change events during programmatic document reloads so externally reloaded files do not become dirty immediately.
- Applied the local `nexus.png` asset as the Electron window icon and macOS Dock icon when available.
- Added electron-builder package scripts and a GitHub Actions workflow that builds and uploads Windows and macOS desktop artifacts when changes land on `develop`.
- Configured electron-builder to apply `nexus.ico` to Windows executable and installer artifacts.
- Replaced the generic image toolbar insertion control with a shadcn-styled image import dialog for local file URLs, remote HTTP(S) URLs, and embedded base64 images.
- Replaced the temporary Command Shelf toolbar with a custom Office-inspired grouped toolbar that keeps formatting, insert, and view mode commands visible together in labeled sections while leaving refresh in the native Edit menu.
- Restored the lighter Office-inspired toolbar gray palette, added a subtle inner command-band border, aligned Nexus-owned toolbar buttons with MDXEditor's tooltip treatment, and raised toolbar dropdown layers above the sticky ribbon.
- Refined the Office-inspired toolbar with a right-aligned mode group, centered Links & Media controls, white bordered paragraph dropdown controls, and thinner flush outer toolbar borders.
- Fixed toolbar popup overlap by raising MDXEditor dropdown/tooltip portal layers and using transform-based bottom-side offsets below the ribbon.
- Resolved relative local image paths against the opened Markdown file's folder for rich-text preview without rewriting the Markdown source.
- Fixed list editing so pressing Enter on an empty list item exits the list instead of adding another blank list line.
- Added File/Export as HTML and File/Export as PDF actions that render the current Markdown buffer through native save dialogs without changing document dirty state.
- Rendered fenced Mermaid diagrams as static SVG diagrams in HTML and PDF exports while preserving inline export errors for invalid diagram syntax.
- Added File/Load Demo Document to load a clean untitled Markdown showcase covering frontmatter, formatted text, lists, links, base64 images, tables, Mermaid, runnable JavaScript, code blocks, and admonitions.
- Excluded leading YAML frontmatter metadata from PDF export output while leaving HTML export behavior unchanged.
- Rendered supported admonition directives as styled callout blocks in HTML and PDF exports instead of leaking directive markers as plain text.
- Focused MDXEditor automatically when a window starts with an empty untitled document so users can type immediately.
- Added Letter/A4 paper-size settings, centered the rich-text editor on a paper-width writing surface, and used the selected paper size for PDF export.
- Added per-side page margin settings that update the rich-text paper surface and PDF export margins together.
- Added a base font size setting that updates the editor, HTML export, and PDF export.
- Added a toolbar paper/plain view toggle so rich-text editing can hide the paper sheet while keeping export settings intact.
- Fixed visual paper margins so the first and last rendered Markdown blocks do not add extra apparent page padding.
- Rendered `==highlighted text==` as highlighted text in HTML and PDF exports instead of leaking the Markdown source delimiters.
- Corrected PDF fallback margin units and added an off-screen final print attempt for preview/export generation.
- Added a built-in text-first PDF fallback for environments where Electron's native PDF printer fails.
- Removed the File/Print Preview menu action, preview dialog, and preview-only IPC.
- Added native spell checking to the editor, with inline misspelling underlines, suggestions in the editor right-click menu, and Add to dictionary support.
- Added Edit/Find with a compact in-editor search panel, highlighted rich-text matches, match counts, and previous/next navigation.
- Fixed Edit/Find navigation so the active match scrolls into view inside the Nexus editor surface.
- Added editor zoom controls for zoom in, zoom out, and reset to 100% from the View menu and toolbar.
- Removed editor zoom controls from the toolbar and updated the View menu to show the current zoom percentage on Reset Zoom.
- Restored PDF export to rich rendered output only, correcting Electron custom margin units and reporting failures instead of writing plain text fallback PDFs.
- Reverted PDF export to the pre-print-preview direct hidden-window render and print flow.
- Reworked HTML export to prompt first, render through a self-contained export path, inline supported local Markdown images and bundled fonts as base64 data URLs, and serialize Mermaid diagrams as base64 SVG `<img>` elements while leaving PDF export behavior unchanged.
- Reskinned the application chrome as Microsoft Office 2010: Word-style blue chrome gradients with Segoe UI (light) and the Office Black scheme (dark), a blue File tab in the titlebar tab row, a ribbon-styled toolbar with captioned groups and gold hover / amber pressed states, Office-style menus with an icon gutter, Windows 7 Aero dialog buttons and inputs, and a slate document canvas around the page in paper view.
- Added a Word 2010-style status bar with live word count, the current editor view mode, an unsaved-changes indicator, and a zoom slider with percentage reset button.
- Modernized the Office 2010 theme into a flat Fluent-style rendition that keeps the 2010 identity (blue-tinted chrome, blue File tab, gold hover and amber toggled states, captioned ribbon groups, slate page canvas): glass gradients, bevels, and text shadows replaced with flat tinted fills, hairline borders, 6-10px radii, soft elevation shadows, pill-shaped titlebar tabs, rounded gutter-less menus, solid accent primary buttons, focus-ring inputs, a circular accent zoom-slider thumb, a blurred dialog overlay, and slim rounded scrollbars.
