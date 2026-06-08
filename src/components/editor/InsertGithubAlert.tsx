import { Github } from "lucide-react";
import {
  GITHUB_ALERT_LABELS,
  GITHUB_ALERT_TYPES,
  createGithubAlertDirectiveNode,
  isGithubAlertType
} from "../../lib/githubAlerts";
import type { GithubAlertType } from "../../lib/githubAlerts";
import InsertDirectiveControl from "./InsertDirectiveControl";

const GITHUB_ALERT_ITEMS = GITHUB_ALERT_TYPES.map((type) => ({
  value: type,
  label: GITHUB_ALERT_LABELS[type]
}));

/**
 * Toolbar control for adding a GitHub alert (`> [!NOTE]` — note / tip / important / warning / caution).
 *
 * A thin configuration over {@link InsertDirectiveControl}, the twin of {@link InsertAdmonition}: it
 * supplies the five GitHub alert kinds and a node builder that stamps the `data.githubAlert` provenance
 * flag, so the inserted block renders as a GitHub callout and round-trips to `> [!TYPE]` blockquote
 * syntax rather than to `:::type`. Selecting text wraps it; a bare click inserts an empty alert — both
 * behaviours are shared with the admonition button.
 */
function InsertGithubAlert() {
  return (
    <InsertDirectiveControl
      title="Insert GitHub alert"
      items={GITHUB_ALERT_ITEMS}
      isValidType={isGithubAlertType}
      createMdastNode={(name, children) =>
        createGithubAlertDirectiveNode(name as GithubAlertType, children)
      }
    >
      <Github aria-hidden />
    </InsertDirectiveControl>
  );
}

export default InsertGithubAlert;
