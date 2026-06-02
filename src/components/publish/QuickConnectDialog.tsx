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

export type QuickConnectFields = {
  url: string;
  path: string;
  token: string;
};

export type QuickConnectPublishResult =
  | { ok: true; url: string | null }
  | { ok: false; error: string };

type Phase = "form" | "publishing" | "success" | "error";

type QuickConnectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValues: QuickConnectFields;
  onSubmit: (values: QuickConnectFields) => Promise<QuickConnectPublishResult>;
};

function QuickConnectDialog({
  open,
  onOpenChange,
  initialValues,
  onSubmit
}: QuickConnectDialogProps) {
  const [url, setUrl] = useState("");
  const [path, setPath] = useState("");
  const [token, setToken] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [errorMessage, setErrorMessage] = useState("");
  const [successUrl, setSuccessUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Seed fields from saved settings only when the dialog opens. Keyed on `open` alone so that
  // persisting settings on submit (which changes initialValues) cannot reset the form mid-publish.
  useEffect(() => {
    if (!open) {
      return;
    }

    setUrl(initialValues.url);
    setPath(initialValues.path);
    setToken(initialValues.token);
    setPhase("form");
    setErrorMessage("");
    setSuccessUrl(null);
    setCopied(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const canSubmit = url.trim().length > 0 && path.trim().length > 0;
  const isBusy = phase === "publishing";

  async function handlePublish() {
    setPhase("publishing");
    setErrorMessage("");

    let result: QuickConnectPublishResult;
    try {
      result = await onSubmit({ url: url.trim(), path: path.trim(), token });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "The document could not be published."
      );
      setPhase("error");
      return;
    }

    if (result.ok) {
      setSuccessUrl(result.url);
      setPhase("success");
      return;
    }

    setErrorMessage(result.error || "The document could not be published.");
    setPhase("error");
  }

  async function handleCopyUrl() {
    if (!successUrl) {
      return;
    }
    try {
      await navigator.clipboard?.writeText(successUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isBusy) {
          return;
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="nexus-publish-dialog">
        <DialogHeader>
          <DialogTitle>Publish as HTML over QuickConnect</DialogTitle>
          <DialogDescription>
            Send a self-contained HTML copy of this document to your QuickConnect server. The URL,
            path, and token are saved for next time.
          </DialogDescription>
        </DialogHeader>

        {phase === "success" ? (
          <div className="nexus-publish-result">
            <p className="nexus-publish-result-title">Published</p>
            {successUrl ? (
              <div className="nexus-publish-url-row">
                <a className="nexus-publish-url" href={successUrl} target="_blank" rel="noreferrer">
                  {successUrl}
                </a>
                <Button type="button" variant="outline" size="sm" onClick={handleCopyUrl}>
                  {copied ? "Copied" : "Copy URL"}
                </Button>
              </div>
            ) : (
              <p className="nexus-publish-help">
                The server accepted the document. It did not return a page URL.
              </p>
            )}
          </div>
        ) : (
          <div className="nexus-publish-form">
            <label className="nexus-settings-field">
              <span className="nexus-settings-label">Endpoint URL</span>
              <input
                className="nexus-settings-input"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/quickconnect"
                disabled={isBusy}
              />
            </label>

            <label className="nexus-settings-field">
              <span className="nexus-settings-label">Path</span>
              <input
                className="nexus-settings-input"
                value={path}
                onChange={(event) => setPath(event.target.value)}
                placeholder="docs/my-doc.html"
                disabled={isBusy}
              />
            </label>

            <label className="nexus-settings-field">
              <span className="nexus-settings-label">Bearer token</span>
              <input
                className="nexus-settings-input"
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                autoComplete="off"
                disabled={isBusy}
              />
            </label>

            {phase === "error" ? <p className="nexus-publish-error">{errorMessage}</p> : null}
            {isBusy ? <p className="nexus-publish-help">Sending to the QuickConnect server…</p> : null}
          </div>
        )}

        {phase === "success" ? (
          <DialogFooter>
            <Button type="button" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </DialogFooter>
        ) : (
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

export default QuickConnectDialog;
