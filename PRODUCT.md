# Nexus

## 1. Product Summary

**Nexus** is a visual-first Markdown editing application for people who write technical documentation, business presentations, and paperwork-heavy content. It combines approachable rich-text and source editing with optional, user-configured AI assistance for drafting, revising, importing, and safely applying document changes.

## 2. Business Requirements

### 2.1 Problem Statement

Markdown is effective for structured writing, but many users still need a calm editing surface that lets them focus on the content without juggling separate editor, preview, diagram, and AI tools.

- Writers, documentation maintainers, analysts, and operations workers experience this problem.
- It occurs while creating or editing Markdown files that may be revised manually and by agents.
- Existing solutions often expose too many document actions, or require users to copy document content between an editor and an external AI chat.

### 2.2 Business Objectives

- Validate a focused desktop writing workflow for Markdown.
- Reduce time from launch to editing an existing Markdown file.
- Provide optional AI-assisted writing and document-aware chat without making a remote service mandatory for editing.
- Keep model-provider choice under the user's control, including support for local runtimes.
- Keep v1 small enough for a solo developer or agent-driven workflow to complete.

### 2.3 Success Metrics

- A user can open the app and begin editing a Markdown document in under 10 seconds.
- A user can edit Markdown in rich-text or source mode without leaving the editor surface.
- A user with a configured AI provider can revise selected text, chat about the current document, and review proposed edits without copying the document into another application.
- The project can be built and run from documented package scripts.

### 2.4 Scope

#### In Scope

- A desktop-oriented application built with web technologies.
- A native application/window icon loaded from the local `nexus.png` asset.
- A Windows executable and installer icon loaded from the local `nexus.ico` asset.
- A macOS application bundle icon loaded from the generated local `nexus.icns` asset.
- A visual Markdown editor with a broad MDXEditor-backed toolbar enabled, including source mode and supported formatting, insert, and block controls.
- A sticky white shadcn-styled editor toolbar organized into unlabeled button groups, with full rich-text controls in the toolbar row and compact view controls floating over source and diff editing modes.
- A source-mode-only "Clean up formatting" command that normalizes the raw Markdown in place (consistent list markers and spacing, blank lines around headings, aligned tables, normalized thematic breaks, collapsed blank-line runs, trimmed trailing whitespace) while leaving fenced code and frontmatter untouched.
- Native Electron File menu actions for New, Open, Save, Save As, and Exit.
- A File/Open Recent submenu that remembers recently opened and saved documents across sessions for one-click reopening, with a Clear Recent command.
- A native File/New Window action for opening multiple editor windows at the same time.
- Operating-system file open handoff support for Markdown/text files launched from macOS Finder or Windows Explorer.
- Cross-platform external file change detection for opened Markdown/text files.
- Native Electron Edit menu actions for Undo, Redo, Find, Replace, Refresh, Cut, Copy, and Paste.
- An in-editor text find-and-replace panel with highlighted matches, previous/next navigation, and replace-current/replace-all controls.
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
- A shadcn-styled image import dialog for local image file paths, remote HTTP(S) image URLs, and
  embedded base64 images, plus draggable edge cropping for ordinary raster images.
- An offline visual OpenAPI editor, adapted from the MIT-licensed `waterrmalann/openapi-editor`, that
  inserts and reopens portable ```` ```yaml openapi ```` blocks from the rich-text toolbar. The
  editor covers routes, parameters, responses, schemas, API metadata, servers, tags, and security
  schemes, visual OpenAPI 3 request bodies (media types, component or inline schemas, required
  fields, validated JSON examples, and guided JSON/form/file-upload media-type selection), preserves
  unknown fields and vendor extensions, and commits only on explicit Save. In
  rich-text mode, each block expands into an offline Swagger-style API reference with tagged,
  method-colored operations, parameters, request bodies, responses, servers, and schema details;
  HTML and PDF exports use the same static reference rather than exposing the raw YAML.
- An offline visual data-model designer ("Isoflow for data models") that stores portable,
  executable-looking ```` ```sql sqlschema ```` PostgreSQL blocks. It supports positioned tables,
  columns, descriptions, colors, primary/unique/nullable/default fields, single-column foreign keys,
  inline SVG previews, and static document exports without database connections or network assets.
- Optional, per-OS-profile AI provider configuration for OpenAI, Azure OpenAI, DeepSeek, Anthropic, Ollama, LM Studio, and an existing `opencode serve` instance, with user-selectable models and connection testing.
- AI provider API keys encrypted at rest using the operating system's secure storage and omitted from plaintext application settings.
- AI selection actions for improving, shortening, expanding, correcting, summarizing, changing the tone of, and translating selected text, with an original-versus-proposed review before replacement.
- A resizable, document-scoped AI chat panel that streams responses, can include the current editor selection, can use the existing Nexus document tools to inspect or propose changes to the current document, and saves chat history locally for saved documents.
- AI chat write operations routed through the same document-change confirmation boundary as MCP writes.
- An AI document-import workflow that converts one PDF or multiple ordered images into Markdown at the current caret, using local PDF extraction where possible and the configured vision-capable model where image understanding is required.
- Local Markdown file open and save workflows through the Electron app menu.
- HTML and PDF document export workflows through the Electron File menu.
- A Publish as Web workflow that uploads the self-contained HTML rendering of the current document to a user-specified SFTP server, with credentials entered per publish and never stored.
- A QuickConnect publishing target that sends the same self-contained HTML rendering to a user-configured HTTP endpoint with a bearer token, intended for a simple self-hostable web server.
- A toggleable rich-text editing surface that can show either a paper-width print layout or a plain words-first layout with optional responsive content wrapping.
- A collapsible editor outline sidebar that lists the current document's headings as a clickable, depth-indented tree for jumping to sections in rich-text and source mode, with the section under the top of the viewport highlighted as the user scrolls.
- GitHub Actions desktop build workflow for Windows and macOS artifacts when changes land on `develop`.
- A clean blank untitled document on every app launch and in every new editor window.
- An optional embedded Model Context Protocol (MCP) server, off by default, that exposes the focused editor document to external AI clients (such as Claude Desktop via an mcp-remote shim, or ChatGPT custom connectors) when the user enables it from the preferences modal.
- An optional ngrok tunnel, off by default, that uses the user's installed ngrok CLI to expose the enabled MCP server through a public ngrok URL so remote AI clients can reach it without opening an inbound network port on the user's machine.
- A read-only MCP tool surface for listing open editor windows, reading the active document, reading the document heading outline, reading a single document section, searching the document, finding text with surrounding context and the enclosing heading, and reading the user's current editor selection.
- A write MCP tool surface for replacing the active document content, applying granular in-buffer edits (ordered find/replace edits, replacing a section by heading, and setting scalar frontmatter fields), each gated by an in-app shadcn-styled diff confirmation modal that the user must approve or reject for every individual write call.
- An opt-in, off-by-default per-OS-profile setting that auto-approves MCP write calls without the per-call confirmation dialog, for trusted local sessions, with a warning that escalates when the ngrok tunnel is enabled.
- An authenticated MCP verification endpoint and a Preferences "Test setup" button that probes the local server, and the public ngrok URL when the tunnel is connected, to confirm reachability and bearer-token acceptance.
- A simple unauthenticated MCP landing page served at the server root that a user can open in a browser (locally or over the public ngrok URL) to confirm the server is reachable, with its URL shown in the preferences modal.
- Preferences controls to stop and restart the running ngrok tunnel agent independently of the enable toggle.
- Per-OS-profile MCP server enabled/disabled, port number, authentication mode (bearer token or none), and auto-approve-writes preferences stored locally, with the randomly generated bearer token encrypted at rest by the operating system's secure storage rather than saved in plaintext.
- An OAuth 2.1 authorization flow on the MCP server (discovery metadata, dynamic client registration, a browser consent page, and a PKCE code exchange) so MCP clients that require OAuth — such as ChatGPT custom connectors — can connect; approving the consent page issues the existing bearer token as the access token.

