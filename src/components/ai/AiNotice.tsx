import { Sparkles, X } from "lucide-react";
import { Button } from "../ui/button";

type AiNoticeProps = {
  message: string;
  /** When true, the notice offers a shortcut to open the AI Providers setup dialog. */
  needsProvider: boolean;
  onConfigure: () => void;
  onDismiss: () => void;
};

/**
 * Compact, dismissible banner for AI feedback that isn't an editable result — errors, timeouts, and
 * the "no provider configured" prompt. Sits above the status bar so it never blocks the document.
 */
function AiNotice({ message, needsProvider, onConfigure, onDismiss }: AiNoticeProps) {
  return (
    <div className="nexus-ai-notice" role="status" aria-live="polite">
      <Sparkles aria-hidden="true" className="nexus-ai-notice-icon" />
      <span className="nexus-ai-notice-message">{message}</span>
      {needsProvider ? (
        <Button type="button" size="sm" variant="outline" onClick={onConfigure}>
          Open AI Providers…
        </Button>
      ) : null}
      <button
        aria-label="Dismiss"
        className="nexus-ai-notice-dismiss"
        onClick={onDismiss}
        type="button"
      >
        <X aria-hidden="true" />
      </button>
    </div>
  );
}

export default AiNotice;
