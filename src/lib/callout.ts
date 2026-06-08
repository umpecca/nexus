/**
 * Pure helpers behind the toolbar's "change callout type" control, which converts the focused callout
 * between the two flavors Nexus supports — the original `:::` admonition directive and the GitHub
 * `> [!TYPE]` alert — and between the kinds within each.
 *
 * Both flavors are container directives; they differ only by the `data.githubAlert` provenance flag
 * (see `githubAlerts.ts`) and by which `name`s each renders. Converting therefore means rewriting the
 * directive's `name` and toggling that flag — exactly what {@link applyCalloutValue} does. Because the
 * descriptor is re-resolved from the live MDAST node on every render, flipping the flag swaps the
 * renderer (and the export syntax) automatically.
 *
 * The Lexical glue that drives this from the toolbar lives in `components/editor/ChangeCalloutType.tsx`;
 * the runtime-independent option list, value parsing, and node rewrite live here so they can be
 * unit-tested without standing up an editor.
 */
import type { ContainerDirective } from "mdast-util-directive";
import { ADMONITION_LABELS, ADMONITION_TYPES, isAdmonitionType } from "./admonition";
import { GITHUB_ALERT_LABELS, GITHUB_ALERT_TYPES, isGithubAlertDirective, isGithubAlertType } from "./githubAlerts";

/** The two callout flavors: the original `:::name` directive, and the GitHub `> [!TYPE]` alert. */
export type CalloutFlavor = "admonition" | "github";

/** A flavor + kind pair. Both are needed because kind names overlap across flavors (note/tip/caution). */
export interface CalloutSelection {
  flavor: CalloutFlavor;
  name: string;
}

/** One entry in the change-type dropdown. */
export interface CalloutOption {
  /** `${flavor}:${name}` — unambiguous because the bare name is shared between flavors. */
  value: string;
  label: string;
}

/** Compose the `${flavor}:${name}` value used both as a dropdown option value and as the current selection. */
export function calloutValue(flavor: CalloutFlavor, name: string): string {
  return `${flavor}:${name}`;
}

/**
 * The dropdown options, in display order: every admonition kind, a separator, then every GitHub alert
 * kind. GitHub kinds are suffixed so the two `Note`/`Tip`/`Caution` pairs stay distinct in the
 * collapsed trigger as well as the open list.
 */
export const CALLOUT_OPTIONS: (CalloutOption | "separator")[] = [
  ...ADMONITION_TYPES.map((name) => ({ value: calloutValue("admonition", name), label: ADMONITION_LABELS[name] })),
  "separator",
  ...GITHUB_ALERT_TYPES.map((name) => ({
    value: calloutValue("github", name),
    label: `${GITHUB_ALERT_LABELS[name]} (GitHub)`
  }))
];

/** Parse a `${flavor}:${name}` value back into its parts, or null when it is not a known option. */
export function parseCalloutValue(value: string): CalloutSelection | null {
  const separator = value.indexOf(":");
  if (separator === -1) {
    return null;
  }
  const flavor = value.slice(0, separator);
  const name = value.slice(separator + 1);
  if (flavor === "admonition" && isAdmonitionType(name)) {
    return { flavor, name };
  }
  if (flavor === "github" && isGithubAlertType(name)) {
    return { flavor, name };
  }
  return null;
}

/**
 * The `${flavor}:${name}` value for an existing directive, or null when it is not a callout this control
 * manages. A GitHub alert is recognised by its provenance flag (checked first, since a tagged `note`
 * also satisfies the admonition name test); an admonition by its name alone.
 */
export function calloutValueForNode(node: ContainerDirective): string | null {
  // Capture `name` before the guard call: `isGithubAlertDirective` narrows `node` (already typed
  // ContainerDirective) to `never` in the fall-through, so reading `node.name` afterwards would not
  // type-check. The captured string stays usable in every branch.
  const name = node.name;
  if (isGithubAlertDirective(node)) {
    return calloutValue("github", name);
  }
  if (isAdmonitionType(name)) {
    return calloutValue("admonition", name);
  }
  return null;
}

/**
 * Rewrite a callout directive to the kind named by a `${flavor}:${name}` value, preserving its body
 * (and any attributes). Switching to GitHub stamps `data.githubAlert`; switching to an admonition
 * strips it — dropping `data` entirely when nothing else lives there — so the block serialises back to
 * plain `:::name`. Returns the node unchanged when the value is not a known option.
 */
export function applyCalloutValue(node: ContainerDirective, value: string): ContainerDirective {
  const selection = parseCalloutValue(value);
  if (!selection) {
    return node;
  }
  const result: ContainerDirective = { ...node, name: selection.name };
  if (selection.flavor === "github") {
    result.data = { ...node.data, githubAlert: true };
    return result;
  }
  // Admonition: strip the provenance flag, and drop `data` entirely (not leave a dangling `undefined`)
  // when nothing else lives there, so the block serialises back to a clean `:::name`.
  if (result.data) {
    const data = { ...result.data };
    delete data.githubAlert;
    if (Object.keys(data).length > 0) {
      result.data = data;
    } else {
      delete result.data;
    }
  }
  return result;
}