#### Out of Scope

- Top-level document action buttons.
- A bundled AI model, hosted Nexus AI service, or included provider subscription; users supply access to a supported hosted provider or run a supported local endpoint.
- Automatic background AI processing of document content without an explicit user action.
- Cloud-synchronized AI chat history.
- MCP write tools that reach beyond the active document buffer (multi-window batched edits, file open/save through MCP, image or attachment write tools). In-buffer content edits — full replacement, ordered find/replace, section replacement, and scalar frontmatter changes — are in scope; filesystem-touching writes are not.
- Outbound MCP client behavior (Nexus calling other MCP servers).
- Direct remote network binding of the MCP server (the server still binds `127.0.0.1` only; remote reachability is available only through the optional, user-enabled ngrok tunnel, which forwards to the loopback port without binding a non-loopback address).
- A bundled ngrok library, account, or authtoken (the user installs the ngrok CLI and configures their own authtoken with it; Nexus does not bundle ngrok or provision ngrok accounts).
- Multi-user collaboration.
- Cloud sync.
- Web publishing transports other than SFTP and the QuickConnect HTTP push (no FTP, cloud object storage, or managed hosting providers in v1).
- Stored SFTP passwords, key passphrases, or remembered host keys (SFTP credentials are entered per publish and host keys are confirmed per publish in v1).
- A bundled QuickConnect receiving server (Nexus only sends the HTTP push; the server that accepts and serves the pages is provided separately).
- Full Git integration.
- Advanced presentation export formats beyond HTML and PDF.
- Microsoft Word (.docx) export (previously attempted in T_099–T_102 and removed in T_103 because the round-tripped HTML lost its body content during DOCX conversion; may be revisited later).
- Plugin marketplace or extension system.

### 2.5 Constraints & Assumptions

- The first version targets a native desktop shell using Electron, React, and MDXEditor.
- The app should work locally first and avoid remote services by default.
- Privacy is a default assumption: document content stays local unless the user takes an explicit action that sends it elsewhere. The publishing features are such actions: Publish as Web transmits content to an SFTP server only when the user configures and confirms a publish, and it never stores the credentials used to do so; Publish as HTML over QuickConnect transmits content to a user-configured HTTP endpoint and stores its bearer token encrypted at rest using the operating system's secure storage (Electron safeStorage), keeping the token out of the plaintext local settings while saving the non-secret URL and path locally. The optional MCP ngrok tunnel makes the enabled MCP server reachable from the public internet only while the user turns it on; it runs the user's installed ngrok CLI and relies on the authtoken configured in the ngrok CLI, so Nexus does not store an ngrok authtoken. The MCP server still binds loopback, and bearer-token authentication plus the write-confirmation dialog continue to apply — except that the user may opt into auto-approving writes, which is off by default and, when enabled, lets MCP write calls change the document without the per-call dialog; the settings dialog warns about this, and warns more strongly when it is combined with the ngrok tunnel. The MCP bearer token is itself a secret and is encrypted at rest with the operating system's secure storage (Electron safeStorage), like the QuickConnect token, rather than kept in plaintext local settings.
- Unused vendored framework dependencies should not remain in the app tree.
- The optional MCP ngrok tunnel depends on the externally-installed ngrok CLI rather than a bundled ngrok library, consistent with the preference for minimal bundled dependencies; users who do not enable the tunnel need not install ngrok.
- In-app AI is optional and sends only the user-requested prompt, selection, document content retrieved through tools, or import sources to the configured provider. Local editing, file operations, diagrams, and exports remain usable without an AI provider.
- Hosted-provider API keys are encrypted at rest using the operating system's secure storage. When secure storage is unavailable, Nexus shall not persist those keys in plaintext.
- Ollama, LM Studio, and OpenCode Serve allow AI requests to remain on a user-controlled endpoint; Nexus does not assume that every configured model supports vision input or tool calling. OpenCode agent tools operate in the directory served by OpenCode under its configured permission policy, not against the Nexus document-tool catalog.
- The project is early-stage, so the scaffold should favor clarity over architectural depth.

## 3. User Requirements

### 3.1 User Personas

- Technical writer: drafts structured documentation and wants visual formatting with Markdown portability.
- Business operator: prepares policies, notes, and reports and wants less friction than a code editor.
- Documentation maintainer: updates Markdown files and wants clear desktop-style file state while working.
- AI-assisted writer: wants help revising or understanding a document while retaining control over the provider, transmitted context, and proposed changes.

### 3.2 User Goals

- Create or edit a Markdown document quickly.
- Keep content readable while editing.
- Avoid extra document-management controls while drafting.
- Navigate quickly between sections of a long document.
- Revise selected text and ask questions about the current document without leaving the editor.
- Review AI-proposed changes before they alter the document.
- Convert PDFs and document images into editable Markdown at the intended insertion point.
- Publish a finished document to a personal web server, over SFTP or a simple HTTP endpoint, without leaving the editor.

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

- Given the MCP server is enabled and I turn on the ngrok tunnel with a valid authtoken
- When the tunnel connects
- Then the settings dialog shows a public URL I can give to a remote AI client, and that client reaches the same bearer-token-protected, write-confirmed MCP server

**Story 4**
> As a writer working on a long document,  
> I want an outline of the document's headings,  
> so that I can jump directly to a section without scrolling through the whole document.

#### Acceptance Criteria
- Given a document with headings  
- When I open the outline sidebar  
- Then I see the headings listed in document order and indented by heading level

- Given the outline sidebar is open  
- When I click a heading entry  
- Then the editor scrolls to that heading

**Story 5**
> As a writer with my own web server,  
> I want to publish my finished document as a single web page,  
> so that I can share a link without exporting a file and uploading it by hand.

#### Acceptance Criteria
- Given an open document  
- When I choose Publish as Web and enter my SFTP connection details  
- Then the system shows the server's host-key fingerprint and only continues after I accept it

- Given I have accepted the host key  
- When the upload completes  
- Then the self-contained HTML page exists on the server at the chosen remote path

- Given I have configured a public base URL  
- When the upload completes  
- Then the system shows the resulting page URL with a control to copy it

**Story 6**
> As a writer running my own lightweight publishing server,  
> I want to push my document to an HTTP endpoint with a saved token,  
> so that I can publish quickly without re-entering connection details each time.

