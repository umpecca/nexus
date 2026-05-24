# Nexus

## 1. Product Summary

**Nexus** is a visual-first Markdown editing application for people who write technical documentation, business presentations, and paperwork-heavy content who want an approachable editor without juggling separate editor and preview tools.

## 2. Business Requirements

### 2.1 Problem Statement

Markdown is effective for structured writing, but many users still need a calm editing surface that lets them focus on the content before file-management workflows are introduced.

- Writers, documentation maintainers, analysts, and operations workers experience this problem.
- It occurs while creating or editing Markdown files that may be revised manually and by agents.
- Existing solutions often expose too many document actions before the editing experience is stable.

### 2.2 Business Objectives

- Validate a focused desktop writing workflow for Markdown.
- Reduce time from launch to editing an existing Markdown file.
- Provide a simple local foundation for later agent-assisted workflows.
- Keep v1 small enough for a solo developer or agent-driven workflow to complete.

### 2.3 Success Metrics

- A user can open the app and begin editing a Markdown document in under 10 seconds.
- A user can edit Markdown in rich-text or source mode without leaving the editor surface.
- The project can be built and run from documented package scripts.

### 2.4 Scope

#### In Scope

- A desktop-oriented application built with web technologies.
- A native application/window icon loaded from the local `nexus.png` asset.
- A Windows executable and installer icon loaded from the local `nexus.ico` asset.
- A macOS application bundle icon loaded from the generated local `nexus.icns` asset.
- A visual Markdown editor with a broad MDXEditor-backed toolbar enabled, including source mode and supported formatting, insert, and block controls.
- A sticky white shadcn-styled editor toolbar organized into unlabeled button groups, with full rich-text controls in the toolbar row and compact view controls floating over source and diff editing modes.
- Native Electron File menu actions for New, Open, Save, Save As, and Exit.
- A native File/New Window action for opening multiple editor windows at the same time.
- Operating-system file open handoff support for Markdown/text files launched from macOS Finder or Windows Explorer.
- Cross-platform external file change detection for opened Markdown/text files.
- Native Electron Edit menu actions for Undo, Redo, Find, Refresh, Cut, Copy, and Paste.
- An in-editor text find panel with highlighted matches and previous/next navigation.
- Native Electron View menu actions for zooming the editor display in, zooming out, and resetting to 100%, with the current zoom percentage shown in the menu.
- MDXEditor-backed diff review for comparing the current buffer with an externally changed disk file or the previous in-memory version.
- A native Settings menu action that opens a shadcn-styled settings dialog.
- A native Help menu with an About item that opens a shadcn-styled about dialog.
- Per-OS-profile editor font preference stored locally.
- Per-OS-profile base font size preference stored locally.
- Per-OS-profile paragraph spacing preference stored locally.
- Per-OS-profile light, dark, or system-following app theme preference stored locally.
- Per-OS-profile paper/plain editor view preference stored locally.
- Per-OS-profile plain-view responsive content wrapping preference stored locally.
- Per-OS-profile paper size and orientation preferences for Letter/A4 and portrait/landscape stored locally.
- Per-OS-profile visual editor and PDF margin preferences stored locally.
- A native desktop editor right-click menu for Cut, Copy, Paste, and spelling corrections.
- Native desktop spell checking in the editor with inline misspelling underlines and correction suggestions in the editor right-click menu.
- A shadcn-styled image import dialog for local image file paths, remote HTTP(S) image URLs, and embedded base64 images.
- Local Markdown file open and save workflows through the Electron app menu.
- HTML and PDF document export workflows through the Electron File menu.
- A toggleable rich-text editing surface that can show either a paper-width print layout or a plain words-first layout with optional responsive content wrapping.
- GitHub Actions desktop build workflow for Windows and macOS artifacts when changes land on `develop`.
- A clean blank untitled document on every app launch and in every new editor window.
- An optional embedded Model Context Protocol (MCP) server, off by default, that exposes the focused editor document to external AI clients (such as Claude Desktop via an mcp-remote shim, or ChatGPT custom connectors) when the user enables it from the preferences modal.
- A read-only MCP tool surface for listing open editor windows and reading the active document.
- A write MCP tool surface for replacing the active document content, gated by an in-app shadcn-styled diff confirmation modal that the user must approve or reject for every individual write call.
- Per-OS-profile MCP server enabled/disabled, port number, authentication mode (bearer token or none), and randomly generated bearer token preferences stored locally.

