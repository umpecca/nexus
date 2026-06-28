import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../ui/dialog";
import type {
  EditorFontFamily,
  EditorPageMargins,
  EditorPageMarginSide,
  EditorPageOrientation,
  EditorPageSize,
  EditorThemePreference,
  McpAuthMode,
  McpServerSettings
} from "../../lib/settings";
import type { McpConnectionProbe, McpConnectionTestResult, McpNgrokStatus } from "../../electron";
import {
  EDITOR_FONT_OPTIONS,
  EDITOR_FONT_SIZE_MAX_PIXELS,
  EDITOR_FONT_SIZE_MIN_PIXELS,
  EDITOR_FONT_SIZE_STEP_PIXELS,
  EDITOR_PAGE_MARGIN_MAX_INCHES,
  EDITOR_PAGE_MARGIN_MIN_INCHES,
  EDITOR_PAGE_MARGIN_SIDES,
  EDITOR_PAGE_MARGIN_STEP_INCHES,
  EDITOR_PAGE_ORIENTATION_OPTIONS,
  EDITOR_PAGE_SIZE_OPTIONS,
  EDITOR_PARAGRAPH_SPACING_MAX_PIXELS,
  EDITOR_PARAGRAPH_SPACING_MIN_PIXELS,
  EDITOR_PARAGRAPH_SPACING_STEP_PIXELS,
  EDITOR_THEME_OPTIONS,
  MCP_AUTH_MODE_OPTIONS,
  MCP_SERVER_DEFAULT_HOST,
  MCP_SERVER_MAX_PORT,
  MCP_SERVER_MIN_PORT,
  generateMcpBearerToken,
  sanitizeMcpServerPort
} from "../../lib/settings";

type SettingsDialogProps = {
  fontFamily: EditorFontFamily;
  fontSizePixels: number;
  mcpServer: McpServerSettings;
  mcpNgrokStatus: McpNgrokStatus | null;
  onTestMcpConnection: () => Promise<McpConnectionTestResult | undefined>;
  onStopNgrok: () => Promise<void>;
  onRestartNgrok: () => Promise<void>;
  onFontFamilyChange: (fontFamily: EditorFontFamily) => void;
  onFontSizePixelsChange: (fontSizePixels: number) => void;
  onMcpServerChange: (next: McpServerSettings) => void;
  onPageMarginsChange: (pageMargins: EditorPageMargins) => void;
  onPageOrientationChange: (pageOrientation: EditorPageOrientation) => void;
  onPageSizeChange: (pageSize: EditorPageSize) => void;
  onParagraphSpacingPixelsChange: (paragraphSpacingPixels: number) => void;
  onResetSettings: () => void;
  onThemePreferenceChange: (themePreference: EditorThemePreference) => void;
  onDiagramsAsFilesChange: (diagramsAsFiles: boolean) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pageMargins: EditorPageMargins;
  pageOrientation: EditorPageOrientation;
  pageSize: EditorPageSize;
  paragraphSpacingPixels: number;
  profileName: string;
  themePreference: EditorThemePreference;
  diagramsAsFiles: boolean;
};

function clampFontSize(value: number) {
  return Math.min(EDITOR_FONT_SIZE_MAX_PIXELS, Math.max(EDITOR_FONT_SIZE_MIN_PIXELS, value));
}

function clampMargin(value: number) {
  return Math.min(EDITOR_PAGE_MARGIN_MAX_INCHES, Math.max(EDITOR_PAGE_MARGIN_MIN_INCHES, value));
}

function clampParagraphSpacing(value: number) {
  return Math.min(
    EDITOR_PARAGRAPH_SPACING_MAX_PIXELS,
    Math.max(EDITOR_PARAGRAPH_SPACING_MIN_PIXELS, value)
  );
}

function formatNumber(value: number) {
  return String(value);
}

