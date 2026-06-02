import { useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../ui/dialog";

export type PublishConnectionFields = {
  host: string;
  port: number;
  username: string;
  remoteDirectory: string;
  publicBaseUrl: string;
};

export type PublishAuth =
  | { kind: "password"; password: string }
  | { kind: "key"; privateKeyPath: string; passphrase?: string };

export type PublishSubmitValues = {
  connection: PublishConnectionFields & { remoteFilename: string };
  auth: PublishAuth;
};

export type PublishResult =
  | { ok: true; remotePath: string; url: string | null }
  | { ok: false; canceled: true }
  | { ok: false; error: string };

export type PendingHostKey = {
  host: string;
  port: number;
  fingerprint: string;
};

type AuthMethod = "password" | "key";

type Phase = "form" | "publishing" | "success" | "error";

type PublishWebDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialConnection: PublishConnectionFields;
  defaultRemoteFilename: string;
  pendingHostKey: PendingHostKey | null;
  onAcceptHostKey: () => void;
  onRejectHostKey: () => void;
  onSubmit: (values: PublishSubmitValues) => Promise<PublishResult>;
  onSelectPrivateKey: () => Promise<string | null>;
};

function PublishWebDialog({
  open,
  onOpenChange,
  initialConnection,
  defaultRemoteFilename,
  pendingHostKey,
  onAcceptHostKey,
  onRejectHostKey,
  onSubmit,
  onSelectPrivateKey
}: PublishWebDialogProps) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [username, setUsername] = useState("");
  const [authMethod, setAuthMethod] = useState<AuthMethod>("password");
  const [password, setPassword] = useState("");
  const [privateKeyPath, setPrivateKeyPath] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [remoteDirectory, setRemoteDirectory] = useState("");
  const [remoteFilename, setRemoteFilename] = useState("");
  const [publicBaseUrl, setPublicBaseUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [errorMessage, setErrorMessage] = useState("");
  const [successResult, setSuccessResult] = useState<{ remotePath: string; url: string | null } | null>(
    null
  );
  const [copied, setCopied] = useState(false);

  // Reset every field from the saved (non-secret) connection only when the dialog opens.
  // Secrets always start blank and are never seeded from storage. This intentionally depends
  // on `open` alone: persisting the connection on submit replaces `initialConnection`, and
  // re-running this on that change would wipe the password and phase mid-publish.
  useEffect(() => {
    if (!open) {
      return;
    }

    setHost(initialConnection.host);
    setPort(String(initialConnection.port || 22));
    setUsername(initialConnection.username);
    setRemoteDirectory(initialConnection.remoteDirectory);
    setPublicBaseUrl(initialConnection.publicBaseUrl);
    setRemoteFilename(defaultRemoteFilename);
    setPassword("");
    setPrivateKeyPath("");
    setPassphrase("");
    setAuthMethod("password");
    setPhase("form");
    setErrorMessage("");
    setSuccessResult(null);
    setCopied(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const trimmedFingerprintHost = pendingHostKey
    ? `${pendingHostKey.host}:${pendingHostKey.port}`
    : "";

  const canSubmit = useMemo(() => {
    if (!host.trim() || !username.trim() || !remoteFilename.trim()) {
      return false;
    }
    if (authMethod === "password") {
      return password.length > 0;
    }
    return privateKeyPath.trim().length > 0;
  }, [host, username, remoteFilename, authMethod, password, privateKeyPath]);

  async function handlePublish() {
    const parsedPort = Number.parseInt(port, 10);
    const auth: PublishAuth =
      authMethod === "password"
        ? { kind: "password", password }
        : { kind: "key", privateKeyPath: privateKeyPath.trim(), passphrase: passphrase || undefined };

    setPhase("publishing");
    setErrorMessage("");

    let result: PublishResult;
    try {
      result = await onSubmit({
        connection: {
          host: host.trim(),
          port: Number.isFinite(parsedPort) ? parsedPort : 22,
          username: username.trim(),
          remoteDirectory: remoteDirectory.trim(),
          remoteFilename: remoteFilename.trim(),
          publicBaseUrl: publicBaseUrl.trim()
        },
        auth
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "The document could not be published."
      );
      setPhase("error");
      return;
    }

    if (result.ok) {
      setSuccessResult({ remotePath: result.remotePath, url: result.url });
      setPhase("success");
      return;
    }

    if ("canceled" in result && result.canceled) {
      // Host-key rejection or window close: return to the form so the user can retry.
      setPhase("form");
      return;
    }

    setErrorMessage("error" in result ? result.error : "The document could not be published.");
    setPhase("error");
  }

  async function handleSelectPrivateKey() {
    const selectedPath = await onSelectPrivateKey();
    if (selectedPath) {
      setPrivateKeyPath(selectedPath);
    }
  }

  async function handleCopyUrl() {
    if (!successResult?.url) {
      return;
    }
    try {
      await navigator.clipboard?.writeText(successResult.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const isBusy = phase === "publishing";

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isBusy) {
          // Do not allow dismissing mid-publish; the host-key prompt or result will resolve it.
          return;
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="nexus-publish-dialog">
        <DialogHeader>
          <DialogTitle>Publish as HTML over SFTP</DialogTitle>
          <DialogDescription>
            Upload a self-contained HTML copy of this document to your SFTP server. Credentials are
            used only for this publish and are never saved.
          </DialogDescription>
        </DialogHeader>

        {phase === "success" && successResult ? (
          <div className="nexus-publish-result">
            <p className="nexus-publish-result-title">Published</p>
            <p className="nexus-publish-result-path">{successResult.remotePath}</p>
            {successResult.url ? (
              <div className="nexus-publish-url-row">
                <a
                  className="nexus-publish-url"
                  href={successResult.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {successResult.url}
                </a>
                <Button type="button" variant="outline" size="sm" onClick={handleCopyUrl}>
                  {copied ? "Copied" : "Copy URL"}
                </Button>
              </div>
            ) : (
              <p className="nexus-publish-help">
                Set a public base URL to get a clickable link. A successful upload does not by itself
                guarantee the file is served over HTTP.
              </p>
            )}
          </div>
        ) : pendingHostKey ? (
          <div className="nexus-publish-hostkey">
            <p className="nexus-publish-hostkey-title">Verify host key</p>
            <p className="nexus-publish-help">
              The server at <strong>{trimmedFingerprintHost}</strong> presented this host-key
              fingerprint. Continue only if it matches the server you trust.
            </p>
            <pre className="nexus-publish-fingerprint">{pendingHostKey.fingerprint}</pre>
            <div className="nexus-publish-hostkey-actions">
              <Button type="button" variant="outline" onClick={onRejectHostKey}>
                Reject
              </Button>
              <Button type="button" onClick={onAcceptHostKey}>
                Accept and continue
              </Button>
            </div>
          </div>
        ) : (
          <div className="nexus-publish-form">
            <div className="nexus-publish-grid">
              <label className="nexus-settings-field nexus-publish-field-wide">
                <span className="nexus-settings-label">Host</span>
                <input
                  className="nexus-settings-input"
                  value={host}
                  onChange={(event) => setHost(event.target.value)}
                  placeholder="example.com"
                  disabled={isBusy}
                />
              </label>
              <label className="nexus-settings-field">
                <span className="nexus-settings-label">Port</span>
                <input
                  className="nexus-settings-input"
                  value={port}
                  onChange={(event) => setPort(event.target.value)}
                  inputMode="numeric"
                  disabled={isBusy}
                />
              </label>
            </div>

            <label className="nexus-settings-field">
              <span className="nexus-settings-label">Username</span>
              <input
                className="nexus-settings-input"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="off"
                disabled={isBusy}
              />
            </label>

            <div className="nexus-publish-auth-toggle" role="group" aria-label="Authentication method">
              <Button
                type="button"
                size="sm"
                variant={authMethod === "password" ? "default" : "outline"}
                aria-pressed={authMethod === "password"}
                onClick={() => setAuthMethod("password")}
                disabled={isBusy}
              >
                Password
              </Button>
              <Button
                type="button"
                size="sm"
                variant={authMethod === "key" ? "default" : "outline"}
                aria-pressed={authMethod === "key"}
                onClick={() => setAuthMethod("key")}
                disabled={isBusy}
              >
                Private key
              </Button>
            </div>

            {authMethod === "password" ? (
              <label className="nexus-settings-field">
                <span className="nexus-settings-label">Password</span>
                <input
                  className="nexus-settings-input"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="off"
                  disabled={isBusy}
                />
              </label>
            ) : (
              <>
                <label className="nexus-settings-field">
                  <span className="nexus-settings-label">Private key file</span>
                  <div className="nexus-publish-key-row">
                    <input
                      className="nexus-settings-input"
                      value={privateKeyPath}
                      onChange={(event) => setPrivateKeyPath(event.target.value)}
                      placeholder="/home/me/.ssh/id_ed25519"
                      disabled={isBusy}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleSelectPrivateKey}
                      disabled={isBusy}
                    >
                      Browse
                    </Button>
                  </div>
                </label>
                <label className="nexus-settings-field">
                  <span className="nexus-settings-label">Passphrase (optional)</span>
                  <input
                    className="nexus-settings-input"
                    type="password"
                    value={passphrase}
                    onChange={(event) => setPassphrase(event.target.value)}
                    autoComplete="off"
                    disabled={isBusy}
                  />
                </label>
              </>
            )}

            <div className="nexus-publish-grid">
              <label className="nexus-settings-field nexus-publish-field-wide">
                <span className="nexus-settings-label">Remote directory</span>
                <input
                  className="nexus-settings-input"
                  value={remoteDirectory}
                  onChange={(event) => setRemoteDirectory(event.target.value)}
                  placeholder="/var/www/html"
                  disabled={isBusy}
                />
              </label>
              <label className="nexus-settings-field">
                <span className="nexus-settings-label">Filename</span>
                <input
                  className="nexus-settings-input"
                  value={remoteFilename}
                  onChange={(event) => setRemoteFilename(event.target.value)}
                  disabled={isBusy}
                />
              </label>
            </div>

            <label className="nexus-settings-field">
              <span className="nexus-settings-label">Public base URL (optional)</span>
              <input
                className="nexus-settings-input"
                value={publicBaseUrl}
                onChange={(event) => setPublicBaseUrl(event.target.value)}
                placeholder="https://example.com/docs"
                disabled={isBusy}
              />
            </label>

            {phase === "error" ? <p className="nexus-publish-error">{errorMessage}</p> : null}
            {isBusy ? <p className="nexus-publish-help">Connecting and uploading…</p> : null}
          </div>
        )}

        {phase === "success" ? (
          <DialogFooter>
            <Button type="button" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </DialogFooter>
        ) : pendingHostKey ? null : (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isBusy}>
              Cancel
            </Button>
            <Button type="button" onClick={handlePublish} disabled={!canSubmit || isBusy}>
              {isBusy ? "Publishing…" : "Publish"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default PublishWebDialog;