#### Out of Scope

- Top-level document action buttons.
- Real AI provider integration baked into the editor UI.
- Inline AI controls.
- MCP tools beyond reading the active document and replacing its full contents (partial patches, multi-window batched edits, file open/save through MCP, image or attachment write tools).
- Outbound MCP client behavior (Nexus calling other MCP servers).
- Remote network exposure of the MCP server (only `127.0.0.1` binding is supported).
- Multi-user collaboration.
- Cloud sync.
- Full Git integration.
- Advanced presentation export formats beyond HTML and PDF.
- Microsoft Word (.docx) export (previously attempted in T_099–T_102 and removed in T_103 because the round-tripped HTML lost its body content during DOCX conversion; may be revisited later).
- Plugin marketplace or extension system.

### 2.5 Constraints & Assumptions

- The first version targets a native desktop shell using Electron, React, and MDXEditor.
- The app should work locally first and avoid remote services by default.
- Privacy is a default assumption: document content stays local unless a future explicit integration sends it elsewhere.
- Unused vendored framework dependencies should not remain in the app tree.
- Inline AI and changed-lines review are intentionally deferred until the core editor workflow is stable.
- The project is early-stage, so the scaffold should favor clarity over architectural depth.

## 3. User Requirements

### 3.1 User Personas

- Technical writer: drafts structured documentation and wants visual formatting with Markdown portability.
- Business operator: prepares policies, notes, and reports and wants less friction than a code editor.
- Documentation maintainer: updates Markdown files and wants clear desktop-style file state while working.

### 3.2 User Goals

- Create or edit a Markdown document quickly.
- Keep content readable while editing.
- Avoid extra document-management controls while drafting.

### 3.3 User Stories

**Story 1**
> As a Markdown writer,  
> I want to edit content visually,  
> so that I can focus on the document rather than Markdown syntax.

#### Acceptance Criteria
- Given the app is open  
- When I type or format content  
- Then the Markdown document state updates immediately

**Story 2**
> As a privacy-conscious user,  
> I want new sessions to start from a blank local document,  
> so that I can work without sending document content to a service.

#### Acceptance Criteria
- Given I launch Nexus  
- When the editor appears  
- Then it starts as a blank untitled document

**Story 3**
> As a writer working with an AI assistant,
> I want to optionally let Claude or ChatGPT read and propose edits to my open document,
> so that I can keep my AI assistant in the loop without copy-pasting Markdown back and forth.

#### Acceptance Criteria
- Given the MCP server is off (the default)
- When the application launches
- Then no network ports are opened and no AI client can read or write document content

- Given I enable the MCP server from the preferences modal
- When an authenticated MCP client calls a read tool
- Then the focused window's current Markdown is returned without prompting the user

- Given I enable the MCP server from the preferences modal
- When an authenticated MCP client calls a write tool
- Then the editor shows a shadcn-styled diff confirmation modal and the write only applies after I click Approve

### 3.4 Functional Requirements

