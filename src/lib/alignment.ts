/**
 * Pure, editor-independent helpers behind the toolbar's left / center / right alignment controls.
 *
 * Markdown has no native block alignment, so Nexus persists it the GitHub-portable way: a centered or
 * right-aligned block is wrapped in `<div align="center">` … `</div>` (GitHub honours the `align`
 * attribute but strips `style`, so `align` is the choice that renders everywhere). Left is the document
 * default and is therefore never written — clicking "Left" simply removes any wrapper.
 *
 * Internally the alignment is carried as the Lexical *element format* of the paragraph/heading, so it
 * behaves like a normal editor toggle rather than a wrapper you tab into. This module owns the
 * runtime-independent glue between that format and the on-disk `<div>`:
 *
 * - **import** — MDXEditor parses raw `<div>` as an MDX JSX element (`mdxJsxFlowElement`) that nests the
 *   wrapped blocks as children; left to itself it becomes an opaque "generic HTML" node. {@link
 *   transformTreeDivAlignToData} runs first (as a `from-markdown` transform), folding each aligned
 *   `<div>` back onto a `data.align` flag on the paragraph/heading it wrapped and dropping the wrapper,
 *   so the block re-enters the editor as a normally-aligned paragraph/heading;
 * - **export** — {@link alignmentToMarkdownExtension} (a `to-markdown` extension) re-wraps any
 *   paragraph/heading carrying `data.align` in `<div align="…">`, delegating the inner serialization to
 *   the stock handler so headings, inline marks, etc. emit exactly as they normally would. The blank
 *   lines around the body are what let the wrapper re-parse and render as Markdown elsewhere.
 *
 * The Lexical wiring (the import/export visitors that bridge `data.align` to a real element format, and
 * the realm plugin) lives in `components/editor/alignmentPlugin.ts`; the toolbar control is
 * `components/editor/InsertAlignment.tsx`. Everything here operates on MDAST and strings so it can be
 * unit-tested without standing up an editor.
 */
import type { Heading, Paragraph, Parents, Root, RootContent } from "mdast";
import { defaultHandlers } from "mdast-util-to-markdown";
import type { Info, Options, State } from "mdast-util-to-markdown";

/** The three alignment options the toolbar offers, in display order. */
export const ALIGNMENTS = ["left", "center", "right"] as const;

export type Alignment = (typeof ALIGNMENTS)[number];

/**
 * The alignments that are actually written to disk. "Left" is the Markdown default, so it is represented
 * by the *absence* of a wrapper rather than `<div align="left">` — only these two ever produce markup or
 * a stored `data.align`.
 */
export const PERSISTED_ALIGNMENTS = ["center", "right"] as const;

export type PersistedAlignment = (typeof PERSISTED_ALIGNMENTS)[number];

declare module "unist" {
  interface Data {
    /**
     * Set by {@link transformTreeDivAlignToData} on a paragraph/heading that was wrapped in
     * `<div align="…">`, so the import visitor can restore the block's Lexical element format and the
     * export side can re-emit the wrapper. Only ever `center`/`right`; left-aligned content carries no
     * flag. Internal to the import/export round-trip — it is not part of the authored Markdown.
     */
    align?: PersistedAlignment;
  }
}

/** Narrow an arbitrary value to one of the toolbar's alignment options. */
export function isAlignment(value: unknown): value is Alignment {
  return typeof value === "string" && (ALIGNMENTS as readonly string[]).includes(value);
}

/** Narrow an arbitrary value to a persisted (non-default) alignment. */
export function isPersistedAlignment(value: unknown): value is PersistedAlignment {
  return typeof value === "string" && (PERSISTED_ALIGNMENTS as readonly string[]).includes(value);
}

/**
 * Map a Lexical element format type (`''`, `'left'`, `'center'`, `'right'`, `'justify'`, …) to the
 * persisted alignment it should serialise as, or `undefined` when the block is left/default and needs no
 * wrapper. Used by the export visitor to decide whether to stamp `data.align`.
 */
export function lexicalFormatToAlign(format: string): PersistedAlignment | undefined {
  return isPersistedAlignment(format) ? format : undefined;
}

/** The persisted alignment stored on an MDAST node, if any. */
export function mdastAlign(node: Paragraph | Heading): PersistedAlignment | undefined {
  const align = node.data?.align;
  return isPersistedAlignment(align) ? align : undefined;
}

// ---------------------------------------------------------------------------
// Import: `<div align="…">` (an mdxJsxFlowElement) -> `data.align` on its blocks
// ---------------------------------------------------------------------------

/** The mdast JSX-element node types MDXEditor produces for raw HTML tags like `<div>`. */
const MDX_JSX_ELEMENT_TYPES = ["mdxJsxFlowElement", "mdxJsxTextElement"];

/** Minimal structural view of those JSX-element nodes (they live outside the base `mdast` types). */
interface MdxJsxElementLike {
  type: string;
  name: string | null;
  attributes: Array<{ type?: string; name?: string | null; value?: unknown }>;
  children: RootContent[];
}

