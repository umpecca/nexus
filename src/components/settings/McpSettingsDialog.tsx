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
import type { McpAuthMode, McpServerSettings } from "../../lib/settings";
import type { McpConnectionProbe, McpConnectionTestResult, McpNgrokStatus } from "../../electron";
import {
  MCP_AUTH_MODE_OPTIONS,
  MCP_SERVER_DEFAULT_HOST,
  MCP_SERVER_MAX_PORT,
  MCP_SERVER_MIN_PORT,
  generateMcpBearerToken,
  sanitizeMcpServerPort
} from "../../lib/settings";

type McpSettingsDialogProps = {
  mcpServer: McpServerSettings;
  mcpNgrokStatus: McpNgrokStatus | null;
  onTestMcpConnection: () => Promise<McpConnectionTestResult | undefined>;
  onStopNgrok: () => Promise<void>;
  onRestartNgrok: () => Promise<void>;
  onMcpServerChange: (next: McpServerSettings) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  profileName: string;
};

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

function McpSettingsDialog({
  mcpServer,
  mcpNgrokStatus,
  onTestMcpConnection,
  onStopNgrok,
  onRestartNgrok,
  onMcpServerChange,
  onOpenChange,
  open,
  profileName
}: McpSettingsDialogProps) {
  const [mcpTesting, setMcpTesting] = useState(false);
  const [mcpTestResult, setMcpTestResult] = useState<McpConnectionTestResult | null>(null);
  const [ngrokBusy, setNgrokBusy] = useState(false);

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

  const mcpConnectionUrl = mcpServer.enabled
    ? `http://${MCP_SERVER_DEFAULT_HOST}:${mcpServer.port}/mcp`
    : "";
  const mcpLandingUrl = mcpServer.enabled
    ? `http://${MCP_SERVER_DEFAULT_HOST}:${mcpServer.port}/`
    : "";
  const ngrokPublicUrl = mcpNgrokStatus?.connected ? mcpNgrokStatus.url ?? "" : "";
  const ngrokPublicMcpUrl = ngrokPublicUrl
    ? `${ngrokPublicUrl.replace(/\/+$/, "")}/mcp`
    : "";
  const ngrokPublicLandingUrl = ngrokPublicUrl ? `${ngrokPublicUrl.replace(/\/+$/, "")}/` : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="nexus-mcp-dialog-content">
        <DialogHeader>
          <DialogTitle>MCP server (experimental)</DialogTitle>
          <DialogDescription>
            Lets an external AI client (Claude, ChatGPT) read this document and propose edits over a
            local HTTP connection. Off by default.
          </DialogDescription>
        </DialogHeader>

        <div className="nexus-settings-form">
          <section className="nexus-settings-section">
            <h3 className="nexus-settings-eyebrow">Server</h3>
            <p className="nexus-settings-help">
              Writes are approved in a diff confirmation dialog unless auto-approve is enabled below.
              Clients can send the bearer token directly, or connect with OAuth (used by ChatGPT
              custom connectors and Claude.ai). The browser requests approval, then a native Nexus
              dialog asks you to allow the connection before issuing the same bearer token.
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
                Any local process that can reach {MCP_SERVER_DEFAULT_HOST}:{mcpServer.port} will be
                able to call MCP tools while the server is enabled. Writes still require approval in
                the confirmation dialog.
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
          </section>

          {mcpServer.enabled && (
            <section className="nexus-settings-section">
              <h3 className="nexus-settings-eyebrow">Writes</h3>

              <label className="nexus-settings-field">
                <span className="nexus-settings-label">Auto-approve writes</span>
                <input
                  type="checkbox"
                  checked={mcpServer.autoApproveWrites}
                  onChange={(event) => handleMcpAutoApproveWritesChange(event.target.checked)}
                />
              </label>

              {mcpServer.autoApproveWrites && (
                <p className="nexus-settings-warning">
                  MCP write tools will change this document immediately, with no confirmation dialog.
                  Leave this off unless you trust every client that can reach the server
                  {mcpServer.ngrokEnabled
                    ? " — with the ngrok tunnel on, that includes any remote client with the URL."
                    : "."}
                </p>
              )}
            </section>
          )}

          {mcpServer.enabled && (
            <section className="nexus-settings-section">
              <h3 className="nexus-settings-eyebrow">Remote access</h3>

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
                    opened. Requires the ngrok CLI on your PATH and an authtoken configured once with{" "}
                    <code>ngrok config add-authtoken &lt;token&gt;</code>; Nexus does not store the
                    authtoken.
                  </p>

                  <label className="nexus-settings-field">
                    <span className="nexus-settings-label">Use a custom ngrok path</span>
                    <input
                      type="checkbox"
                      checked={mcpServer.ngrokUseCustomPath}
                      onChange={(event) => handleMcpNgrokUseCustomPathChange(event.target.checked)}
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
                    Use a reserved or custom domain from your ngrok account. Leave blank for a random
                    URL. If the domain is unavailable, Nexus falls back to a random URL.
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
            </section>
          )}

          <p className="nexus-settings-profile">Profile: {profileName}</p>
        </div>

        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default McpSettingsDialog;