#### Acceptance Criteria
- Given I have configured a QuickConnect URL, path, and bearer token  
- When I choose Publish as HTML over QuickConnect  
- Then the dialog is pre-filled with my saved URL, path, and token

- Given valid QuickConnect settings and a reachable server  
- When I publish  
- Then the system sends the rendered page to the endpoint and confirms success

- Given the server rejects the request or cannot be reached  
- When I publish  
- Then the system shows the HTTP status or error instead of appearing to succeed

**Story 7**
> As a writer revising a document,
> I want AI assistance to work on my selection or current document,
> so that I can draft and revise without copying content into another application.

#### Acceptance Criteria
- Given I have configured an AI provider and selected text in the editor
- When I choose an AI selection action
- Then the system shows the original and proposed replacement before changing the document

- Given the AI chat panel is open
- When I ask a question about the current document
- Then the assistant can read the document through document-scoped tools and stream its response in the panel

- Given the assistant proposes a document edit through a write tool
- When the write reaches the editor
- Then the existing write-confirmation boundary applies before the change is committed

**Story 8**
> As a writer receiving source material as a PDF or scanned images,
> I want to convert it into Markdown at my current insertion point,
> so that I can continue editing the content in Nexus.

#### Acceptance Criteria
- Given I have configured a suitable AI provider and placed the caret in the document
- When I import one PDF or multiple ordered images
- Then the system inserts one Markdown transcription at the captured caret in source order

- Given a PDF contains selectable text
- When the document is imported
- Then the system extracts that text locally and uses vision only for pages or content that require image understanding

- Given import is canceled or fails
- When the workflow ends
- Then the current document remains unchanged

### 3.4 Functional Requirements

- The system shall display a Markdown editor as the primary workspace.
- The system shall keep each editor window's current document content in that window's application state.
- The system shall start each application launch with a blank untitled document and no current file path.
- The system shall focus the editor automatically when a window starts with an empty untitled document.
- The system shall provide Electron app menu items for File/New Window, File/New, File/Open, File/Open Recent, File/Save, File/Save As, File/Export as HTML, File/Export as PDF, and File/Exit.
- The system shall provide an Electron File menu action that loads a built-in demo Markdown document showcasing supported editor and export features.
- The system shall record a document's file path in a recent-files list whenever the document is opened or saved.
- The system shall present the recent-files list, most-recent-first, as a File/Open Recent submenu, showing a disabled placeholder when the list is empty.
- The system shall limit the recent-files list to ten entries and remove duplicate paths.
- The system shall persist the recent-files list across application restarts.
- The system shall reopen a document selected from File/Open Recent using the same Save, Don't Save, or Cancel confirmation applied to File/Open before replacing unsaved changes.
- The system shall remove a recent-files entry that can no longer be opened and notify the user.
- The system shall provide a File/Open Recent Clear Recent command that empties the recent-files list.
- The system shall allow multiple editor windows to be open at the same time.
- The system shall route document menu actions to the currently focused editor window.
- The system shall open a blank untitled editor document when File/New Window is selected.
- The system shall accept Markdown/text file paths handed to the app by the operating system.
- The system shall open operating-system handed-off files in their own editor windows.
- The system shall support macOS Finder `open-file` events.
- The system shall support Windows Explorer/Open With file paths passed to the app process, including second-instance handoff while Nexus is already running.
- The system shall provide Electron app menu items for Edit/Undo, Edit/Redo, Edit/Find, Edit/Replace, Edit/Refresh, Edit/Cut, Edit/Copy, and Edit/Paste.
- The system shall open an in-editor find panel when Edit/Find is selected.
- The system shall open the in-editor find panel with its replace row expanded when Edit/Replace is selected.
- The system shall highlight matching text in the current rich-text editor content while a find query is active.
- The system shall allow moving to the next and previous find match from the find panel.
- The system shall scroll the active find match into view when a search starts or moves between matches.
- The system shall show the current match position and total match count in the find panel.
- The system shall let the user show or hide the find panel's replace row.
- The system shall replace the current match with the entered replacement text and advance to the next match.
- The system shall replace every match with the entered replacement text in a single action.
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
- The system shall treat Paper View as a continuous editing surface and Print Preview as the
  authoritative paginated representation.
- The system shall allow the user to turn responsive content wrapping on or off while using the plain rich-text editor view.
- The system shall store the selected plain-view responsive content wrapping preference locally using a key scoped to the current OS profile name.
- The system shall provide a collapsible outline sidebar that lists the current document's headings.
- The system shall display outline entries indented to reflect each heading's level from H1 through H6.
- The system shall update the outline entries when the document's headings change.
- The system shall scroll the editor to the corresponding heading when the user selects an outline entry in rich-text and source mode.
- The system shall highlight the outline entry for the section at the top of the editor viewport as the user scrolls, in rich-text and source mode.
- The system shall keep the highlighted outline entry visible within the outline list as it changes.
- The system shall allow the user to toggle the outline sidebar visibility from the editor toolbar.
- The system shall show the outline sidebar in rich-text and source editing modes and hide it in diff editing mode.
- The system shall provide a "Clean up formatting" command in the editor toolbar only while editing in source mode, and hide it in rich-text and diff modes.
- The system shall normalize the raw Markdown when the clean-up command runs — list markers and marker spacing, blank lines around ATX headings, GFM table column alignment, thematic breaks, blank-line runs, and trailing whitespace — without altering content inside fenced code blocks or a leading YAML frontmatter block, and without changing the document's meaning.
- The system shall show an empty-state message in the outline sidebar when the current document has no headings.
- The system shall store the outline sidebar visibility preference locally using a key scoped to the current OS profile name.
- The system shall allow the user to resize the outline sidebar width by dragging its right edge, clamped so it cannot crowd out the editor.
- The system shall store the outline sidebar width preference locally using a key scoped to the current OS profile name.
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
- The system shall provide File/Print Preview using the current unsaved Markdown and the same
  Chromium PDF renderer and page settings as PDF export.
- The system shall allow refreshing, saving, and closing the generated PDF snapshot without changing
  the Markdown document.
- The system shall export HTML and PDF using the selected base font size.
- The system shall export HTML and PDF using the selected paragraph spacing.
- The system shall export PDFs using the selected paper size.
- The system shall export PDFs using the selected paper orientation.
- The system shall export PDFs using the selected paper margins.
- The system shall generate PDFs from the rendered rich export HTML through a direct hidden-window print flow.
- The system shall ask Chromium to keep headings with following content, preserve paragraph/list
  widows and orphans, and avoid splitting common block content when it fits on one page.