- The system shall display a Markdown editor as the primary workspace.
- The system shall keep each editor window's current document content in that window's application state.
- The system shall start each application launch with a blank untitled document and no current file path.
- The system shall focus the editor automatically when a window starts with an empty untitled document.
- The system shall provide Electron app menu items for File/New Window, File/New, File/Open, File/Save, File/Save As, File/Export as HTML, File/Export as PDF, and File/Exit.
- The system shall provide an Electron File menu action that loads a built-in demo Markdown document showcasing supported editor and export features.
- The system shall allow multiple editor windows to be open at the same time.
- The system shall route document menu actions to the currently focused editor window.
- The system shall open a blank untitled editor document when File/New Window is selected.
- The system shall accept Markdown/text file paths handed to the app by the operating system.
- The system shall open operating-system handed-off files in their own editor windows.
- The system shall support macOS Finder `open-file` events.
- The system shall support Windows Explorer/Open With file paths passed to the app process, including second-instance handoff while Nexus is already running.
- The system shall provide Electron app menu items for Edit/Undo, Edit/Redo, Edit/Find, Edit/Refresh, Edit/Cut, Edit/Copy, and Edit/Paste.
- The system shall open an in-editor find panel when Edit/Find is selected.
- The system shall highlight matching text in the current rich-text editor content while a find query is active.
- The system shall allow moving to the next and previous find match from the find panel.
- The system shall scroll the active find match into view when a search starts or moves between matches.
- The system shall show the current match position and total match count in the find panel.
- The system shall provide an Electron Edit/Compare with Previous Version menu item.
- The system shall provide Electron View menu actions for Zoom In, Zoom Out, and Reset Zoom.
- The system shall show the current editor zoom percentage in the Electron View menu.
- The system shall keep editor zoom controls out of the editor toolbar.
- The system shall adjust the editor display zoom without changing the saved Markdown, selected base font size preference, or export typography settings.
- The system shall provide an Electron Settings/Preferences menu item.
- The system shall open a shadcn-styled settings dialog from Settings/Preferences.
- The system shall provide an Electron Help/About menu item.
- The system shall open a shadcn-styled about dialog from Help/About.
- The about dialog shall show `About` in the title and `Copyright 2026 Vince` in the body.
- The system shall allow the user to choose the editor font from the settings dialog.
- The system shall provide a curated set of bundled web fonts in the editor font choices.
- The system shall allow the user to choose the base editor and export font size from the settings dialog.
- The system shall allow the user to choose paragraph spacing from the settings dialog.
- The system shall allow the user to choose System, Light, or Dark as the app theme from the settings dialog.
- The system shall follow the desktop color scheme while the app theme preference is set to System.
- The system shall store the selected app theme preference locally using a key scoped to the current OS profile name.
- The system shall allow the user to reset the current OS profile's editor preferences to default values from the settings dialog.
- The system shall allow the user to toggle paper view from the editor toolbar.
- The system shall allow the user to choose Letter or A4 as the editor paper size from the settings dialog.
- The system shall allow the user to choose Portrait or Landscape as the editor paper orientation from the settings dialog.
- The system shall allow the user to switch the editor paper orientation from the editor toolbar.
- The system shall allow the user to adjust top, right, bottom, and left paper margins from the settings dialog.
- The system shall show units for numeric font-size, paper-size, and margin preferences in the settings dialog.
- The system shall store the selected editor font locally using a key scoped to the current OS profile name.
- The system shall store the selected base font size locally using a key scoped to the current OS profile name.
- The system shall store the selected paragraph spacing locally using a key scoped to the current OS profile name.
- The system shall store the selected paper/plain editor view locally using a key scoped to the current OS profile name.
- The system shall allow the user to turn responsive content wrapping on or off while using the plain rich-text editor view.
- The system shall store the selected plain-view responsive content wrapping preference locally using a key scoped to the current OS profile name.
- The system shall store the selected paper size locally using a key scoped to the current OS profile name.
- The system shall store the selected paper orientation locally using a key scoped to the current OS profile name.
- The system shall store the selected paper margins locally using a key scoped to the current OS profile name.
- The system shall provide a native desktop context menu inside the editor for Cut, Copy, and Paste.
- The system shall enable spell checking in the editor by default.
- The system shall show inline misspelling underlines when the Electron spellchecker detects misspelled words.
- The system shall show spelling suggestions from Electron's native context-menu event when a misspelled word is under the pointer.
- The system shall allow the user to replace a misspelled word with a suggestion from the editor right-click menu.
- The system shall allow the user to add a misspelled word to the desktop spellchecker dictionary from the editor right-click menu.
- The system shall allow the user to import local image files into the editor by choosing an image from the local file system.
- The system shall store local image imports as local file URL sources in the Markdown image node.
- The system shall allow the user to import remote images by entering an `http` or `https` URL.
- The system shall allow the user to import embedded base64 images by choosing an image file to encode or by pasting a base64/data URL value.
- The system shall render relative local image paths in rich text preview relative to the currently opened Markdown file's folder.
- The system shall not rewrite relative image paths in the Markdown source when resolving them for preview.
- The system shall allow opening Markdown files from the local file system through File/Open.
- The system shall allow saving the current document through File/Save and File/Save As.
- The system shall allow exporting the current Markdown document to a self-contained HTML file through File/Export as HTML.
- The system shall allow exporting the current Markdown document to a PDF file through File/Export as PDF.
- The system shall export HTML and PDF using the selected base font size.
- The system shall export HTML and PDF using the selected paragraph spacing.
- The system shall export PDFs using the selected paper size.
- The system shall export PDFs using the selected paper orientation.
- The system shall export PDFs using the selected paper margins.
- The system shall generate PDFs from the rendered rich export HTML through a direct hidden-window print flow.
- The system shall report a PDF export failure instead of writing a plain text PDF when direct rich PDF generation is unavailable.
- The system shall resolve local relative Markdown image paths against the opened document folder during HTML and PDF export.
- The system shall embed supported local Markdown images as base64 data URLs during HTML export.
- The system shall render fenced Mermaid diagrams as base64 SVG image data URLs during HTML export and as static SVG diagrams during PDF export.
- The system shall embed bundled web font assets as base64 data URLs during HTML export when a bundled font is selected.
- The system shall render supported admonition directives as styled callout blocks during HTML and PDF export.
- The system shall exclude leading YAML frontmatter metadata from PDF export output.
- The system shall not change the current file path, saved baseline, or dirty state when exporting or previewing.
- The system shall allow manually refreshing the current opened file from disk through Edit/Refresh.
- The system shall silently reload the file from disk when manual refresh does not risk discarding unsaved edits.
- The system shall prompt before manual refresh replaces unsaved editor content with different disk content.
- The system shall clear the editor content and current file path when File/New completes.
- The system shall prompt the user to Save, Don't Save, or Cancel before File/New discards unsaved changes.
- The system shall prompt the user to Save, Don't Save, or Cancel after File/Open selects a file and before it replaces unsaved changes.
- The system shall prompt the user to Save, Don't Save, or Cancel before loading the built-in demo document over unsaved changes.
- The system shall prompt the user to Save, Don't Save, or Cancel before closing any editor window with unsaved changes.
- The system shall prompt for each dirty editor window when quitting the application with multiple windows open.
- The system shall show the app name first in the application title, followed by the current document name and full file path when a file path is available.
- The system shall prefix the document name with an asterisk in the application title when the current document has unsaved changes.
- The system shall not mark a document dirty when the editor only normalizes line endings during non-edit interactions such as scrolling.
- The system shall exit a list when the user presses Enter on an empty list item after creating a blank item.
- The system shall watch the currently opened file in each editor window for external disk changes on macOS and Windows.
- The system shall prompt the user to reload when a clean opened file changes outside the application.
- The system shall show a conflict prompt when an opened file changes outside the application while the editor buffer has unsaved changes.
- The conflict prompt shall allow the user to review a diff, reload from disk, keep editing the current buffer, or save the current buffer through Save As.
- The system shall show dirty external file conflicts in MDXEditor diff mode without replacing the current editor buffer.
- The system shall keep the disk version of an externally changed file as the diff baseline when the user chooses Review Diff.
- The system shall remember the version that existed before the most recent successful save or external-change reload for the current document.
- The system shall preserve the current editor contents in memory before reloading an externally changed file from disk.
- The system shall compare the freshly reloaded file contents against the preserved pre-reload version when Edit/Compare with Previous Version is selected.
- The system shall compare the current editor buffer against the previous saved version when Edit/Compare with Previous Version is selected after a save.
- The system shall leave Edit/Compare with Previous Version as a no-op when no previous version exists for the current document.
- The system shall notify the user when the currently opened file is moved or deleted outside the application while keeping the editor buffer open.
- The system shall not display a top document action bar in the current version.
- The system shall build Windows and macOS desktop artifacts through GitHub Actions when changes are pushed to `develop`.
- The system shall apply the project-owned `.ico` asset to Windows packaged executables and installers.
- The system shall apply the project-owned `.icns` asset to macOS packaged application bundles so Finder and Dock do not show the default Electron icon.
- The system shall allow the desktop build workflow to be started manually from GitHub Actions.
- The system shall upload packaged desktop artifacts for download from the workflow run.
- The system shall ship with the embedded MCP server disabled by default.
- The system shall allow the user to enable or disable the embedded MCP server from the settings dialog.
- The system shall let the user choose the MCP server's TCP port from the settings dialog within an allowed local port range, defaulting to 39125.
- The system shall generate a random bearer token the first time the MCP server is enabled and reuse the same token while it remains enabled.
- The system shall allow the user to regenerate the MCP bearer token from the settings dialog.
- The system shall display the current MCP bearer token in the settings dialog with a copy-to-clipboard control.
- The system shall display the current MCP server connection URL in the settings dialog when the server is enabled.
- The system shall allow the user to choose between bearer-token authentication (default) and no authentication for the MCP server from the settings dialog.
- The system shall display a clear warning in the settings dialog when the user selects no authentication, explaining that any local process can call the MCP server while it is enabled.
- The system shall hide the bearer-token controls in the settings dialog while the authentication mode is set to none.
- The system shall store the MCP server enabled flag, port number, authentication mode, and bearer token locally using a key scoped to the current OS profile name.
- The system shall bind the embedded MCP server to `127.0.0.1` only and refuse any non-loopback connection.
- The system shall reject MCP requests that do not include the configured bearer token in the `Authorization: Bearer` header while the authentication mode is set to bearer-token.
- The system shall accept MCP requests without any Authorization header while the authentication mode is set to none.
- The system shall expose a Streamable HTTP MCP transport at `/mcp` while the server is enabled.
- The system shall support MCP `initialize`, `tools/list`, and `tools/call` JSON-RPC methods through the embedded server.
- The system shall expose an MCP tool that lists open editor windows with stable identifiers, document titles, file paths, and dirty status.
- The system shall expose an MCP tool that returns the current Markdown, file path, and dirty status for the focused editor window or for a specified window identifier.
- The system shall expose an MCP tool that replaces the current Markdown contents of the focused editor window or a specified window identifier with caller-supplied Markdown.
- The system shall display a shadcn-styled MCP write confirmation dialog in the target editor window whenever an MCP client calls a write tool, showing a Markdown diff between the current buffer and the proposed replacement.
- The system shall apply an MCP write only after the user clicks Approve in the confirmation dialog for that specific tool call.
- The system shall return an explicit rejection result to the MCP client when the user clicks Reject in the confirmation dialog or closes it.
- The system shall return an explicit rejection result to the MCP client when no editor window can host the confirmation dialog.
- The system shall stop accepting MCP connections immediately when the user disables the MCP server.
- The system shall close listening sockets on application quit so that ports are released for the next launch.

