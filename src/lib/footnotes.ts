/**
 * Pure, editor-independent helpers for GitHub-flavoured Markdown *footnotes* — the
 * inline reference `[^1]` and its block definition `[^1]: …`.
 *
 * Unlike GitHub *alerts* (which Nexus synthesises from blockquotes in
 * `lib/githubAlerts.ts`), footnotes are a first-class micromark/mdast construct, so
 * the parse and serialise sides are the stock `micromark-extension-gfm-footnote` /
 * `mdast-util-gfm-footnote` extensions — wrapped here so the editor wiring and the
 * tests share a single definition. This module owns only the Markdown ⇄ MDAST
 * surface (extensions + node guards + the display label); the MDXEditor wiring is
 * the thin realm plugin in `components/editor/footnotesPlugin.ts`, and the
 * rich-text renderers are the Lexical nodes in
 * `components/editor/FootnoteReferenceNode.tsx` and
 * `components/editor/FootnoteDefinitionNode.tsx`.
 */
import type { FootnoteDefinition, FootnoteReference } from "mdast";
import { gfmFootnote } from "micromark-extension-gfm-footnote";
import { gfmFootnoteFromMarkdown, gfmFootnoteToMarkdown } from "mdast-util-gfm-footnote";
import type { Extension as MicromarkExtension } from "micromark-util-types";
import type { Extension as MdastFromMarkdownExtension } from "mdast-util-from-markdown";
import type { Options as ToMarkdownExtension } from "mdast-util-to-markdown";

/**
 * micromark syntax extension that tokenises `[^id]` references and `[^id]:`
 * definitions. Without this the parser treats `[^1]` as literal text, so it must
 * be registered through MDXEditor's `addSyntaxExtension$` (mirroring how the core
 * wires `gfmStrikethrough()`).
 */
export function footnoteSyntaxExtension(): MicromarkExtension {
  return gfmFootnote();
}

/** `mdast-util-from-markdown` extension that builds `footnoteReference` / `footnoteDefinition` nodes. */
export function footnoteFromMarkdownExtension(): MdastFromMarkdownExtension {
  return gfmFootnoteFromMarkdown();
}

/** `mdast-util-to-markdown` extension that serialises footnote nodes back to `[^id]` / `[^id]: …`. */
export function footnoteToMarkdownExtension(): ToMarkdownExtension {
  return gfmFootnoteToMarkdown();
}

/** Narrow an arbitrary node to an inline footnote reference (`[^id]`). */
export function isFootnoteReference(node: unknown): node is FootnoteReference {
  return isNodeOfType(node, "footnoteReference");
}

/** Narrow an arbitrary node to a block footnote definition (`[^id]: …`). */
export function isFootnoteDefinition(node: unknown): node is FootnoteDefinition {
  return isNodeOfType(node, "footnoteDefinition");
}

function isNodeOfType(node: unknown, type: string): boolean {
  return typeof node === "object" && node !== null && (node as { type?: unknown }).type === type;
}

/**
 * The marker shown for a reference or definition in rich text. GitHub renumbers
 * footnotes `1..n` by order of first reference, but that numbering needs the
 * whole-document context a single Lexical node lacks; showing the author's own
 * identifier (`1`, `longnote`, `2`) is unambiguous and visibly ties each reference
 * to its definition. `label` carries the original casing where present, falling
 * back to the normalised `identifier`.
 */
export function footnoteLabel(node: FootnoteReference | FootnoteDefinition): string {
  return node.label ?? node.identifier;
}

/**
 * The identifier for a freshly inserted footnote: the smallest positive integer
 * (as a string) not already taken by an existing reference or definition. Existing
 * non-numeric identifiers (e.g. `longnote`) are stepped over, never renumbered, so a
 * fresh insert can never collide with one the author wrote by hand.
 */
export function nextFootnoteIdentifier(existingIdentifiers: readonly string[]): string {
  const used = new Set(existingIdentifiers);
  let candidate = 1;
  while (used.has(String(candidate))) {
    candidate += 1;
  }
  return String(candidate);
}

/**
 * Normalise a typed footnote name to its `identifier` the way the GFM parser does, so a
 * name entered in the editor links to references/definitions parsed from Markdown (a
 * typed `LongNote` matches a parsed `[^longnote]`). Footnote labels forbid whitespace
 * (see {@link isValidFootnoteIdentifier}), so this is just trim + lower-case; the typed
 * casing is preserved separately as the node's `label` for display and serialisation.
 */
export function normalizeFootnoteIdentifier(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Whether `name` is acceptable as a custom footnote identifier. GFM footnote labels may
 * not contain whitespace or `[`; we restrict further to a conservative, escape-free
 * subset — Unicode letters and digits plus `.`, `-`, `_` — so the name always
 * round-trips through `[^name]` unchanged. Blank names are rejected (the auto-numbered
 * path handles "no name").
 */
export function isValidFootnoteIdentifier(name: string): boolean {
  return /^[\p{L}\p{N}._-]+$/u.test(name.trim());
}
