import { iconComponentFor$ } from "@mdxeditor/editor";
import { useCellValue } from "@mdxeditor/gurx";
import {
  ADMONITION_LABELS,
  ADMONITION_TYPES,
  createAdmonitionDirectiveNode,
  isAdmonitionType
} from "../../lib/admonition";
import type { AdmonitionType } from "../../lib/admonition";
import InsertDirectiveControl from "./InsertDirectiveControl";

const ADMONITION_ITEMS = ADMONITION_TYPES.map((type) => ({
  value: type,
  label: ADMONITION_LABELS[type]
}));

/**
 * Toolbar control for adding a `:::` admonition (note / tip / danger / info / caution).
 *
 * A thin configuration over {@link InsertDirectiveControl}: it supplies the admonition kinds and a node
 * builder that emits a plain container directive (no `data.githubAlert` flag), so the block serialises
 * as `:::name`. Selecting text wraps it; a bare click inserts an empty admonition — both behaviours live
 * in the shared control. The sibling {@link InsertGithubAlert} reuses the same control for `> [!TYPE]`
 * GitHub alerts.
 */
function InsertAdmonition() {
  const iconComponentFor = useCellValue(iconComponentFor$);

  return (
    <InsertDirectiveControl
      title="Insert admonition"
      items={ADMONITION_ITEMS}
      isValidType={isAdmonitionType}
      createMdastNode={(name, children) =>
        createAdmonitionDirectiveNode(name as AdmonitionType, children)
      }
    >
      {iconComponentFor("admonition")}
    </InsertDirectiveControl>
  );
}

export default InsertAdmonition;
