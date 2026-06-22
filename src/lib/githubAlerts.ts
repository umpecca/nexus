/**
 * Pure, editor-independent helpers for GitHub *alert* callouts — the
 * `> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]` and `> [!CAUTION]`
 * blockquotes used by GitHub-flavoured Markdown.
 *
 * Nexus renders admonitions through MDXEditor's *container-directive* dialect
 * (`:::tip` … `:::`). GitHub alerts are a different surface syntax built on
 * blockquotes, so to support them without disturbing the existing directive
 * feature we normalise an alert into a container directive on import and tag it
 * with `data.githubAlert`. On export the tagged directive is serialised back to
 * `> [!TYPE]`, while directives the user authored as `:::` (no flag) keep
 * serialising as `:::`. Each block therefore round-trips to its own on-disk
 * syntax.
 *
 * Everything here operates on MDAST (and the mdast-util-to-markdown serializer
 * state) without touching the editor or the DOM, so it is exercised both by unit
 * tests and by an end-to-end test that drives the real parser/serializer. The
 * MDXEditor wiring is the thin realm plugin in
 * `components/editor/githubAlertsPlugin.ts`, and the React callout renderer is in
 * `components/editor/GithubAlert.tsx`.
 */
import type {
  Blockquote,
  BlockContent,
  DefinitionContent,
  Parents,
  PhrasingContent,
  Root,
  RootContent
} from "mdast";
import { directiveToMarkdown } from "mdast-util-directive";
import type { ContainerDirective } from "mdast-util-directive";
import type { Info, Options, State } from "mdast-util-to-markdown";

declare module "unist" {
  interface Data {
    /**
     * Set on a container directive that was synthesised from a GitHub alert
     * blockquote, so the export side serialises it back to `> [!TYPE]` rather
     * than to `:::type`. Absent on directives the user authored as `:::`.
     */
    githubAlert?: boolean;
  }
}

/** The five GitHub alert kinds, lower-cased so each doubles as the directive `name`. */
export const GITHUB_ALERT_TYPES = ["note", "tip", "important", "warning", "caution"] as const;

export type GithubAlertType = (typeof GITHUB_ALERT_TYPES)[number];

/** Header label for each kind, matching the text GitHub renders. */
export const GITHUB_ALERT_LABELS: Record<GithubAlertType, string> = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution"
};

/**
 * Matches a GitHub alert marker at the very start of a text run: `[!TYPE]` alone
 * on its line, optionally followed by horizontal whitespace and a line ending
 * (or the end of the run). The type is upper-case and case-sensitive, mirroring
 * GitHub — `[!note]` and `[!Tip]` are deliberately *not* treated as alerts, and
 * `[!TIP] trailing text` on the same line is a normal blockquote.
 */
const ALERT_MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][^\S\r\n]*(?:\r?\n|$)/;

/** Narrow an arbitrary string to a known alert kind. */
export function isGithubAlertType(value: string): value is GithubAlertType {
  return (GITHUB_ALERT_TYPES as readonly string[]).includes(value);
}

/** The on-disk marker (`[!TYPE]`, upper-cased) for an alert of the given kind. */
export function githubAlertMarker(name: string): string {
  return `[!${name.toUpperCase()}]`;
}

/**
 * Build the MDAST container-directive node for a GitHub alert that wraps `children`.
 *
 * The counterpart to `createAdmonitionDirectiveNode` (in `lib/admonition.ts`), but it stamps the
 * `data.githubAlert` provenance flag. That flag is the single discriminator the rest of the feature
 * keys on: {@link isGithubAlertDirective} matches it so {@link githubAlertDirectiveDescriptor} renders
 * the block as a callout, and {@link githubAlertToMarkdownExtension} serialises it back to `> [!TYPE]`
 * blockquote syntax rather than to `:::type`. The toolbar's "insert GitHub alert" control uses this for
 * both the empty-insert (`children: []`) and wrap-selection paths.
 */
export function createGithubAlertDirectiveNode(
  name: GithubAlertType,
  children: Array<BlockContent | DefinitionContent>
): ContainerDirective {
  return { type: "containerDirective", name, data: { githubAlert: true }, children };
}

/**
 * True for a container directive synthesised from a GitHub alert — i.e. one
 * carrying the `githubAlert` provenance flag and a recognised kind. This is the
 * single discriminator the renderer and the exporter use to tell alert
 * directives apart from `:::` admonitions that happen to share a name.
 */
export function isGithubAlertDirective(node: unknown): node is ContainerDirective {
  if (typeof node !== "object" || node === null) {
    return false;
  }
  const candidate = node as Partial<ContainerDirective>;
  return (
    candidate.type === "containerDirective" &&
    candidate.data?.githubAlert === true &&
    typeof candidate.name === "string" &&
    isGithubAlertType(candidate.name)
  );
}

