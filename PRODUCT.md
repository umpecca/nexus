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
- A visual Markdown editor with the broad MDXEditor toolbar enabled, including source mode and supported formatting, insert, and block controls.
- A sticky MDXEditor toolbar that remains available at the top of the editor without covering the editable document area.
- Native Electron File menu actions for New, Open, Save, Save As, and Exit.
- Local Markdown file open and save workflows through the Electron app menu.
- Local draft persistence between sessions.

#### Out of Scope

- Top-level document action buttons.
- Real AI provider integration.
- Inline AI controls.
- Changed-lines or diff review UI.
- Multi-user collaboration.
- Cloud sync.
- Full Git integration.
- Rich presentation export formats.
- Plugin marketplace or extension system.

### 2.5 Constraints & Assumptions

- The first version targets a native desktop shell using Electron, React, and MDXEditor.
- The app should work locally first and avoid remote services by default.
- Privacy is a default assumption: document content stays local unless a future explicit integration sends it elsewhere.
- Inline AI and changed-lines review are intentionally deferred until the core editor workflow is stable.
- The project is early-stage, so the scaffold should favor clarity over architectural depth.

## 3. User Requirements

### 3.1 User Personas

- Technical writer: drafts structured documentation and wants visual formatting with Markdown portability.
- Business operator: prepares policies, notes, and reports and wants less friction than a code editor.
- Documentation maintainer: updates Markdown files and wants local draft recovery while working.

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
> I want drafts to stay local,  
> so that I can work without sending document content to a service.

#### Acceptance Criteria
- Given I edit a document  
- When I close and reopen the app  
- Then the last local draft is restored from local storage

### 3.4 Functional Requirements

- The system shall display a Markdown editor as the primary workspace.
- The system shall keep the current document content in application state.
- The system shall persist the current draft locally in the browser storage available to the Electron renderer.
- The system shall provide Electron app menu items for File/New, File/Open, File/Save, File/Save As, and File/Exit.
- The system shall allow opening Markdown files from the local file system through File/Open.
- The system shall allow saving the current document through File/Save and File/Save As.
- The system shall not display a top document action bar in the current version.

#### 3.4.x Specialized Logic or Modes (Optional)

- Visual editing mode: primary editing mode using MDXEditor.
- Source editing mode: MDXEditor-provided source mode accessed through the editor toolbar.
- Toolbar controls: expose MDXEditor's broad built-in toolbar set, including undo/redo, text formatting, lists, block type, links, images, tables, thematic breaks, code blocks, Sandpack blocks, admonitions, frontmatter, and source/diff toggles where supported by enabled plugins.
- Toolbar placement: keep the MDXEditor toolbar sticky at the top of the editor frame and reserve the remaining frame height for the document editing area.
- The app shall not provide a separate custom visual/source tab bar.

### 3.5 Non-Functional / Experience Requirements

- The app should feel like a focused work tool, not a marketing page.
- The editing surface should be usable on laptop-sized screens.
- Local edits should feel immediate for typical Markdown documents.
- Controls should be discoverable without onboarding.
- The UI should avoid decorative complexity that competes with document content.

## 4. Process Flow (Optional)

1. Launch Nexus.
2. Start from the local draft.
3. Edit visually, or switch to source mode through the editor toolbar.
4. Use the Electron File menu to create, open, save, save a copy, or exit the application.

## 5. UI / Design Notes (Optional)

- Use a compact app shell focused on the editor workspace.
- Do not show top-level New, Open, Save, or Save As buttons in the current version.
- Keep document actions in the native Electron app menu.
- Keep editor-specific controls inside the MDXEditor toolbar and prefer built-in MDXEditor controls over custom duplicates.
- Keep the toolbar visible while scrolling long documents without allowing it to overlap document content.
- Avoid modal-first workflows for common actions.

## 6. Edge Cases

- Empty documents should be editable.
- Browser storage can be unavailable or full; the app should continue editing in memory.
- Markdown syntax unsupported by the visual editor should remain accessible through source mode.
- Saving without a current file path should prompt for a destination.
- Opening or creating a document currently replaces the editor content without an unsaved-change prompt.

## 7. Future Iterations / Open Questions

- Connect the inline AI command surface to one or more model providers.
- Add changed-lines review comparing the current document to a trusted baseline.
- Add accept/reject controls for individual changed blocks.
- Add unsaved-change prompts before replacing or closing modified documents.
- Add top-level document action buttons only if the app later needs visible duplicates of the native File menu.
- Add Git-backed diffs when a document belongs to a repository.
- Add export targets for PDF, DOCX, or slide decks.

## 8. Notes for LLM-Assisted Development (Optional)

- Favor direct React components and local state until the workflow proves it needs more structure.
- Keep document content state explicit.
- Do not add remote AI behavior without a clear privacy boundary.
- Prefer small tasks that leave the app buildable after each step.