function describeProbe(probe: McpConnectionProbe) {
  if (probe.ok) {
    return `Reachable${probe.status ? ` · HTTP ${probe.status}` : ""}`;
  }
  if (probe.status === 401) {
    return "Unauthorized — token rejected (HTTP 401)";
  }
  if (probe.status) {
    return `Failed — HTTP ${probe.status}`;
  }
  if (probe.error === "not-running") {
    return "Server not running";
  }
  if (probe.error === "timeout") {
    return "Timed out";
  }
  return `Failed — ${probe.error ?? "error"}`;
}

function SettingsDialog({
  fontFamily,
  fontSizePixels,
  mcpServer,
  mcpNgrokStatus,
  onTestMcpConnection,
  onStopNgrok,
  onRestartNgrok,
  onFontFamilyChange,
  onFontSizePixelsChange,
  onMcpServerChange,
  onPageMarginsChange,
  onPageOrientationChange,
  onPageSizeChange,
  onParagraphSpacingPixelsChange,
  onResetSettings,
  onThemePreferenceChange,
  onDiagramsAsFilesChange,
  onOpenChange,
  open,
  pageMargins,
  pageOrientation,
  pageSize,
  paragraphSpacingPixels,
  profileName,
  themePreference,
  diagramsAsFiles
}: SettingsDialogProps) {
  const [mcpTesting, setMcpTesting] = useState(false);
  const [mcpTestResult, setMcpTestResult] = useState<McpConnectionTestResult | null>(null);

  // Drop a stale result when the dialog closes or the MCP server settings that affect reachability
  // change, so the readout never describes a configuration the user has since edited.
  useEffect(() => {
    setMcpTestResult(null);
  }, [
    open,
    mcpServer.enabled,
    mcpServer.port,
    mcpServer.authMode,
    mcpServer.bearerToken,
    mcpServer.ngrokEnabled
  ]);

  const [ngrokBusy, setNgrokBusy] = useState(false);

  async function handleTestMcpConnection() {
    setMcpTesting(true);
    try {
      const result = await onTestMcpConnection();
      setMcpTestResult(result ?? { local: { ok: false, error: "unavailable" }, ngrok: null });
    } catch {
      setMcpTestResult({ local: { ok: false, error: "failed" }, ngrok: null });
    } finally {
      setMcpTesting(false);
    }
  }

  async function handleStopNgrok() {
    setNgrokBusy(true);
    try {
      await onStopNgrok();
    } finally {
      setNgrokBusy(false);
    }
  }

  async function handleRestartNgrok() {
    setNgrokBusy(true);
    try {
      await onRestartNgrok();
    } finally {
      setNgrokBusy(false);
    }
  }

  function handleMcpEnabledChange(nextEnabled: boolean) {
    const needsToken =
      nextEnabled && mcpServer.authMode === "bearer" && mcpServer.bearerToken === "";

    onMcpServerChange({
      ...mcpServer,
      enabled: nextEnabled,
      bearerToken: needsToken ? generateMcpBearerToken() : mcpServer.bearerToken
    });
  }

  function handleMcpPortChange(value: string) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      return;
    }

    onMcpServerChange({
      ...mcpServer,
      port: sanitizeMcpServerPort(parsed)
    });
  }

  function handleMcpAuthModeChange(nextMode: McpAuthMode) {
    const needsToken =
      nextMode === "bearer" && mcpServer.enabled && mcpServer.bearerToken === "";

    onMcpServerChange({
      ...mcpServer,
      authMode: nextMode,
      bearerToken: needsToken ? generateMcpBearerToken() : mcpServer.bearerToken
    });
  }

  function handleMcpRegenerateToken() {
    onMcpServerChange({
      ...mcpServer,
      bearerToken: generateMcpBearerToken()
    });
  }

  function handleMcpCopyToken() {
    if (!mcpServer.bearerToken) {
      return;
    }

    if (navigator?.clipboard?.writeText) {
      void navigator.clipboard.writeText(mcpServer.bearerToken);
    }
  }

  const mcpConnectionUrl = mcpServer.enabled
    ? `http://${MCP_SERVER_DEFAULT_HOST}:${mcpServer.port}/mcp`
    : "";

  function handleMcpAutoApproveWritesChange(nextEnabled: boolean) {
    onMcpServerChange({
      ...mcpServer,
      autoApproveWrites: nextEnabled
    });
  }

  function handleMcpNgrokEnabledChange(nextEnabled: boolean) {
    onMcpServerChange({
      ...mcpServer,
      ngrokEnabled: nextEnabled
    });
  }

  function handleMcpNgrokDomainChange(nextDomain: string) {
    onMcpServerChange({
      ...mcpServer,
      ngrokDomain: nextDomain
    });
  }

  function handleMcpNgrokUseCustomPathChange(nextUseCustomPath: boolean) {
    onMcpServerChange({
      ...mcpServer,
      ngrokUseCustomPath: nextUseCustomPath
    });
  }

  function handleMcpNgrokPathChange(nextPath: string) {
    onMcpServerChange({
      ...mcpServer,
      ngrokPath: nextPath
    });
  }

  function copyToClipboard(value: string) {
    if (value && navigator?.clipboard?.writeText) {
      void navigator.clipboard.writeText(value);
    }
  }

  const ngrokPublicUrl = mcpNgrokStatus?.connected ? mcpNgrokStatus.url ?? "" : "";
  const ngrokPublicMcpUrl = ngrokPublicUrl
    ? `${ngrokPublicUrl.replace(/\/+$/, "")}/mcp`
    : "";
  const mcpLandingUrl = mcpServer.enabled
    ? `http://${MCP_SERVER_DEFAULT_HOST}:${mcpServer.port}/`
    : "";
  const ngrokPublicLandingUrl = ngrokPublicUrl ? `${ngrokPublicUrl.replace(/\/+$/, "")}/` : "";
  function handleFontSizeChange(value: string) {
    const nextFontSize = Number.parseFloat(value);
    if (!Number.isFinite(nextFontSize)) {
      return;
    }

    onFontSizePixelsChange(clampFontSize(nextFontSize));
  }

  function handlePageMarginChange(side: EditorPageMarginSide, value: string) {
    const nextMargin = Number.parseFloat(value);
    if (!Number.isFinite(nextMargin)) {
      return;
    }

    onPageMarginsChange({
      ...pageMargins,
      [side]: clampMargin(nextMargin)
    });
  }

  function handleParagraphSpacingChange(value: string) {
    const nextParagraphSpacing = Number.parseFloat(value);
    if (!Number.isFinite(nextParagraphSpacing)) {
      return;
    }

    onParagraphSpacingPixelsChange(clampParagraphSpacing(nextParagraphSpacing));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Preferences are saved for the current OS profile.</DialogDescription>
        </DialogHeader>

        <div className="nexus-settings-form">
          <label className="nexus-settings-field">
            <span className="nexus-settings-label">Editor font</span>
            <select
              className="nexus-settings-select"
              value={fontFamily}
              onChange={(event) => onFontFamilyChange(event.target.value as EditorFontFamily)}
            >
              {EDITOR_FONT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="nexus-settings-preview" style={{ fontFamily, fontSize: fontSizePixels }}>
            The quick brown fox jumps over 0123456789.
          </div>

          <label className="nexus-settings-field">
            <span className="nexus-settings-label">Theme</span>
            <select
              className="nexus-settings-select"
              value={themePreference}
              onChange={(event) =>
                onThemePreferenceChange(event.target.value as EditorThemePreference)
              }
            >
              {EDITOR_THEME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="nexus-settings-field">
            <span className="nexus-settings-label">Base font size</span>
            <span className="nexus-settings-input-with-unit">
              <input
                className="nexus-settings-input"
                inputMode="numeric"
                max={EDITOR_FONT_SIZE_MAX_PIXELS}
                min={EDITOR_FONT_SIZE_MIN_PIXELS}
                onChange={(event) => handleFontSizeChange(event.target.value)}
                step={EDITOR_FONT_SIZE_STEP_PIXELS}
                type="number"
                value={formatNumber(fontSizePixels)}
              />
              <span className="nexus-settings-unit">px</span>
            </span>
          </label>

          <label className="nexus-settings-field">
            <span className="nexus-settings-label">Paragraph spacing</span>
            <span className="nexus-settings-input-with-unit">
              <input
                className="nexus-settings-input"
                inputMode="numeric"
                max={EDITOR_PARAGRAPH_SPACING_MAX_PIXELS}
                min={EDITOR_PARAGRAPH_SPACING_MIN_PIXELS}
                onChange={(event) => handleParagraphSpacingChange(event.target.value)}
                step={EDITOR_PARAGRAPH_SPACING_STEP_PIXELS}
                type="number"
                value={formatNumber(paragraphSpacingPixels)}
              />
              <span className="nexus-settings-unit">px</span>
            </span>
          </label>

          <label className="nexus-settings-field">
            <span className="nexus-settings-label">Paper size</span>
            <select
              className="nexus-settings-select"
              value={pageSize}
              onChange={(event) => onPageSizeChange(event.target.value as EditorPageSize)}
            >
              {EDITOR_PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} ({option.widthInches} x {option.heightInches} in)
                </option>
              ))}
            </select>
          </label>

          <label className="nexus-settings-field">
            <span className="nexus-settings-label">Paper orientation</span>
            <select
              className="nexus-settings-select"
              value={pageOrientation}
              onChange={(event) =>
                onPageOrientationChange(event.target.value as EditorPageOrientation)
              }
            >
              {EDITOR_PAGE_ORIENTATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="nexus-settings-fieldset">
            <legend className="nexus-settings-label">Margins</legend>
            <div className="nexus-settings-margin-grid">
              {EDITOR_PAGE_MARGIN_SIDES.map((side) => (
                <label className="nexus-settings-margin-field" key={side.value}>
                  <span>{side.label}</span>
                  <span className="nexus-settings-input-with-unit">
                    <input
                      className="nexus-settings-input"
                      inputMode="decimal"
                      max={EDITOR_PAGE_MARGIN_MAX_INCHES}
                      min={EDITOR_PAGE_MARGIN_MIN_INCHES}
                      onChange={(event) => handlePageMarginChange(side.value, event.target.value)}
                      step={EDITOR_PAGE_MARGIN_STEP_INCHES}
                      type="number"
                      value={formatNumber(pageMargins[side.value])}
                    />
                    <span className="nexus-settings-unit">in</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="nexus-settings-field">
            <span className="nexus-settings-label">Store diagrams as .svg files</span>
            <input
              type="checkbox"
              checked={diagramsAsFiles}
              onChange={(event) => onDiagramsAsFilesChange(event.target.checked)}
            />
          </label>
          <p className="nexus-settings-help">
            When on, drawio and isoflow diagrams are saved as <code>.svg</code> files next to the
            document (referenced by relative path) instead of embedded inline as base64 — better for
            other Markdown readers that struggle with large inline images. Diagrams stay editable in
            Nexus either way. Off by default.
          </p>

          <fieldset className="nexus-settings-fieldset">
            <legend className="nexus-settings-label">MCP server (experimental)</legend>
            <p className="nexus-settings-help">
              Lets an external AI client (Claude, ChatGPT) read this document and propose
              edits over a local HTTP connection. Off by default. Writes are approved in a
              diff confirmation dialog unless auto-approve is enabled below. Clients can send
              the bearer token directly, or connect with OAuth (used by ChatGPT custom
              connectors and Claude.ai) — the OAuth flow opens a browser page asking for your
              approval, then issues the same bearer token.
            </p>

            <label className="nexus-settings-field">
              <span className="nexus-settings-label">Enable MCP server</span>
              <input
                type="checkbox"
                checked={mcpServer.enabled}
                onChange={(event) => handleMcpEnabledChange(event.target.checked)}
              />
            </label>

            <label className="nexus-settings-field">
              <span className="nexus-settings-label">Port</span>
              <span className="nexus-settings-input-with-unit">
                <input
                  className="nexus-settings-input"
                  inputMode="numeric"
                  max={MCP_SERVER_MAX_PORT}
                  min={MCP_SERVER_MIN_PORT}
                  onChange={(event) => handleMcpPortChange(event.target.value)}
                  step={1}
                  type="number"
                  value={String(mcpServer.port)}
                />
              </span>
            </label>

            <label className="nexus-settings-field">
              <span className="nexus-settings-label">Authentication</span>
              <select
                className="nexus-settings-select"
                value={mcpServer.authMode}
                onChange={(event) => handleMcpAuthModeChange(event.target.value as McpAuthMode)}
              >
                {MCP_AUTH_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {mcpServer.enabled && mcpServer.authMode === "none" && (
              <p className="nexus-settings-warning">
                Any local process that can reach {MCP_SERVER_DEFAULT_HOST}:{mcpServer.port} will
                be able to call MCP tools while the server is enabled. Writes still require
                approval in the confirmation dialog.
              </p>
            )}

            {mcpServer.enabled && (
              <label className="nexus-settings-field">
                <span className="nexus-settings-label">Connection URL</span>
                <input
                  className="nexus-settings-input"
                  readOnly
                  type="text"
                  value={mcpConnectionUrl}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
            )}

            {mcpServer.enabled && (
              <label className="nexus-settings-field">
                <span className="nexus-settings-label">Test page</span>
                <input
                  className="nexus-settings-input"
                  readOnly
                  type="text"
                  value={mcpLandingUrl}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
            )}

            {mcpServer.enabled && mcpServer.authMode === "bearer" && mcpServer.bearerToken && (
              <>
                <label className="nexus-settings-field">
                  <span className="nexus-settings-label">Bearer token</span>
                  <input
                    className="nexus-settings-input"
                    readOnly
                    type="text"
                    value={mcpServer.bearerToken}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                </label>

                <div className="nexus-settings-mcp-actions">
                  <Button type="button" variant="outline" onClick={handleMcpCopyToken}>
                    Copy token
                  </Button>
                  <Button type="button" variant="outline" onClick={handleMcpRegenerateToken}>
                    Regenerate token
                  </Button>
                </div>
              </>
            )}

            {mcpServer.enabled && (
              <div className="nexus-settings-mcp-test">
                <div className="nexus-settings-mcp-actions">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={mcpTesting}
                    onClick={handleTestMcpConnection}
                  >
                    {mcpTesting ? "Testing…" : "Test setup"}
                  </Button>
                </div>

                {mcpTestResult && (
                  <div className="nexus-settings-mcp-test-result" role="status" aria-live="polite">
                    <p
                      className={
                        mcpTestResult.local.ok ? "nexus-settings-success" : "nexus-settings-warning"
                      }
                    >
                      Local server: {describeProbe(mcpTestResult.local)}
                    </p>
                    {mcpTestResult.ngrok && (
                      <p
                        className={
                          mcpTestResult.ngrok.ok
                            ? "nexus-settings-success"
                            : "nexus-settings-warning"
                        }
                      >
                        ngrok URL: {describeProbe(mcpTestResult.ngrok)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {mcpServer.enabled && (
              <>
                <label className="nexus-settings-field">
                  <span className="nexus-settings-label">Auto-approve writes</span>
                  <input
                    type="checkbox"
                    checked={mcpServer.autoApproveWrites}
                    onChange={(event) =>
                      handleMcpAutoApproveWritesChange(event.target.checked)
                    }
                  />
                </label>

                {mcpServer.autoApproveWrites && (
                  <p className="nexus-settings-warning">
                    MCP write tools will change this document immediately, with no confirmation
                    dialog. Leave this off unless you trust every client that can reach the server
                    {mcpServer.ngrokEnabled
                      ? " — with the ngrok tunnel on, that includes any remote client with the URL."
                      : "."}
                  </p>
                )}
              </>
            )}

            {mcpServer.enabled && (
              <>
                <label className="nexus-settings-field">
                  <span className="nexus-settings-label">Expose via ngrok tunnel</span>
                  <input
                    type="checkbox"
                    checked={mcpServer.ngrokEnabled}
                    onChange={(event) => handleMcpNgrokEnabledChange(event.target.checked)}
                  />
                </label>

                {mcpServer.ngrokEnabled && (
                  <>
                    <p className="nexus-settings-help">
                      The tunnel runs your installed ngrok CLI to forward a public ngrok URL to the
                      loopback MCP server. The ngrok agent connects outbound, so no inbound port is
                      opened. Requires the ngrok CLI on your PATH and an authtoken configured once
                      with <code>ngrok config add-authtoken &lt;token&gt;</code>; Nexus does not store
                      the authtoken.
                    </p>

                    <label className="nexus-settings-field">
                      <span className="nexus-settings-label">Use a custom ngrok path</span>
                      <input
                        type="checkbox"
                        checked={mcpServer.ngrokUseCustomPath}
                        onChange={(event) =>
                          handleMcpNgrokUseCustomPathChange(event.target.checked)
                        }
                      />
                    </label>

                    {mcpServer.ngrokUseCustomPath && (
                      <label className="nexus-settings-field">
                        <span className="nexus-settings-label">ngrok executable path</span>
                        <input
                          className="nexus-settings-input"
                          type="text"
                          autoComplete="off"
                          placeholder="/opt/homebrew/bin/ngrok"
                          value={mcpServer.ngrokPath}
                          onChange={(event) => handleMcpNgrokPathChange(event.target.value)}
                        />
                      </label>
                    )}

                    {mcpServer.authMode === "none" && (
                      <p className="nexus-settings-warning">
                        The tunnel will expose an unauthenticated MCP server to the public internet.
                        Anyone with the URL can call read tools; writes still require approval. Use
                        bearer-token authentication instead unless you understand the risk.
                      </p>
                    )}

                    <label className="nexus-settings-field">
                      <span className="nexus-settings-label">Custom domain (optional)</span>
                      <input
                        className="nexus-settings-input"
                        type="text"
                        autoComplete="off"
                        placeholder="mcp.example.ngrok.app"
                        value={mcpServer.ngrokDomain}
                        onChange={(event) => handleMcpNgrokDomainChange(event.target.value)}
                      />
                    </label>
                    <p className="nexus-settings-help">
                      Use a reserved or custom domain from your ngrok account. Leave blank for a
                      random URL. If the domain is unavailable, Nexus falls back to a random URL.
                    </p>

                    {mcpServer.ngrokDomain.trim() && mcpNgrokStatus?.domainFallback && (
                      <p className="nexus-settings-warning">
                        The requested domain was not available, so a temporary ngrok URL is in use.
                        Confirm the domain is reserved on your ngrok account.
                      </p>
                    )}

                    {mcpNgrokStatus?.error && (
                      <p className="nexus-settings-warning">Tunnel error: {mcpNgrokStatus.error}</p>
                    )}

                    <div className="nexus-settings-mcp-actions">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={ngrokBusy}
                        onClick={handleRestartNgrok}
                      >
                        {ngrokBusy ? "Working…" : "Restart tunnel"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={ngrokBusy || !mcpNgrokStatus?.connected}
                        onClick={handleStopNgrok}
                      >
                        Stop tunnel
                      </Button>
                    </div>

                    {ngrokPublicMcpUrl && (
                      <>
                        <label className="nexus-settings-field">
                          <span className="nexus-settings-label">Public MCP endpoint</span>
                          <input
                            className="nexus-settings-input"
                            readOnly
                            type="text"
                            value={ngrokPublicMcpUrl}
                            onFocus={(event) => event.currentTarget.select()}
                          />
                        </label>
                        <div className="nexus-settings-mcp-actions">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => copyToClipboard(ngrokPublicMcpUrl)}
                          >
                            Copy public URL
                          </Button>
                        </div>
                      </>
                    )}

                    {ngrokPublicLandingUrl && (
                      <label className="nexus-settings-field">
                        <span className="nexus-settings-label">Public test page</span>
                        <input
                          className="nexus-settings-input"
                          readOnly
                          type="text"
                          value={ngrokPublicLandingUrl}
                          onFocus={(event) => event.currentTarget.select()}
                        />
                      </label>
                    )}
                  </>
                )}
              </>
            )}
          </fieldset>

          <p className="nexus-settings-profile">Profile: {profileName}</p>
        </div>

        <DialogFooter className="nexus-settings-footer">
          <Button type="button" variant="outline" onClick={onResetSettings}>
            Reset defaults
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SettingsDialog;