- The system shall report a PDF export failure instead of writing a plain text PDF when direct rich PDF generation is unavailable.
- The system shall provide an Electron File/Publish as Web menu item placed near the export actions.
- The system shall render the current document to the same self-contained HTML output used by HTML export when publishing as web.
- The system shall open a publish dialog that collects the SFTP host, port, username, authentication method, remote directory, remote filename, and an optional public base URL.
- The system shall require the user to enter SFTP credentials on every publish.
- The system shall never store SFTP passwords, private-key passphrases, or private-key file contents in local storage, on disk, or in logs.
- The system shall allow the user to authenticate with either a password or a private key referenced by file path.
- The system shall request the private-key passphrase, when one is needed, on each publish without storing it.
- The system shall persist only non-secret connection fields (host, port, username, remote directory, and optional public base URL) per OS profile to pre-fill the publish dialog.
- The system shall display the SFTP server's host-key fingerprint in OpenSSH-style SHA256 form and require the user to accept it before sending any document data.
- The system shall abort the publish without uploading when the user rejects the host-key fingerprint.
- The system shall prompt for host-key acceptance on every publish and shall not remember previously accepted hosts in this version.
- The system shall default the remote filename to a slug derived from the document title or frontmatter and allow the user to edit it before publishing.
- The system shall upload the self-contained HTML page to the chosen remote directory and filename over SFTP.
- The system shall show the resulting page URL with a copy-to-clipboard control after a successful publish when a public base URL is configured.
- The system shall indicate that a successful SFTP upload does not by itself guarantee the file is served over HTTP.
- The system shall report publish failures, including connection, authentication, and upload errors, without changing the document.
- The system shall not change the current file path, saved baseline, or dirty state when publishing as web.
- The system shall provide an Electron File/Publish as HTML over QuickConnect menu item placed next to the SFTP publish item.
- The system shall render the current document to the same self-contained HTML output when publishing over QuickConnect.
- The system shall send the QuickConnect publish as an HTTP POST of the rendered HTML to a user-configured endpoint URL.
- The system shall include the user's bearer token in the QuickConnect request and a user-configured path in the request.
- The system shall open a QuickConnect publish dialog with fields for the endpoint URL, the path, and the bearer token.
- The system shall persist the QuickConnect URL and path per OS profile to pre-fill the dialog.
- The system shall store the QuickConnect bearer token encrypted at rest using the operating system's secure storage (Electron safeStorage) rather than in plaintext local settings, and shall not persist the token when secure storage is unavailable.
- The system shall treat a successful HTTP response as a completed publish and a non-success HTTP response as a publish failure that reports the status.
- The system shall show the resulting page URL with a copy control when the QuickConnect server returns one.
- The system shall bound the QuickConnect request with a network timeout so a hung request does not freeze publishing.
- The system shall not change the current file path, saved baseline, or dirty state when publishing over QuickConnect.
- The system shall support SFTP and the QuickConnect HTTP push as the only web publishing transports in this version.
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
- The system shall allow the user to enable and configure supported hosted and local AI providers independently and choose one enabled provider as the default.
- The system shall allow provider-specific endpoint, model, temperature, and output-token settings, including Azure deployment settings where required.
- The system shall discover agents and connected provider/model IDs from an `opencode serve` endpoint while retaining manually editable identifiers, and shall use OpenCode's configured sampling and agent settings rather than overriding them.
- The system shall provide a connection test for an AI provider before the user relies on it for document work.
- The system shall encrypt hosted-provider API keys at rest using the operating system's secure storage, scoped by OS profile and provider, and shall not include API keys in renderer-to-main-process AI request payloads.
- The system shall keep AI features optional and shall leave ordinary editing, file, diagram, export, and publishing workflows usable when no AI provider is configured.
- The system shall provide AI actions for improving, shortening, expanding, correcting, summarizing, changing the tone of, and translating the current non-empty editor selection.
- The system shall show the original selection and proposed Markdown replacement in a review dialog and shall change the document only when the user accepts the proposal.
- The system shall preserve the captured rich-text or source selection while an AI selection request runs so an accepted proposal replaces the intended text.
- The system shall provide a resizable AI chat panel scoped to the document in its editor window.
- The system shall save AI chat history locally for saved documents using opaque, profile-scoped user-data files; untitled documents shall remain session-only.
- The system shall allow the user to clear the active conversation and delete its saved history, and to delete all saved chat history for the current profile.
- The system shall stream AI chat responses and allow the user to stop an in-progress response.
- The system shall allow the current editor selection to be attached explicitly as context to the next AI chat message.
- The system shall expose the existing Nexus document read and write tool catalog to capable direct AI chat providers and shall pin every in-app chat tool call to that panel's document. For OpenCode Serve, OpenCode owns and executes tool calls in its served directory; Nexus shall display their activity without invoking similarly named Nexus tools.
- The system shall show AI chat tool-call status and results in the conversation.
- The system shall let a user reject, allow once, or always allow OpenCode permission requests, and shall abort with a clear error when OpenCode requests an unsupported interactive free-text answer.
- The system shall route AI chat write tools through the same confirmation and serialization boundary used by MCP writes.
- The system shall allow importing one PDF or multiple ordered images from the AI menu as Markdown inserted at the caret captured before the native file picker opened.
- The system shall extract selectable PDF text and embedded raster images locally, and shall send scanned PDF pages and standalone source images to the configured provider only when vision processing is required.
- The system shall preserve the selected source order during PDF/image import and shall leave the document unchanged when selection, extraction, provider processing, or insertion is canceled or fails.
- The system shall report when the active model does not support required image input instead of silently producing an incomplete import.
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
- The system shall store the MCP server enabled flag, port number, authentication mode, and auto-approve-writes preference locally using a key scoped to the current OS profile name.
- The system shall store the MCP bearer token encrypted at rest using the operating system's secure storage, scoped to the current OS profile, rather than in plaintext local storage, and shall migrate a previously plaintext-stored token into the encrypted store on first launch after upgrading.
- The system shall keep the MCP bearer token only in memory for the session when secure storage is unavailable, rather than writing it to disk in plaintext.
- The system shall bind the embedded MCP server to `127.0.0.1` only and refuse any non-loopback connection.
- The system shall reject MCP requests that do not include the configured bearer token in the `Authorization: Bearer` header while the authentication mode is set to bearer-token.
- The system shall accept MCP requests without any Authorization header while the authentication mode is set to none.
- The system shall expose a Streamable HTTP MCP transport at `/mcp` while the server is enabled.
- The system shall expose an authenticated `GET /health` verification endpoint while the server is enabled that applies the same loopback bind and bearer-token check as `/mcp` and returns basic server identity, rejecting a missing or invalid token with 401 and a non-GET method with 405.
- The system shall include an OAuth discovery challenge (`WWW-Authenticate` with the protected-resource metadata URL) on unauthorized MCP responses while the authentication mode is bearer-token.
- The system shall serve OAuth protected-resource and authorization-server discovery metadata, accept dynamic client registrations whose redirect URIs are https or loopback http, and persist registrations (no secrets) across launches, while the authentication mode is bearer-token.
- The system shall require explicit user approval on a browser consent page, showing the client name and redirect destination, before issuing any OAuth authorization code.
- The system shall require PKCE (S256) for the OAuth authorization-code flow, treat authorization codes as single-use and short-lived, and issue the configured bearer token as the access token on a successful exchange.
- The system shall report OAuth protocol errors to the client's registered redirect URI, except when the client or redirect URI itself cannot be validated, in which case the error shall be shown in place without redirecting.
- The system shall disable the OAuth endpoints while the authentication mode is none.
- The system shall provide a Preferences action that tests the MCP setup by probing the local verification endpoint, and the public ngrok URL when the tunnel is connected, and shall report a pass/fail result for each without requiring an external MCP client.
- The system shall serve a simple unauthenticated landing page at the MCP server root while the server is enabled so the server URL can be opened in a browser to confirm reachability, and shall show that page's local URL, and its public ngrok URL when the tunnel is connected, in the preferences modal.
- The system shall provide preferences controls to stop and restart the running ngrok tunnel agent, where restart tears down and re-establishes the tunnel and stop disconnects it, without changing the local MCP server.
- The system shall support MCP `initialize`, `tools/list`, and `tools/call` JSON-RPC methods through the embedded server.
- The system shall expose an MCP tool that lists open editor windows with stable identifiers, document titles, file paths, and dirty status.
- The system shall expose an MCP tool that returns the current Markdown, file path, and dirty status for the focused editor window or for a specified window identifier.
- The system shall expose a read-only MCP tool that returns the heading outline (level, text, slug, ordinal index, and source line) of the focused editor window or a specified window identifier.
- The system shall expose a read-only MCP tool that returns the Markdown of a single document section identified by heading index, slug, or text for the focused editor window or a specified window identifier.
- The system shall expose a read-only MCP tool that searches the document of the focused editor window or a specified window identifier and returns match positions, supporting literal or regular-expression queries and a capped result count.
- The system shall expose a read-only MCP tool that finds text in the focused editor window or a specified window identifier and returns matches grouped by line, each with a configurable amount of surrounding context and the heading the line falls under, supporting literal or regular-expression queries and a capped result count.
- The system shall expose a read-only MCP tool that returns the user's current editor text selection and editor mode for the focused editor window or a specified window identifier.
- The system shall expose an MCP tool that replaces the current Markdown contents of the focused editor window or a specified window identifier with caller-supplied Markdown.
- The system shall expose an MCP tool that applies an ordered list of find/replace edits (literal or regular-expression, optionally replacing all matches) to the focused editor window or a specified window identifier, and shall fail the whole edit without changing the document when an anchor is not found or is ambiguous.
- The system shall expose an MCP tool that replaces a whole document section identified by heading index, slug, or text in the focused editor window or a specified window identifier.
- The system shall expose an MCP tool that sets, merges, or removes scalar YAML frontmatter fields in the focused editor window or a specified window identifier, and shall leave non-scalar frontmatter unchanged.
- The system shall compute each granular MCP write as a proposed full buffer and route it through the same write-confirmation gate as the full replacement tool.
- The system shall display a shadcn-styled MCP write confirmation dialog in the target editor window whenever an MCP client calls a write tool, showing a Markdown diff between the current buffer and the proposed replacement, unless the auto-approve-writes preference is enabled.
- The system shall apply an MCP write only after the user clicks Approve in the confirmation dialog for that specific tool call, except when the auto-approve-writes preference is enabled, in which case the write applies immediately without a dialog.
- The system shall provide an off-by-default per-OS-profile auto-approve-writes preference in the MCP server settings, and shall display a warning when it is enabled that escalates while the ngrok tunnel is on.
- The system shall return an explicit rejection result to the MCP client when the user clicks Reject in the confirmation dialog or closes it.
- The system shall return an explicit rejection result to the MCP client when no editor window can host the confirmation dialog.
- The system shall stop accepting MCP connections immediately when the user disables the MCP server.
- The system shall close listening sockets on application quit so that ports are released for the next launch.
- The system shall provide an optional ngrok tunnel toggle in the MCP server section of the settings dialog, off by default and meaningful only while the MCP server is enabled.
- The system shall start the ngrok tunnel by running the user's installed ngrok CLI as a background process when the MCP server is enabled and the ngrok toggle is on.
- The system shall rely on the ngrok CLI's own configuration for the authtoken and shall not store an ngrok authtoken in Nexus settings.
- The system shall report a clear message in the settings dialog when the ngrok CLI is not installed or no authtoken is configured, and shall leave the local MCP server running.
- The system shall allow the user to point the tunnel at an explicit ngrok executable path via a settings checkbox and path field, and shall otherwise resolve the ngrok CLI from PATH.
- The system shall provide an optional ngrok custom-domain field, stored per OS profile, that binds the tunnel to a reserved or custom domain when set.
- The system shall fall back to a random ngrok URL and indicate the fallback when a configured custom domain cannot be bound.
- The system shall forward the ngrok tunnel to the loopback MCP port without binding a non-loopback address on the user's machine.
- The system shall display the public ngrok URL and the full public MCP endpoint URL (the public URL plus the `/mcp` path) with copy controls in the settings dialog while the tunnel is connected.
- The system shall stop the ngrok tunnel when the MCP server is disabled, when the ngrok toggle is turned off, and when the application quits.
- The system shall re-point the ngrok tunnel to the new port when the MCP port changes while the tunnel is on.
- The system shall continue to require the configured MCP authentication and the write-confirmation dialog for requests that arrive over the ngrok tunnel.
- The system shall display a prominent warning when the ngrok tunnel is enabled while the MCP authentication mode is none, and shall still allow the tunnel.
- The system shall report ngrok tunnel start failures in the settings dialog and shall keep the local MCP server running when the tunnel fails to start.

