import { NestedLexicalEditor } from "@mdxeditor/editor";
import { Info, Lightbulb, OctagonAlert, StickyNote, TriangleAlert } from "lucide-react";
import type { DirectiveDescriptor, DirectiveEditorProps } from "@mdxeditor/editor";
import type { LucideIcon } from "lucide-react";
import type { ContainerDirective } from "mdast-util-directive";
import { ADMONITION_LABELS, isAdmonitionType } from "../../lib/admonition";
import type { AdmonitionType } from "../../lib/admonition";

/** Header icon per kind. */
const ADMONITION_ICONS: Record<AdmonitionType, LucideIcon> = {
  note: StickyNote,
  tip: Lightbulb,
  danger: OctagonAlert,
  info: Info,
  caution: TriangleAlert
};

/**
 * Renders a `:::` admonition (note / tip / danger / info / caution) as an editable callout.
 *
 * Replaces MDXEditor's stock `AdmonitionDirectiveDescriptor`, whose Editor draws only a bare tinted
 * box with no header. This mirrors {@link GithubAlertEditor}: a non-editable icon + label header
 * (derived from the directive `name`) above a nested block editor, sharing the `.nexus-callout` look.
 * Body edits round-trip through `getUpdatedMdastNode`, which spreads the node so it still serialises
 * as `:::name` — the descriptor only changes rendering, not the MDAST the export visitor sees.
 */
function AdmonitionEditor({ mdastNode }: DirectiveEditorProps) {
  const type: AdmonitionType = isAdmonitionType(mdastNode.name) ? mdastNode.name : "note";
  const Icon = ADMONITION_ICONS[type];
  return (
    <div className={`nexus-callout nexus-admonition nexus-admonition--${type}`}>
      <div className="nexus-callout__title" contentEditable={false}>
        <Icon aria-hidden className="nexus-callout__icon" size={16} />
        <span>{ADMONITION_LABELS[type]}</span>
      </div>
      <NestedLexicalEditor<ContainerDirective>
        block
        getContent={(node) => node.children}
        getUpdatedMdastNode={(node, children) => ({
          ...node,
          children: children as ContainerDirective["children"]
        })}
      />
    </div>
  );
}

/**
 * Directive descriptor for `:::` admonitions. Registered after {@link githubAlertDirectiveDescriptor}
 * so GitHub alerts (which share the `note`/`tip`/`caution` names but carry a `data.githubAlert` flag)
 * are claimed first; only unflagged admonitions fall through to this one — matching the stock
 * descriptor's behaviour it replaces.
 */
export const admonitionDirectiveDescriptor: DirectiveDescriptor = {
  name: "admonition",
  type: "containerDirective",
  attributes: [],
  hasChildren: true,
  testNode: (node) => isAdmonitionType(node.name),
  Editor: AdmonitionEditor
};
