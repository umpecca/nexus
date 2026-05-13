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
- A visual Markdown editor with a broad MDXEditor-backed toolbar enabled, including source mode and supported formatting, insert, and block controls.
- A sticky shadcn-styled editor toolbar that remains available at the top of the editor without covering the editable document area.
- Native Electron File menu actions for New, Open, Save, Save As, and Exit.
- A native File/New Window action for opening multiple editor windows at the same time.
- Operating-system file open handoff support for Markdown/text files launched from macOS Finder or Windows Explorer.
- Cross-platform external file change detection for opened Markdown/text files.
- Native Electron Edit menu actions for Undo, Redo, Refresh, Cut, Copy, and Paste.
- MDXEditor-backed diff review for comparing the current buffer with an externally changed disk file or the previous in-memory version.
- A native Settings menu action that opens a shadcn-styled settings dialog.
- A native Help menu with an About item that opens a shadcn-styled about dialog.
- Per-OS-profile editor font preference stored locally.
- A shadcn-styled editor right-click menu for Cut, Copy, and Paste.
- Local Markdown file open and save workflows through the Electron app menu.
- GitHub Actions desktop build workflow for Windows and macOS artifacts when changes land on `develop`.
- A clean blank untitled document on every app launch and in every new editor window.

#### Out of Scope

- Top-level document action buttons.
- Real AI provider integration.
- Inline AI controls.
- Multi-user collaboration.
- Cloud sync.
- Full Git integration.
- Rich presentation export formats.
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

### 3.4 Functional Requirements

- The system shall display a Markdown editor as the primary workspace.
- The system shall keep each editor window's current document content in that window's application state.
- The system shall start each application launch with a blank untitled document and no current file path.
- The system shall provide Electron app menu items for File/New Window, File/New, File/Open, File/Save, File/Save As, and File/Exit.
- The system shall allow multiple editor windows to be open at the same time.
- The system shall route document menu actions to the currently focused editor window.
- The system shall open a blank untitled editor document when File/New Window is selected.
- The system shall accept Markdown/text file paths handed to the app by the operating system.
- The system shall open operating-system handed-off files in their own editor windows.
- The system shall support macOS Finder `open-file` events.
- The system shall support Windows Explorer/Open With file paths passed to the app process, including second-instance handoff while Nexus is already running.
- The system shall provide Electron app menu items for Edit/Undo, Edit/Redo, Edit/Refresh, Edit/Cut, Edit/Copy, and Edit/Paste.
- The system shall provide an Electron Edit/Compare with Previous Version menu item.
- The system shall provide an Electron Settings/Preferences menu item.
- The system shall open a shadcn-styled settings dialog from Settings/Preferences.
- The system shall provide an Electron Help/About menu item.
- The system shall open a shadcn-styled about dialog from Help/About.
- The about dialog shall show `About` in the title and `Copyright 2026 Vince` in the body.
- The system shall allow the user to choose the editor font from the settings dialog.
- The system shall store the selected editor font locally using a key scoped to the current OS profile name.
- The system shall provide a shadcn-styled context menu inside the editor for Cut, Copy, and Paste.
- The system shall allow opening Markdown files from the local file system through File/Open.
- The system shall allow saving the current document through File/Save and File/Save As.
- The system shall allow manually refreshing the current opened file from disk through the editor toolbar and Edit/Refresh.
- The system shall silently reload the file from disk when manual refresh does not risk discarding unsaved edits.
- The system shall prompt before manual refresh replaces unsaved editor content with different disk content.
- The system shall clear the editor content and current file path when File/New completes.
- The system shall prompt the user to Save, Don't Save, or Cancel before File/New discards unsaved changes.
- The system shall prompt the user to Save, Don't Save, or Cancel after File/Open selects a file and before it replaces unsaved changes.
- The system shall prompt the user to Save, Don't Save, or Cancel before closing any editor window with unsaved changes.
- The system shall prompt for each dirty editor window when quitting the application with multiple windows open.
- The system shall show the app name first in the application title, followed by the current document name and full file path when a file path is available.
- The system shall prefix the document name with an asterisk in the application title when the current document has unsaved changes.
- The system shall not mark a document dirty when the editor only normalizes line endings during non-edit interactions such as scrolling.
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
- The system shall allow the desktop build workflow to be started manually from GitHub Actions.
- The system shall upload packaged desktop artifacts for download from the workflow run.

#### 3.4.x Specialized Logic or Modes (Optional)

- Visual editing mode: primary editing mode using MDXEditor.
- Source editing mode: MDXEditor-provided source mode accessed through the editor toolbar.
- Toolbar controls: expose MDXEditor's broad toolbar command set through project-owned shadcn-styled controls, excluding undo/redo because those actions live in the native Edit menu, and including refresh, text formatting, lists, block type, links, images, tables, thematic breaks, code blocks, Mermaid diagrams, local JavaScript runner blocks, admonitions, frontmatter, and source/diff toggles where supported by enabled plugins.
- Diff review mode: use MDXEditor's diff mode to compare the current editor buffer against a renderer-supplied baseline, with the diff side read-only.
- Mermaid diagrams: render standard fenced `mermaid` code blocks as non-editable diagrams in rich text mode, while source and diff modes keep the raw Mermaid fence editable as Markdown text.
- Local JavaScript runner blocks: support portable fenced code blocks using `js nexus-run` or `javascript nexus-run`, run them locally in a sandboxed browser worker, show console output/errors in the editor, and block network or nested worker APIs.
- Toolbar placement: keep the MDXEditor toolbar sticky at the top of the editor frame and reserve the remaining frame height for the document editing area.
- View switching: preserve the user's approximate scroll position when switching between rich text and source editor views.
- The app shall not provide a separate custom visual/source tab bar.