#### 3.4.x Specialized Logic or Modes (Optional)

- Visual editing mode: primary editing mode using MDXEditor.
- Source editing mode: MDXEditor-provided source mode accessed through the editor toolbar.
- Toolbar controls: expose MDXEditor's broad toolbar command set through a project-owned white shadcn-styled grouped toolbar, excluding undo/redo, refresh, and zoom because those actions live in native menus, and including text formatting, lists, block type, links, local/remote/base64 image imports, relative local image previews, tables, thematic breaks, code blocks, Mermaid diagrams, local JavaScript runner blocks, admonitions, frontmatter, paper/plain view, paper orientation, plain-view responsive wrapping, and source/diff toggles where supported by enabled plugins.
- Diff review mode: use MDXEditor's diff mode to compare the current editor buffer against a renderer-supplied baseline, with the diff side read-only and the editor background kept white like the other editing modes.
- Mermaid diagrams: render standard fenced `mermaid` code blocks as non-editable diagrams in rich text mode, while source and diff modes keep the raw Mermaid fence editable as Markdown text.
- Local JavaScript runner blocks: support portable fenced code blocks using `js nexus-run` or `javascript nexus-run`, run them locally in a sandboxed browser worker, show console output/errors in the editor, and block network or nested worker APIs.
- Toolbar placement: keep the MDXEditor rich-text toolbar sticky at the top of the editor frame with a subtle gray bottom border matching the toolbar group borders, and float the right-side view controls over source and diff modes so those modes can use the full editor height.
- View switching: preserve the user's approximate scroll position when switching between rich text and source editor views.
- List editing: pressing Enter on an empty bullet, numbered, or checklist item exits the list and creates a normal paragraph.
- Paper view: rich-text editing can constrain the document body to the selected paper width with user-adjustable margins on a white editor background so element sizing better matches PDF output. This mode does not provide true Word-style pagination.
- Plain view: rich-text editing can hide the page sheet, shadow, fixed page width, fixed height, and page margins so the user can focus on text flow while keeping export settings unchanged; the user can toggle whether plain view wraps to the full application width or to a centered readable column without adding page-level horizontal scrolling.
- App theme: the settings dialog lets the user choose a Light, Dark, or System app theme. The selected theme is stored per OS profile, System tracks the desktop color-scheme setting, dark mode uses a restrained neutral palette with visible editor carets and toolbar icons, and document export output remains light for predictable PDF/HTML results.
- Editable page background: rich-text, source, diff, and plain-view editor backgrounds match the toolbar background color for visual continuity.
- Export: HTML and PDF exports render from the current Markdown buffer, resolve relative local images, render supported admonition directives as styled callout blocks, omit leading YAML frontmatter from PDF output, use the selected editor font, base font size, and paragraph spacing for rendered output, use the selected paper size, orientation, and margins for PDF page setup, print PDFs through the direct hidden-window rich export path, report failure instead of silently downgrading any export, and use native save dialogs without changing the active document. HTML export is self-contained for supported local images, Mermaid diagrams, and bundled web font assets by writing them as base64 data URLs.
- The app shall not provide a separate custom visual/source tab bar.
- MCP server: a local HTTP-based Model Context Protocol server runs inside the Electron main process while enabled. Transport is Streamable HTTP at `http://127.0.0.1:{port}/mcp` with a single POST endpoint that accepts JSON-RPC requests and returns JSON-RPC responses. Authentication mode is either a static bearer token shown in the preferences modal (default) or no authentication (opt-in, intended for trusted single-user environments). In either mode, the listener stays bound to `127.0.0.1` and the write confirmation dialog still gates every replace_document call. The tool surface is intentionally narrow: list windows, read document, replace document. Read tools execute immediately against the focused renderer (or specified window). The write tool routes through the target renderer's confirmation dialog and resolves with the user's decision before responding to the MCP client. The server is intended for local AI assistants on the same machine, not network exposure.