/** View a node as an MDX JSX element, or `null` if it is an ordinary mdast node. */
function asMdxJsxElement(node: RootContent): MdxJsxElementLike | null {
  const candidate = node as unknown as Partial<MdxJsxElementLike>;
  if (
    typeof candidate.type === "string" &&
    MDX_JSX_ELEMENT_TYPES.includes(candidate.type) &&
    Array.isArray(candidate.attributes) &&
    Array.isArray(candidate.children)
  ) {
    return candidate as MdxJsxElementLike;
  }
  return null;
}

/** The alignment named by a `<div align="…">` element, or `null` if the node is not one. */
function divElementAlignment(element: MdxJsxElementLike): Alignment | null {
  if (element.name !== "div") {
    return null;
  }
  for (const attribute of element.attributes) {
    if (attribute.type === "mdxJsxAttribute" && attribute.name === "align" && typeof attribute.value === "string") {
      const value = attribute.value.trim().toLowerCase();
      if (isAlignment(value)) {
        return value;
      }
    }
  }
  return null;
}

/** Blocks that can carry an alignment — the ones people centre in practice and that round-trip cleanly. */
function isAlignableBlock(node: RootContent): node is Paragraph | Heading {
  return node.type === "paragraph" || node.type === "heading";
}

/**
 * Record an alignment on a block. Left needs no flag — it is the default — so it is silently dropped.
 * Innermost wins: a block already stamped (by a nested `<div>`) is left alone.
 */
function stampAlignment(node: Paragraph | Heading, alignment: Alignment): void {
  if (alignment === "left") {
    return;
  }
  node.data = node.data ?? {};
  if (node.data.align == null) {
    node.data.align = alignment;
  }
}

function hasChildren(node: RootContent): node is RootContent & { children: RootContent[] } {
  return "children" in node && Array.isArray((node as { children?: unknown }).children);
}

/**
 * Rewrite a list of siblings, replacing each aligned `<div>` whose children are *all* alignable blocks
 * with those blocks, each stamped with the alignment. Divs that wrap anything else (lists, tables, mixed
 * content) are left for MDXEditor's generic-HTML handling. Nesting is resolved depth-first so an inner
 * alignment wins over an outer one.
 */
function foldChildren(children: RootContent[]): RootContent[] {
  const out: RootContent[] = [];

  for (const node of children) {
    // Resolve nested content first, so an inner `<div>` has already stamped its blocks before an outer
    // one tries to.
    if (hasChildren(node)) {
      node.children = foldChildren(node.children);
    }

    const element = asMdxJsxElement(node);
    const alignment = element ? divElementAlignment(element) : null;
    if (
      element &&
      alignment &&
      element.children.length > 0 &&
      element.children.every(isAlignableBlock)
    ) {
      for (const child of element.children) {
        stampAlignment(child, alignment);
      }
      out.push(...element.children);
    } else {
      out.push(node);
    }
  }

  return out;
}

/**
 * `from-markdown` transform (an `mdast-util-from-markdown` `transforms` entry) that folds the
 * `<div align="…">` wrappers a document was saved with back into `data.align` flags on the wrapped
 * paragraphs/headings, recursing through the whole tree so wrappers inside lists, blockquotes, etc. are
 * handled too. Must run ahead of MDXEditor's generic-HTML import visitor; register via
 * `addMdastExtension$`.
 */
export function transformTreeDivAlignToData(tree: Root): void {
  tree.children = foldChildren(tree.children);
}

// ---------------------------------------------------------------------------
// Export: `data.align` on a block  ->  `<div align="…">` … `</div>`
// ---------------------------------------------------------------------------

/**
 * Wrap an already-serialised block in `<div align="…">`. The blank lines around the body are required:
 * GitHub only renders the inner Markdown when block-level HTML is separated from its content by blank
 * lines, and they let the wrapper round-trip back through the parser as an element with Markdown
 * children rather than one opaque block.
 */
function wrapInAlignDiv(serialized: string, alignment: PersistedAlignment): string {
  return `<div align="${alignment}">\n\n${serialized}\n\n</div>`;
}

/**
 * `mdast-util-to-markdown` extension that re-emits the alignment wrapper: a paragraph or heading carrying
 * `data.align` is serialised with the stock handler and then wrapped in `<div align="…">`. Blocks without
 * the flag delegate straight to the default, so ordinary content is untouched.
 */
export const alignmentToMarkdownExtension: Options = {
  handlers: {
    paragraph(node: Paragraph, parent: Parents | undefined, state: State, info: Info): string {
      const serialized = defaultHandlers.paragraph(node, parent, state, info);
      const alignment = mdastAlign(node);
      return alignment ? wrapInAlignDiv(serialized, alignment) : serialized;
    },
    heading(node: Heading, parent: Parents | undefined, state: State, info: Info): string {
      const serialized = defaultHandlers.heading(node, parent, state, info);
      const alignment = mdastAlign(node);
      return alignment ? wrapInAlignDiv(serialized, alignment) : serialized;
    }
  }
};