#### 3.4.x Specialized Logic or Modes (Optional)

- Visual editing mode: primary editing mode using MDXEditor.
- Source editing mode: MDXEditor-provided source mode accessed through the editor toolbar.
- Clean up formatting: a source-mode-only toolbar command that prettifies the raw Markdown in place. It normalizes unordered list markers to `-` and collapses marker spacing (ordered numbers are preserved), guarantees one blank line above and below ATX headings, re-pads GFM tables to align columns and reflect each column's alignment, normalizes thematic breaks to `---`, collapses runs of blank lines to one, and trims trailing whitespace (keeping a two-space hard break). Fenced code blocks and a leading YAML frontmatter block pass through untouched, the pass is idempotent, and it never reinterprets non-heading text (for example `##Section` with no space) as a heading. It edits the CodeMirror source buffer directly so the cleaned text is exactly what the command produced rather than MDXEditor's serializer conventions.
- Toolbar controls: expose MDXEditor's broad toolbar command set through a project-owned white shadcn-styled grouped toolbar, excluding undo/redo, refresh, and zoom because those actions live in native menus, and including text formatting, lists, block type, links, local/remote/base64 image imports, relative local image previews, tables, thematic breaks, code blocks, Mermaid diagrams, embedded OpenAPI specifications, local JavaScript runner blocks, admonitions, frontmatter, paper/plain view, paper orientation, plain-view responsive wrapping, and source/diff toggles where supported by enabled plugins.
- PDF/image document import: the AI menu accepts one PDF or multiple ordered image files, extracts
  selectable PDF text and embedded raster pictures locally, sends scanned pages and standalone images
  as vision inputs, and inserts one Markdown transcription at the caret captured before the picker
  opened. Standalone images are retained beside their descriptions; scanned-page illustrations use
  model-located, locally rendered cutouts rather than full-page images. Ordinary raster cutouts can be
  refined with draggable crop edges, while embedded diagram editors remain unchanged. Cancellation
  and any extraction/provider error are non-destructive.
- Mathematics: fenced `math` blocks render standalone/display equations, while inline code spans
  prefixed with `math:` render formulas within prose without interrupting sentence flow. AI document
  import chooses between the two forms based on the formula's source context.