/**
 * Convert a blockquote into the equivalent admonition container directive, or
 * return `null` when the blockquote is not a GitHub alert.
 *
 * The marker line is removed: in the common `> [!TIP]\n> body` shape — which
 * parses as a single paragraph whose text is `"[!TIP]\nbody"` — the body text
 * stays in that paragraph; when the marker stands alone the now-empty paragraph
 * is dropped. Every remaining block carries over verbatim as the directive's
 * children, so the alert body survives intact.
 */
export function blockquoteToAlertDirective(blockquote: Blockquote): ContainerDirective | null {
  const [firstBlock, ...restBlocks] = blockquote.children;
  if (firstBlock?.type !== "paragraph") {
    return null;
  }
  const firstInline = firstBlock.children[0];
  if (firstInline?.type !== "text") {
    return null;
  }
  const match = ALERT_MARKER.exec(firstInline.value);
  if (!match) {
    return null;
  }

  const name = match[1].toLowerCase() as GithubAlertType;
  const remainder = firstInline.value.slice(match[0].length);
  const leadingInlines: PhrasingContent[] =
    remainder.length > 0
      ? [{ ...firstInline, value: remainder }, ...firstBlock.children.slice(1)]
      : firstBlock.children.slice(1);

  const children: Array<BlockContent | DefinitionContent> = [];
  if (leadingInlines.length > 0) {
    children.push({ ...firstBlock, children: leadingInlines });
  }
  children.push(...restBlocks);

  return { type: "containerDirective", name, data: { githubAlert: true }, children } as ContainerDirective;
}

/**
 * In-place MDAST transform (a `mdast-util-from-markdown` `transforms` entry):
 * rewrite every GitHub-alert blockquote anywhere in the tree into a tagged
 * container directive, recursing through the tree — including into the
 * directives just produced — so nested alerts are handled too.
 */
export function transformTreeAlertsToDirectives(tree: Root): void {
  walk(tree);
}

function walk(parent: { children: RootContent[] }): void {
  parent.children = parent.children.map((child) => {
    let next: RootContent = child;
    if (child.type === "blockquote") {
      const directive = blockquoteToAlertDirective(child);
      if (directive) {
        next = directive;
      }
    }
    if ("children" in next && Array.isArray((next as { children?: unknown }).children)) {
      walk(next as unknown as { children: RootContent[] });
    }
    return next;
  });
}

// The directives plugin's own container-directive serializer, reused to render
// ordinary `:::` admonitions when our handler declines an untagged directive.
const serializeDirectiveContainer = directiveToMarkdown().handlers?.containerDirective;
if (!serializeDirectiveContainer) {
  throw new Error("mdast-util-directive did not provide a containerDirective serializer");
}

/** Prefix a rendered block line with `> ` (blank lines get a bare `>`), as a blockquote does. */
function quote(line: string, _index: number, blank: boolean): string {
  return ">" + (blank ? "" : " ") + line;
}

/**
 * Serialize a GitHub-alert directive as a `> [!TYPE]` blockquote.
 *
 * The marker line is written as a controlled raw string so its brackets are NOT
 * escaped — `mdast-util-to-markdown` would otherwise emit `\[!TIP]`, which GitHub
 * does not recognise as an alert. The body is rendered with the same `state`
 * machinery the stock blockquote handler uses, so nested blocks (lists, code,
 * paragraphs) indent under `> ` correctly.
 */
function alertToMarkdown(node: ContainerDirective, state: State, info: Info): string {
  const exit = state.enter("blockquote");
  const tracker = state.createTracker(info);
  tracker.move("> ");
  tracker.shift(2);
  const body = state.indentLines(state.containerFlow(node, tracker.current()), quote);
  exit();
  const marker = `> ${githubAlertMarker(node.name)}`;
  return body ? `${marker}\n${body}` : marker;
}

/**
 * `mdast-util-to-markdown` extension that intercepts container directives: GitHub
 * alerts (tagged `data.githubAlert`) serialise to `> [!TYPE]` blockquotes, while
 * every other container directive is delegated to the directives plugin's own
 * serializer so authored `:::` admonitions keep emitting `:::`.
 *
 * Register this *after* the directives plugin's extension so its
 * `containerDirective` handler wins (later extensions override earlier ones for a
 * given node type).
 */
export const githubAlertToMarkdownExtension: Options = {
  handlers: {
    containerDirective(node: ContainerDirective, parent: Parents | undefined, state: State, info: Info): string {
      if (isGithubAlertDirective(node)) {
        return alertToMarkdown(node, state, info);
      }
      return serializeDirectiveContainer(node, parent, state, info);
    }
  }
};