### 3.5 Non-Functional / Experience Requirements

- The app should feel like a focused work tool, not a marketing page.
- The editing surface should be usable on laptop-sized screens.
- Local edits should feel immediate for typical Markdown documents.
- Controls should be discoverable without onboarding.
- The UI should avoid decorative complexity that competes with document content.

## 4. Process Flow (Optional)

1. Launch Nexus.
2. Start from a blank untitled document.
3. Begin typing immediately because the editor has focus.
4. Edit visually, or switch to source mode through the editor toolbar.
5. Use File/New Window to open another blank editor window when working with multiple documents.
6. Use Edit/Find to locate text in the current document.
7. Use View/Zoom In, View/Zoom Out, or View/Reset Zoom to adjust the editor display while the View menu shows the current zoom percentage.
8. Open Markdown/text files from Finder or Explorer to launch them in Nexus editor windows.
9. Use the Electron File menu to create, open, save, save a copy, or exit the application.
10. Use File/Load Demo Document to replace the current buffer with a built-in feature showcase for testing or demos.
11. Confirm the active document from the native application title.
12. Use Settings/Preferences to choose the editor font, base font size, paper size, paper orientation, and page margins for the current OS profile.
13. Use Help/About to view application copyright information.
14. Use the Electron Edit menu or the editor right-click menu to cut, copy, copy a rich-text selection for Microsoft Word, and paste while editing.
15. Right-click an underlined misspelled word to choose a correction or add the word to the dictionary.
16. Use the editor toolbar image import control to insert a local image path, remote image URL, or embedded base64 image.
17. Preview relative local image paths from opened Markdown files using the folder that contains the Markdown file.
18. Use File/Export as HTML or File/Export as PDF to write a rendered copy of the current Markdown buffer.
19. If the opened file changes outside Nexus, choose whether to reload it or keep the current editor buffer.
20. Use Edit/Refresh to reload the current opened file from disk.
21. If a dirty opened file changes outside Nexus, choose Review Diff to compare the current buffer against the changed disk version.
22. Use Edit/Compare with Previous Version to compare the current buffer against the preserved version from before the most recent save or reload.
23. Optionally enable the MCP server from Settings/Preferences, copy the displayed connection URL and bearer token into Claude Desktop or ChatGPT, and review each proposed write through the in-app confirmation diff before applying it.

