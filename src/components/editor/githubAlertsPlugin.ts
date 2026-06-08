import { addMdastExtension$, addToMarkdownExtension$, realmPlugin } from "@mdxeditor/editor";
import {
  githubAlertToMarkdownExtension,
  transformTreeAlertsToDirectives
} from "../../lib/githubAlerts";

/**
 * MDXEditor plugin that adds GitHub alert (`> [!TIP]`) callouts without disturbing
 * the existing `:::` admonition support:
 *
 * - **import** — a `from-markdown` `transforms` hook ({@link transformTreeAlertsToDirectives})
 *   rewrites alert blockquotes into container directives tagged `data.githubAlert`,
 *   which the directives plugin's existing import visitor then renders through
 *   `githubAlertDirectiveDescriptor`;
 * - **export** — {@link githubAlertToMarkdownExtension} serialises those tagged
 *   directives back to `> [!TYPE]` blockquotes and delegates every other directive
 *   to the stock `:::` serializer.
 *
 * Pair with `directivesPlugin`, configured with `githubAlertDirectiveDescriptor`
 * registered ahead of `AdmonitionDirectiveDescriptor`, and register this plugin
 * *after* `directivesPlugin` so the export extension overrides the directive
 * serializer for `containerDirective`.
 */
export const githubAlertsPlugin = realmPlugin({
  init(realm) {
    realm.pub(addMdastExtension$, { transforms: [transformTreeAlertsToDirectives] });
    realm.pub(addToMarkdownExtension$, githubAlertToMarkdownExtension);
  }
});