- AI selection actions: the AI menu operates on the last non-empty editor selection in rich-text or source mode, sends the selected Markdown to the configured provider with the chosen rewrite instruction, and displays the original and proposed text side by side. The editor changes only when the user accepts the proposal; dismissal and provider errors are non-destructive.
- AI chat: a resizable side panel streams a conversation with the configured provider, optionally attaches the editor selection to the next user turn, and gives tool-capable models the Nexus document tools for the panel's current document. Read tools provide document context on demand; write tools retain the existing per-call review boundary. Saved documents retain their chat transcript and agent conversation in local, opaque user-data files; untitled documents remain session-only. Clear Conversation deletes the active file, while AI Provider settings can delete all saved chats for the OS profile.
- Diff review mode: use MDXEditor's diff mode to compare the current editor buffer against a renderer-supplied baseline, with the diff side read-only and the editor background kept white like the other editing modes.
- Mermaid diagrams: render standard fenced `mermaid` code blocks as non-editable diagrams in rich text mode, while source and diff modes keep the raw Mermaid fence editable as Markdown text.
- OpenAPI blocks: match only YAML fences carrying the `openapi` metadata token, show an expandable
  Swagger-style API reference in rich-text mode, and keep the normalized YAML source portable in
  source mode. HTML and PDF exports render an expanded, non-interactive version of that reference;
  ordinary YAML and malformed OpenAPI fences remain code blocks. The reference is read-only and
  offline: it groups operations by
  tag and presents method/path summaries, parameters, request bodies, responses, servers, security,
  and resolved local schema details without issuing API requests. Invalid specifications cannot be
  committed by the visual editor. The visual route editor creates OpenAPI 3 `requestBody` objects
  rather than obsolete Swagger 2 `in: body` parameters. Its payload-format selector explains JSON,
  URL-encoded fields, multipart forms with binary file fields, plain text, XML, and custom types.
- Local JavaScript runner blocks: support portable fenced code blocks using `js nexus-run` or `javascript nexus-run`, run them locally in a sandboxed browser worker, show console output/errors in the editor, and block network or nested worker APIs.
- Toolbar placement: keep the MDXEditor rich-text toolbar sticky at the top of the editor frame with a subtle gray bottom border matching the toolbar group borders, and float the right-side view controls over source and diff modes so those modes can use the full editor height.
- View switching: preserve the user's approximate scroll position when switching between rich text and source editor views.
- List editing: pressing Enter on an empty bullet, numbered, or checklist item exits the list and creates a normal paragraph.
- Paper view: rich-text editing can constrain the document body to the selected paper width with user-adjustable margins on a white editor background so element sizing better matches PDF output. This mode does not provide true Word-style pagination.
- Plain view: rich-text editing can hide the page sheet, shadow, fixed page width, fixed height, and page margins so the user can focus on text flow while keeping export settings unchanged; the user can toggle whether plain view wraps to the full application width or to a centered readable column without adding page-level horizontal scrolling.
- Publish as Web: a File menu action renders the current document to the same self-contained HTML output as HTML export (inline images, fonts, and diagrams) and uploads that single file to a user-specified SFTP server. The publish dialog collects the host, port, username, authentication method (password or private-key file), remote directory, remote filename, and an optional public base URL; only the non-secret fields are stored per OS profile to pre-fill future publishes. Credentials are entered every publish and never stored. Before any document data is sent, the user must review and accept the server's host-key fingerprint (OpenSSH-style SHA256 form); rejecting cancels the publish. The remote filename defaults to a slug derived from the document title or frontmatter and is editable. After a successful upload, the dialog shows the resulting page URL with a copy control when a public base URL is configured, and notes that SFTP upload alone does not guarantee HTTP serving. Publishing does not change the document's file path, saved baseline, or dirty state.
- Publish as Web over QuickConnect: a second File menu action renders the same self-contained HTML and sends it as an HTTP POST to a user-configured endpoint URL, with the rendered HTML as the request body, a bearer token for authorization, and a user-configured path conveyed in the request. The QuickConnect dialog collects the URL, path, and bearer token; the URL and path are saved per OS profile to pre-fill future publishes, and the bearer token is stored encrypted at rest using the operating system's secure storage (Electron safeStorage) rather than in plaintext local settings (when secure storage is unavailable the token is entered per publish and not saved). A successful HTTP response confirms the publish; the dialog shows a returned page URL with a copy control when the server provides one, and reports the HTTP status when the request is rejected. A network timeout bounds the request. QuickConnect is intended for a simple self-hostable server that accepts these pushes and serves the pages. SFTP and QuickConnect are the only publishing transports in this version.
- Outline sidebar: an optional, collapsible panel beside the rich-text editor lists the current document's headings as a depth-indented, clickable tree. Selecting an entry scrolls the rich-text editor to that heading. The outline tracks heading changes, shows an empty-state message when no headings exist, is hidden in source and diff modes so those modes keep the full editor area, and its open/closed state is stored per OS profile. v1 renders headings as an indented list by level and does not provide per-node expand/collapse or active-section tracking.
- App theme: the settings dialog lets the user choose a Light, Dark, or System app theme. The selected theme is stored per OS profile, System tracks the desktop color-scheme setting, dark mode uses a restrained neutral palette with visible editor carets and toolbar icons, and document export output remains light for predictable PDF/HTML results.
- Editable page background: rich-text, source, diff, and plain-view editor backgrounds match the toolbar background color for visual continuity.
- Export: HTML and PDF exports render from the current Markdown buffer, resolve relative local images, render supported admonition directives as styled callout blocks, omit leading YAML frontmatter from PDF output, use the selected editor font, base font size, and paragraph spacing for rendered output, use the selected paper size, orientation, and margins for PDF page setup, print PDFs through the direct hidden-window rich export path, report failure instead of silently downgrading any export, and use native save dialogs without changing the active document. HTML export is self-contained for supported local images, Mermaid diagrams, and bundled web font assets by writing them as base64 data URLs.
- The app shall not provide a separate custom visual/source tab bar.
- MCP server: a local HTTP-based Model Context Protocol server runs inside the Electron main process while enabled. Transport is Streamable HTTP at `http://127.0.0.1:{port}/mcp` with a single POST endpoint that accepts JSON-RPC requests and returns JSON-RPC responses. Authentication mode is either a static bearer token shown in the preferences modal (default) or no authentication (opt-in, intended for trusted single-user environments). In bearer mode, clients can send the token directly or obtain it through an OAuth 2.1 flow (discovery metadata, dynamic client registration, a browser consent page the user must approve, and a PKCE S256 code exchange) — used by clients that require the MCP authorization spec, such as ChatGPT custom connectors; the access token issued is the same bearer token, so regenerating the token revokes all clients at once, and the OAuth endpoints are disabled in no-auth mode. In either mode, the listener stays bound to `127.0.0.1` and, unless the user enables auto-approve, the write confirmation dialog still gates every write call. The tool surface stays focused: the read tools are list windows, read document, read outline, read section, search document, find (matches with surrounding context and the enclosing heading), and read selection; the write tools are replace document plus the in-buffer edits apply edits (ordered find/replace), replace section (by heading), and set frontmatter (scalar fields). Most read tools execute immediately against the latest cached document state held in the main process (no renderer round trip); the read-selection tool round-trips to the target renderer to capture the live selection. Each write tool computes a proposed full buffer from the cached document — failing without a dialog when an edit's anchor or section cannot be located — and routes the proposal through the target renderer's confirmation dialog (or applies it immediately when auto-approve is enabled), resolving with the outcome before responding to the MCP client. The server is intended for local AI assistants on the same machine. Remote reachability is opt-in only through the ngrok tunnel below.
- MCP ngrok tunnel: an optional, off-by-default tunnel that exposes the enabled MCP server to remote AI clients through a public ngrok URL by running the user's installed ngrok CLI as a background process. The authtoken is not stored in Nexus; the user configures it once with the ngrok CLI (`ngrok config add-authtoken <token>`) and Nexus relies on the ngrok CLI's own configuration. The user may optionally supply a reserved or custom ngrok domain; when a domain is set it is used, and when it cannot be bound the tunnel falls back to a random URL and reports that the domain was not used. The user may also point the tunnel at an explicit ngrok executable path (via a checkbox and path field) for non-standard install locations; with the checkbox off, or on but empty, the ngrok CLI is resolved from PATH. When the ngrok CLI is missing or no authtoken is configured, the settings dialog shows a clear message and the local MCP server keeps running. When the MCP server is enabled and the tunnel is turned on, Nexus runs the ngrok CLI to forward to the loopback MCP port; the ngrok agent connects outbound to ngrok's service, so no inbound port is opened and the MCP server keeps binding `127.0.0.1`. The settings dialog shows the public URL and the public `/mcp` endpoint URL with copy controls while connected. Bearer-token authentication and the write-confirmation dialog still apply over the tunnel. Enabling the tunnel while the authentication mode is none shows a prominent warning but is allowed. The tunnel stops when the MCP server is disabled, the toggle is turned off, or the app quits, and re-points when the MCP port changes. Tunnel start failures are reported and leave the local server running.

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
4. Edit visually, or switch to source mode through the editor toolbar; in source mode, use the Clean up formatting command to normalize the raw Markdown in place.
5. Use File/New Window to open another blank editor window when working with multiple documents.
6. Use Edit/Find to locate text in the current document, or Edit/Replace to find and swap text using the panel's replace row.
7. Use View/Zoom In, View/Zoom Out, or View/Reset Zoom to adjust the editor display while the View menu shows the current zoom percentage.
8. Open Markdown/text files from Finder or Explorer to launch them in Nexus editor windows.
9. Use the Electron File menu to create, open, save, save a copy, or exit the application, and reopen a recent document from File/Open Recent.
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
23. Optionally configure a hosted or local model from AI/AI Providers, test the connection, and choose the default provider.
24. Select text and choose an AI rewrite action, then compare the original and proposed Markdown before accepting or discarding the replacement.
25. Open the AI chat panel to ask about the current document, optionally attach the current selection, and review any write proposed through a document tool.
26. Use AI/Import PDF or Images to transcribe one PDF or multiple ordered images into Markdown at the current caret.
27. Optionally enable the MCP server from Settings/Preferences, copy the displayed connection URL and bearer token into Claude Desktop or ChatGPT, and review each proposed write through the in-app confirmation diff before applying it.
28. Optionally turn on the ngrok tunnel in the MCP server settings and copy the displayed public MCP endpoint URL into a remote AI client to reach the same authenticated, write-confirmed server.
29. Use the editor toolbar outline toggle to show a sidebar of the document's headings, click a heading to jump to that section in rich-text or source mode, and follow the highlighted entry that tracks the section currently at the top of the editor as you scroll.
30. Use File/Publish as Web to render the current document as a self-contained web page, enter SFTP connection details, accept the server's host-key fingerprint, and upload the page; copy the resulting URL when a public base URL is configured.
31. Use File/Publish as HTML over QuickConnect to send the same self-contained web page to a configured HTTP endpoint with a saved URL, path, and bearer token; copy the resulting URL when the server returns one.