## 5. UI / Design Notes (Optional)

- Use an edge-to-edge desktop app shell focused on the editor workspace.
- Do not show top-level New, Open, Save, or Save As buttons in the current version.
- Keep document actions in the native Electron app menu.
- Keep document actions scoped to the focused editor window so multiple open documents remain independent.
- Keep HTML export and PDF export actions in the native File menu near Save actions.
- Keep the built-in demo document action in the native File menu near Open, because it replaces the current editor buffer rather than editing content in place.
- Keep undo and redo actions in the native Electron Edit menu rather than duplicating them in the editor toolbar.
- Keep manual Refresh available from the native Edit menu.
- Keep common text editing actions available from the native editor right-click menu without adding another top-level toolbar.
- Keep spelling corrections in the same editor right-click menu as common text editing actions.
- Keep editor appearance settings in a compact shadcn-styled dialog opened from the native Settings menu.
- Keep base font size, paragraph spacing, paper size, paper orientation, and margin settings in the same compact settings dialog as editor appearance.
- Keep application information in a compact shadcn-styled dialog opened from the native Help menu.
- Keep the native application title aligned with the current document path.
- Use compact shadcn-styled prompts for external file change and conflict decisions.
- Keep diff review inside MDXEditor's existing diff mode instead of adding a separate review workspace.
- Keep editor-specific controls inside a compact white shadcn-styled grouped toolbar with unlabeled button groups, consistent tooltips, a right-aligned view mode group, white bordered paragraph dropdown controls, and transform-offset dropdown/tooltip surfaces that clear the toolbar instead of being covered by it.
- Keep the paper/plain view, paper orientation, and plain-view responsive wrapping toggles in the toolbar Modes group.
- Keep the rich-text toolbar visible while scrolling long documents without allowing it to overlap document content; in source and diff modes, let the compact right-side view controls intentionally overlap the editor content at the top-right.
- On Windows, show a subtle top separator on the editor toolbar so it visually matches the bottom separator below the native menu.
- Avoid modal-first workflows for common actions.

