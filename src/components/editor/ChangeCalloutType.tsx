import { Select, editorInFocus$, rootEditor$ } from "@mdxeditor/editor";
import { useCellValues } from "@mdxeditor/gurx";
import type { ContainerDirective } from "mdast-util-directive";
import { CALLOUT_OPTIONS, applyCalloutValue, calloutValueForNode } from "../../lib/callout";

/** The slice of the focused Lexical `DirectiveNode` this control drives. */
interface DirectiveLexicalNode {
  getMdastNode: () => ContainerDirective;
  setMdastNode: (node: ContainerDirective) => void;
  getLatest: () => DirectiveLexicalNode;
  select: () => void;
}

/**
 * Toolbar control shown while the caret is inside a callout — either a `:::` admonition or a
 * `> [!TYPE]` GitHub alert. It replaces MDXEditor's stock `ChangeAdmonitionType` so the single dropdown
 * spans *both* flavors: picking any entry converts the focused callout to that exact flavor and kind.
 *
 * Conversion just rewrites the directive's MDAST node ({@link applyCalloutValue}) and re-selects it, the
 * same dance the stock control uses to change an admonition's kind. Because the directive renderer is
 * re-resolved from the node on every render, toggling the `data.githubAlert` flag swaps the callout
 * between the GitHub renderer (and `> [!TYPE]` export) and the admonition renderer (and `:::` export)
 * without any extra wiring. Wrapping is unaffected — the body children carry across untouched.
 */
function ChangeCalloutType() {
  const [editorInFocus, rootEditor] = useCellValues(editorInFocus$, rootEditor$);
  const node = (editorInFocus?.rootNode ?? null) as DirectiveLexicalNode | null;
  if (!node) {
    return null;
  }

  const currentValue = calloutValueForNode(node.getMdastNode()) ?? "";

  return (
    <Select
      value={currentValue}
      onChange={(value) => {
        rootEditor?.update(() => {
          node.setMdastNode(applyCalloutValue(node.getMdastNode(), value));
          // The flavor swap re-mounts the nested editor; re-select once it has, so the caret lands back
          // inside the callout body rather than in the outer document. Mirrors ChangeAdmonitionType.
          setTimeout(() => {
            rootEditor.update(() => {
              node.getLatest().select();
            });
          }, 80);
        });
      }}
      triggerTitle="Select callout type"
      placeholder="Callout type"
      items={CALLOUT_OPTIONS}
    />
  );
}

export default ChangeCalloutType;