## 5. UI / Design Notes (Optional)

- Use an edge-to-edge desktop app shell focused on the editor workspace.
- Do not show top-level New, Open, Save, or Save As buttons in the current version.
- Keep document actions in the native Electron app menu.
- Keep document actions scoped to the focused editor window so multiple open documents remain independent.
- Keep HTML export and PDF export actions in the native File menu near Save actions.
- Keep the Publish as Web action in the native File menu near the export actions, and use a compact shadcn-styled dialog for connection details, host-key confirmation, and the published URL result.
- Keep the Publish as HTML over QuickConnect action next to the SFTP publish action, and use a compact shadcn-styled dialog with just the URL, path, and bearer token plus the published URL result.
- Keep the ngrok tunnel controls inside the existing MCP server section of the settings dialog, with the toggle, authtoken field, connected public URL and public MCP endpoint URL, and the no-authentication exposure warning grouped with the other MCP settings.
- Keep the built-in demo document action in the native File menu near Open, because it replaces the current editor buffer rather than editing content in place.
- Keep undo and redo actions in the native Electron Edit menu rather than duplicating them in the editor toolbar.
- Keep manual Refresh available from the native Edit menu.
- Keep common text editing actions available from the native editor right-click menu without adding another top-level toolbar.
- Keep spelling corrections in the same editor right-click menu as common text editing actions.
- Keep editor appearance settings in a compact shadcn-styled dialog opened from the native Settings menu.
- Keep AI provider setup in a dedicated dialog opened from the native AI menu, with explicit provider enablement, default-provider selection, model settings, secret-key handling, and connection status.
- Keep AI selection actions in the native AI menu and require a compact original-versus-proposed review dialog before replacement.
- Keep the AI chat in a resizable side panel beside the document, showing streamed responses and expandable tool activity without obscuring the editor.
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
- Keep the outline sidebar as a compact shadcn-styled panel beside the editor that follows the light/dark theme, can be toggled from the editor toolbar, and does not introduce a new top-level document action bar.

## 6. Edge Cases

