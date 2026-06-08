/**
 * Pure helpers behind the toolbar's "insert admonition" command.
 *
 * The toolbar offers the same five admonition kinds MDXEditor ships with. When the user clicks one
 * with a non-empty selection, we wrap the selected block(s) inside the chosen admonition instead of
 * dropping in an empty one; the Lexical/MDAST glue for that lives in `InsertAdmonition.tsx`, while
 * the runtime-independent pieces — the kind list, the validation guard, the MDAST node builder, and
 * the block-deduplication used to turn a selection into the set of blocks to wrap — live here so
 * they can be unit-tested without standing up an editor.
 */

import type { BlockContent, DefinitionContent } from "mdast";
import type { ContainerDirective } from "mdast-util-directive";

/**
 * The admonition kinds offered by the toolbar, in display order. Mirrors `ADMONITION_TYPES` from
 * `@mdxeditor/editor`'s `AdmonitionDirectiveDescriptor`: the descriptor's `testNode` only recognises
 * these names, so a name we emit must be one of them or the directive will not render.
 */
export const ADMONITION_TYPES = ["note", "tip", "danger", "info", "caution"] as const;

export type AdmonitionType = (typeof ADMONITION_TYPES)[number];

/** Capitalised labels shown in the toolbar dropdown, matching MDXEditor's default admonition labels. */
export const ADMONITION_LABELS: Record<AdmonitionType, string> = {
  note: "Note",
  tip: "Tip",
  danger: "Danger",
  info: "Info",
  caution: "Caution"
};

/** Narrow an arbitrary dropdown value to a known admonition kind before acting on it. */
export function isAdmonitionType(value: string): value is AdmonitionType {
  return (ADMONITION_TYPES as readonly string[]).includes(value);
}

/**
 * Build the MDAST container-directive node for an admonition that wraps `children` (block-level
 * MDAST nodes already exported from the selected Lexical blocks).
 *
 * The shape matches what MDXEditor's own `InsertAdmonition` stores for an empty admonition —
 * `{ type: "containerDirective", name }` — with the wrapped children added. `attributes` is left off
 * (it is optional in the directive schema) so a wrapped admonition serialises to the same
 * `:::name` ... `:::` block an inserted-then-typed one would.
 */
export function createAdmonitionDirectiveNode(
  name: AdmonitionType,
  children: Array<BlockContent | DefinitionContent>
): ContainerDirective {
  return { type: "containerDirective", name, children };
}

/** The minimal slice of a Lexical node that {@link dedupeBlocksByKey} relies on. */
export interface KeyedNode {
  getKey(): string;
}

/**
 * Reduce a list of nodes to the unique entries by key, preserving first-seen order.
 *
 * A range selection reports every node it touches — text runs, inline marks, and the block elements
 * containing them — so mapping each touched node to its top-level block yields the same block many
 * times over. Deduplicating by key collapses those repeats into exactly the blocks to wrap, once
 * each, in document order (the order the selection first reaches them).
 */
export function dedupeBlocksByKey<T extends KeyedNode>(nodes: T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const node of nodes) {
    const key = node.getKey();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(node);
    }
  }
  return unique;
}