## 6. Edge Cases

- Empty documents should be editable.
- Spellcheck suggestions may be unavailable when the operating system or Electron dictionary does not provide suggestions for the current word; Cut, Copy, and Paste should remain available.
- Initial empty untitled documents should place the caret in the editor once startup confirms no file is being opened.
- Browser storage can be unavailable or full; the app should continue editing in memory.
- Markdown syntax unsupported by the visual editor should remain accessible through source mode.
- Switching between rich text and source mode should keep the document position aligned even when the two views have different rendered heights.
- Saving without a current file path should prompt for a destination.
- Exporting an untitled document should prompt for a destination using an Untitled default file name.
- Exporting should not mark a clean document dirty or mark a dirty document clean.
- File/New should cancel cleanly if the user chooses Cancel from the unsaved-change prompt.
- File/Open should not show the unsaved-change prompt when the user cancels the native open-file dialog.
- File/Open should cancel cleanly without replacing content if the user chooses Cancel from the unsaved-change prompt after selecting a file.
- Load Demo Document should cancel cleanly without replacing content if the user chooses Cancel from the unsaved-change prompt.
- Closing one editor window should not close other open editor windows.
- Quitting the app should continue prompting dirty editor windows until all are saved/discarded or the quit is canceled.
- Closing the app or a window should cancel cleanly if the user chooses Cancel from the unsaved-change prompt.
- Operating-system handed-off file paths that are not supported Markdown/text files should be ignored.
- Saving from one Nexus window should not trigger an external-change prompt in that same window.
- Saving from one Nexus window should still be treated as an external file change for another Nexus window editing the same file.
- Deleted or moved watched files should leave the current editor buffer open for recovery or Save As.
- Closing a window after external file reload activity should clean up watchers without showing a main-process JavaScript error.
- Reloading after an external file change should leave the reloaded disk contents clean, without triggering a Save/Don't Save prompt on close unless the user edits afterward.
- Refresh on an untitled document should no-op if invoked from the menu.
- Refresh should clear the dirty marker when the editor buffer already matches the file on disk.
- Review Diff for an external dirty conflict should not overwrite the current editor buffer.
- Reloading an externally changed file should keep the pre-reload editor contents available as the previous-version diff baseline.
- Compare with Previous Version should remain unavailable as behavior when the document has not yet had a prior version baseline.
- Settings storage can be unavailable or invalid; the app should keep using a default editor font.
- Settings storage can be unavailable or invalid; the app should keep using a default 16px base font size.
- Settings storage can be unavailable or invalid; the app should keep using default 16px paragraph spacing.
- Settings storage can be unavailable or invalid; the app should keep using paper view by default.
- Settings storage can be unavailable or invalid; the app should keep using a default Letter paper size.
- Settings storage can be unavailable or invalid; the app should keep using portrait paper orientation.
- Settings storage can be unavailable or invalid; the app should keep using default one-inch page margins.
- Settings storage can be unavailable or invalid; the MCP server should remain disabled until the user explicitly turns it on.
- The configured MCP port can already be in use on the host; the server should report the bind failure to the renderer and remain disabled until the user picks another port.
- MCP write tool calls that arrive while no editor window is open should be rejected with a clear error and not crash the main process.
- MCP write tool calls that arrive while a confirmation dialog is already open in the target window should queue or be rejected with a busy error rather than overlapping multiple dialogs.
- Closing the only editor window while a confirmation dialog is open should reject the pending MCP write rather than leaving the client waiting indefinitely.
- Disabling the MCP server while a tool call is in flight should close the connection and resolve the pending call with a rejection.
- An MCP request without a bearer token, with the wrong token, or with the wrong content type should receive an explicit 401/400 response instead of being silently dropped while the authentication mode is bearer-token.
- An MCP request that arrives while the authentication mode is none should be processed without checking the Authorization header, but the loopback-only binding and write confirmation dialog should still apply.

## 7. Future Iterations / Open Questions

- Connect the inline AI command surface to one or more model providers.
- Add accept/reject controls for individual changed blocks.
- Add top-level document action buttons only if the app later needs visible duplicates of the native File menu.
- Add Git-backed diffs when a document belongs to a repository.
- Add export targets for PDF, DOCX, or slide decks.
- Add true paginated page breaks if print-layout editing becomes a core workflow.
- Expand the MCP tool surface with partial patch / find-replace tools, save and save-as tools, and image/attachment-aware tools once the read+replace baseline proves out.
- Add an MCP audit log or activity panel so users can see recent tool calls and decisions.
- Add stdio MCP transport via a separate launcher binary for clients (such as current Claude Desktop) that do not yet support HTTP/Streamable transport directly.

## 8. Notes for LLM-Assisted Development (Optional)

- Favor direct React components and local state until the workflow proves it needs more structure.
- Keep document content state explicit.
- Do not add remote AI behavior without a clear privacy boundary.
- Prefer small tasks that leave the app buildable after each step.