- Empty documents should be editable.
- Spellcheck suggestions may be unavailable when the operating system or Electron dictionary does not provide suggestions for the current word; Cut, Copy, and Paste should remain available.
- Initial empty untitled documents should place the caret in the editor once startup confirms no file is being opened.
- Browser storage can be unavailable or full; the app should continue editing in memory.
- Markdown syntax unsupported by the visual editor should remain accessible through source mode.
- Clean up formatting should be offered only in source mode and should be a no-op (no buffer change, no dirty flag) when the Markdown is already normalized.
- Clean up formatting should leave fenced code blocks and a leading YAML frontmatter block byte-for-byte unchanged, and should not turn a non-heading line (for example `##Section` with no following space) into a heading.
- Clean up formatting should run more than once without further changing an already-cleaned document (idempotent).
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
- An MCP apply-edits call whose anchor text is not found, or appears more than once without an all flag, should fail the whole edit with a clear error and leave the document unchanged, with no confirmation dialog shown.
- An MCP replace-section call whose heading index, slug, or text matches no section should fail with a clear error and leave the document unchanged.
- An MCP set-frontmatter call against a document whose existing frontmatter is not simple scalar key/value pairs should leave the frontmatter unchanged and report that it was not editable.
- While auto-approve-writes is enabled, MCP write calls should apply immediately and still update the visible document, and the same per-window serialization should prevent overlapping writes.
- MCP write tool calls that arrive while a confirmation dialog is already open in the target window should queue or be rejected with a busy error rather than overlapping multiple dialogs.
- Closing the only editor window while a confirmation dialog is open should reject the pending MCP write rather than leaving the client waiting indefinitely.
- Disabling the MCP server while a tool call is in flight should close the connection and resolve the pending call with a rejection.
- An MCP request without a bearer token, with the wrong token, or with the wrong content type should receive an explicit 401/400 response instead of being silently dropped while the authentication mode is bearer-token.
- An OAuth authorization request with an unknown client or unregistered redirect URI should show an in-place error page and never redirect to the unvalidated URI.
- An OAuth authorization request without PKCE, or a token exchange with the wrong verifier, a replayed code, or an expired code, should be rejected with a standard OAuth error.
- Denying the OAuth consent page should redirect to the client with access_denied and not issue a token.
- Restarting the app should preserve OAuth client registrations but cancel any in-flight consent pages and unexchanged authorization codes.
- Regenerating the bearer token should invalidate access previously issued through OAuth, requiring clients to re-authorize.
- An MCP request that arrives while the authentication mode is none should be processed without checking the Authorization header, but the write confirmation dialog should still apply.
- A missing ngrok CLI (not installed or not on PATH) should fail the tunnel start with a clear install message and leave the local MCP server running. On macOS, where a desktop-launched app does not inherit the shell PATH, the system shall also look in the common Homebrew locations before reporting the CLI as missing.
- A missing or invalid ngrok authtoken in the ngrok CLI configuration should fail the tunnel start with a message pointing to `ngrok config add-authtoken`, and leave the local MCP server running.
- A configured ngrok custom domain that is unavailable should fall back to a random URL with a clear notice rather than failing the tunnel.
- An ngrok background process that exits unexpectedly should be reflected as a disconnected tunnel without affecting the local MCP server.
- Turning off the MCP server while the ngrok tunnel is connected should stop the tunnel.
- Changing the MCP port while the ngrok tunnel is connected should re-point the tunnel to the new port.
- Enabling the ngrok tunnel while the MCP authentication mode is none should show a prominent public-exposure warning but still connect.
- Quitting the application while the ngrok tunnel is connected should close the tunnel so it does not linger after exit.
- Documents with no headings should show a clear empty-state message in the outline sidebar instead of an empty panel.
- The outline sidebar should hide while editing in source or diff mode and reappear when returning to rich-text mode if it was open.
- Settings storage can be unavailable or invalid; the app should keep the outline sidebar hidden by default.
- Documents with repeated heading text should still scroll to the specific heading occurrence selected in the outline.
- A publish that cannot reach or connect to the SFTP server should report the failure clearly and leave the document unchanged.
- A publish with an incorrect password, passphrase, or private key should report an authentication failure without storing the entered secret.
- Rejecting the host-key fingerprint should cancel the publish before any document data is sent.
- Publishing to a missing or non-writable remote directory should report the error rather than appear to succeed.
- Publishing an untitled document should still produce a valid remote filename, derived or entered by the user, before uploading.
- A network interruption during upload should report the failure and should not change the document's file path, saved baseline, or dirty state.
- A successful SFTP upload should not imply the page is reachable over HTTP unless the user's server is configured to serve that directory.
- A QuickConnect publish to an unreachable or slow endpoint should fail on the network timeout rather than freezing the editor.
- A QuickConnect publish that receives a non-success HTTP response (for example, 401 for a bad token, 404 for a wrong URL, or a 5xx server error) should report that status to the user.
- A QuickConnect publish with an empty URL or empty path should be reported as invalid before any request is sent.
- Publishing an untitled document over QuickConnect should still require or derive a path.
- A large document with embedded images should still publish over QuickConnect within the request timeout, or fail clearly if it does not.
- When the operating system's secure storage is unavailable, the QuickConnect bearer token should be entered per publish and not persisted, rather than being written to disk in plaintext.
- A QuickConnect bearer token saved in plaintext by an earlier version should be migrated into the encrypted store on first launch and removed from the plaintext local settings.
- AI actions should report that no provider is configured and offer a direct path to provider setup without changing the document.
- A hosted AI provider request with a missing or invalid API key, unreachable endpoint, unsupported model option, timeout, or provider error should report the failure without changing the document.
- When operating-system secure storage is unavailable, hosted-provider API keys should not be written to disk in plaintext.
- AI selection actions should be unavailable or report a clear instruction when the editor has no non-empty selection.
- Rejecting or closing an AI selection preview should leave the original selection unchanged.
- An AI selection result should replace the selection captured when the action began, even if opening the AI menu or preview moved focus away from the editor.
- Stopping a streaming AI chat response should retain already displayed partial text, stop further tool steps, and leave the document unchanged unless a previously confirmed write already completed.
- AI chat providers that do not support tool calling should remain usable for ordinary conversation but shall not be treated as having inspected or changed the document through tools.
- PDF/image import should report when the configured model lacks image-input support and should not insert a partial transcription.
- PDF/image import cancellation, extraction failure, provider failure, or a lost insertion target should leave the document unchanged.

## 7. Future Iterations / Open Questions

- Add accept/reject controls for individual changed blocks.
- Add top-level document action buttons only if the app later needs visible duplicates of the native File menu.
- Add Git-backed diffs when a document belongs to a repository.
- Add export targets for PDF, DOCX, or slide decks.
- Add true paginated page breaks if print-layout editing becomes a core workflow.
- Expand the MCP write tool surface with partial patch / find-replace tools, save and save-as tools, and image/attachment-aware tools, now that the read tools cover outline, section, search, and selection in addition to list-windows and read-document.
- Add an MCP audit log or activity panel so users can see recent tool calls and decisions.
- Add stdio MCP transport via a separate launcher binary for clients (such as current Claude Desktop) that do not yet support HTTP/Streamable transport directly.
- Remember and reuse a stable ngrok domain, and offer optional encrypted storage for the ngrok authtoken instead of plaintext local settings.
- Add an MCP tunnel activity indicator or log so users can see when the server is publicly reachable and by which URL.
- Add per-node expand/collapse and drag-to-reorder for outline headings.
- Optionally remember accepted SFTP host keys (known-hosts style) so the fingerprint prompt only appears on first connect or when the key changes.
- Optionally store non-secret publish targets as named profiles, and integrate OS keychain storage for credentials if users ask for saved logins.
- Add additional publishing transports (for example, cloud object storage or managed hosting) beyond SFTP and QuickConnect.
- Provide a reference QuickConnect receiving server and an in-app setup flow for adding documents to it.

## 8. Notes for LLM-Assisted Development (Optional)

- Favor direct React components and local state until the workflow proves it needs more structure.
- Keep document content state explicit.
- Do not add remote AI behavior without a clear privacy boundary.
- Prefer small tasks that leave the app buildable after each step.
