import { NestedLexicalEditor } from "@mdxeditor/editor";
import { Info, Lightbulb, MessageSquareWarning, OctagonAlert, TriangleAlert } from "lucide-react";
import type { DirectiveDescriptor, DirectiveEditorProps } from "@mdxeditor/editor";
import type { LucideIcon } from "lucide-react";
import type { ContainerDirective } from "mdast-util-directive";
import {
  GITHUB_ALERT_LABELS,
  isGithubAlertDirective,
  isGithubAlertType
} from "../../lib/githubAlerts";
import type { GithubAlertType } from "../../lib/githubAlerts";

/** Header icon per kind, chosen to echo GitHub's own alert glyphs. */
const ALERT_ICONS: Record<GithubAlertType, LucideIcon> = {
  note: Info,
  tip: Lightbulb,
  important: MessageSquareWarning,
  warning: TriangleAlert,
  caution: OctagonAlert
};

/**
 * Renders a GitHub alert (`> [!TIP]`) as an editable callout.
 *
 * The header (icon + label) is non-editable chrome derived from the directive
 * `name`; only the body is editable, through a nested block editor. Body edits
 * are folded back into the directive by `getUpdatedMdastNode`, which spreads the
 * existing node so the `data.githubAlert` provenance flag (and the `name`)
 * survive — that flag is exactly what the export visitor keys on to round-trip
 * the callout back to `> [!TYPE]` blockquote syntax.
 */
function GithubAlertEditor({ mdastNode }: DirectiveEditorProps) {
  const type: GithubAlertType = isGithubAlertType(mdastNode.name) ? mdastNode.name : "note";
  const Icon = ALERT_ICONS[type];
  return (
    <div className={`nexus-callout nexus-gh-alert nexus-gh-alert--${type}`}>
      <div className="nexus-callout__title" contentEditable={false}>
        <Icon aria-hidden className="nexus-callout__icon" size={16} />
        <span>{GITHUB_ALERT_LABELS[type]}</span>
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
 * Directive descriptor for GitHub alerts. Its {@link isGithubAlertDirective}
 * guard matches only the `data.githubAlert`-tagged directives produced on import,
 * so it must be registered *before* `AdmonitionDirectiveDescriptor` in
 * `directivesPlugin` — the first matching descriptor wins, and the stock one
 * would otherwise claim the shared `note`/`tip`/`caution` names. Authored `:::`
 * admonitions (no flag) fall through to the stock descriptor untouched.
 */
export const githubAlertDirectiveDescriptor: DirectiveDescriptor = {
  name: "githubAlert",
  type: "containerDirective",
  attributes: [],
  hasChildren: true,
  testNode: (node) => isGithubAlertDirective(node),
  Editor: GithubAlertEditor
};