### 3.5 Non-Functional / Experience Requirements

- The app should feel like a focused work tool, not a marketing page.
- The editing surface should be usable on laptop-sized screens.
- Local edits should feel immediate for typical Markdown documents.
- Controls should be discoverable without onboarding.
- The UI should avoid decorative complexity that competes with document content.

## 4. Process Flow (Optional)

1. Launch Nexus.
2. Start from a blank untitled document.
3. Edit visually, or switch to source mode through the editor toolbar.
4. Use File/New Window to open another blank editor window when working with multiple documents.
5. Open Markdown/text files from Finder or Explorer to launch them in Nexus editor windows.
6. Use the Electron File menu to create, open, save, save a copy, or exit the application.
7. Confirm the active document from the native application title.
8. Use Settings/Preferences to choose the editor font for the current OS profile.
9. Use Help/About to view application copyright information.
10. Use the Electron Edit menu or the editor right-click menu to cut, copy, and paste while editing.
11. If the opened file changes outside Nexus, choose whether to reload it or keep the current editor buffer.
12. Use Refresh from the toolbar or Edit menu to reload the current opened file from disk.
13. If a dirty opened file changes outside Nexus, choose Review Diff to compare the current buffer against the changed disk version.
14. Use Edit/Compare with Previous Version to compare the current buffer against the preserved version from before the most recent save or reload.

## 5. UI / Design Notes (Optional)

- Use an edge-to-edge desktop app shell focused on the editor workspace.
- Do not show top-level New, Open, Save, or Save As buttons in the current version.
- Keep document actions in the native Electron app menu.
- Keep document actions scoped to the focused editor window so multiple open documents remain independent.
- Keep undo and redo actions in the native Electron Edit menu rather than duplicating them in the editor toolbar.
- Keep manual Refresh available from both the native Edit menu and the editor toolbar.
- Keep common text editing actions available from the editor right-click menu without adding another top-level toolbar.
- Keep editor appearance settings in a compact shadcn-styled dialog opened from the native Settings menu.
- Keep application information in a compact shadcn-styled dialog opened from the native Help menu.
- Keep the native application title aligned with the current document path.
- Use compact shadcn-styled prompts for external file change and conflict decisions.
- Keep diff review inside MDXEditor's existing diff mode instead of adding a separate review workspace.
- Keep editor-specific controls inside the editor toolbar and preserve MDXEditor command behavior while using project-owned shadcn-styled toolbar composition.
- Keep the toolbar visible while scrolling long documents without allowing it to overlap document content.
- On Windows, show a subtle top separator on the editor toolbar so it visually matches the bottom separator below the native menu.
- Avoid modal-first workflows for common actions.

## 6. Edge Cases

- Empty documents should be editable.
- Browser storage can be unavailable or full; the app should continue editing in memory.
- Markdown syntax unsupported by the visual editor should remain accessible through source mode.
- Switching between rich text and source mode should keep the document position aligned even when the two views have different rendered heights.
- Saving without a current file path should prompt for a destination.
- File/New should cancel cleanly if the user chooses Cancel from the unsaved-change prompt.
- File/Open should not show the unsaved-change prompt when the user cancels the native open-file dialog.
- File/Open should cancel cleanly without replacing content if the user chooses Cancel from the unsaved-change prompt after selecting a file.
- Closing one editor window should not close other open editor windows.
- Quitting the app should continue prompting dirty editor windows until all are saved/discarded or the quit is canceled.
- Closing the app or a window should cancel cleanly if the user chooses Cancel from the unsaved-change prompt.
- Operating-system handed-off file paths that are not supported Markdown/text files should be ignored.
- Saving from one Nexus window should not trigger an external-change prompt in that same window.
- Saving from one Nexus window should still be treated as an external file change for another Nexus window editing the same file.
- Deleted or moved watched files should leave the current editor buffer open for recovery or Save As.
- Closing a window after external file reload activity should clean up watchers without showing a main-process JavaScript error.
- Reloading after an external file change should leave the reloaded disk contents clean, without triggering a Save/Don't Save prompt on close unless the user edits afterward.
- Refresh on an untitled document should be unavailable from the toolbar and should no-op if invoked from the menu.
- Refresh should clear the dirty marker when the editor buffer already matches the file on disk.
- Review Diff for an external dirty conflict should not overwrite the current editor buffer.
- Reloading an externally changed file should keep the pre-reload editor contents available as the previous-version diff baseline.
- Compare with Previous Version should remain unavailable as behavior when the document has not yet had a prior version baseline.
- Settings storage can be unavailable or invalid; the app should keep using a default editor font.

## 7. Future Iterations / Open Questions

- Connect the inline AI command surface to one or more model providers.
- Add accept/reject controls for individual changed blocks.
- Add top-level document action buttons only if the app later needs visible duplicates of the native File menu.
- Add Git-backed diffs when a document belongs to a repository.
- Add export targets for PDF, DOCX, or slide decks.

## 8. Notes for LLM-Assisted Development (Optional)

- Favor direct React components and local state until the workflow proves it needs more structure.
- Keep document content state explicit.
- Do not add remote AI behavior without a clear privacy boundary.
- Prefer small tasks that leave the app buildable after each step.
