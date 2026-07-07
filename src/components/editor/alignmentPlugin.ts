/**
 * MDXEditor plugin that round-trips block alignment between a paragraph/heading's Lexical *element
 * format* and the `<div align="…">` wrapper it is stored as on disk.
 *
 * The runtime-independent half — the `<div>` ⇄ `data.align` parsing and serialization — lives in
 * `lib/alignment.ts`; this file supplies the four Lexical visitors that bridge `data.align` to a real
 * element format, plus the realm wiring:
 *
 * - **export** — replacement paragraph/heading export visitors stamp `data.align` on the emitted MDAST
 *   node when the Lexical block is centre/right aligned (left/default is left bare), and
 *   {@link alignmentToMarkdownExtension} wraps those in `<div align="…">`;
 * - **import** — {@link transformTreeDivAlignToData} folds the `<div>` wrappers back into `data.align`,
 *   and replacement paragraph/heading import visitors turn that flag into `node.setFormat(...)`.
 *
 * The replacement visitors are registered at a higher priority than MDXEditor's stock ones (which they
 * otherwise mirror exactly) so they win the lookup; everything they do for an unaligned block is
 * identical to the default, so ordinary content is unaffected.
 */
import {
  addExportVisitor$,
  addImportVisitor$,
  addMdastExtension$,
  addToMarkdownExtension$,
  realmPlugin
} from "@mdxeditor/editor";
import type { LexicalExportVisitor, MdastImportVisitor } from "@mdxeditor/editor";
import { $createParagraphNode, $isParagraphNode } from "lexical";
import type { ParagraphNode } from "lexical";
import { $createHeadingNode, $isHeadingNode } from "@lexical/rich-text";
import type { HeadingNode } from "@lexical/rich-text";
import type { Heading, Paragraph } from "mdast";
import {
  alignmentToMarkdownExtension,
  lexicalFormatToAlign,
  mdastAlign,
  transformTreeDivAlignToData
} from "../../lib/alignment";

/** Priority for the replacement visitors — above MDXEditor's defaults (0) so they are chosen first. */
const ALIGNMENT_VISITOR_PRIORITY = 1;

/**
 * Parents whose paragraph children render inline instead of being wrapped in a `ParagraphNode`. Mirrors
 * MDXEditor's own `MdastParagraphVisitor`, which we replace; kept in sync by hand because the list is
 * tiny and stable.
 */
const PARAGRAPH_SKIP_PARENTS = ["listitem", "admonition"];

/** Export visitor: paragraph → MDAST paragraph, carrying `data.align` when centre/right aligned. */
const ParagraphAlignmentExportVisitor: LexicalExportVisitor<ParagraphNode, Paragraph> = {
  testLexicalNode: $isParagraphNode,
  priority: ALIGNMENT_VISITOR_PRIORITY,
  visitLexicalNode: ({ lexicalNode, actions }) => {
    const align = lexicalFormatToAlign(lexicalNode.getFormatType());
    actions.addAndStepInto("paragraph", align ? { data: { align } } : undefined);
  }
};

/** Export visitor: heading → MDAST heading, carrying `data.align` when centre/right aligned. */
const HeadingAlignmentExportVisitor: LexicalExportVisitor<HeadingNode, Heading> = {
  testLexicalNode: $isHeadingNode,
  priority: ALIGNMENT_VISITOR_PRIORITY,
  visitLexicalNode: ({ lexicalNode, actions }) => {
    const depth = Number(lexicalNode.getTag().slice(1)) as Heading["depth"];
    const align = lexicalFormatToAlign(lexicalNode.getFormatType());
    actions.addAndStepInto("heading", align ? { depth, data: { align } } : { depth });
  }
};

/** Import visitor: MDAST paragraph → `ParagraphNode`, restoring the element format from `data.align`. */
const ParagraphAlignmentImportVisitor: MdastImportVisitor<Paragraph> = {
  testNode: "paragraph",
  priority: ALIGNMENT_VISITOR_PRIORITY,
  visitNode: ({ mdastNode, lexicalParent, actions }) => {
    if (PARAGRAPH_SKIP_PARENTS.includes(lexicalParent.getType())) {
      actions.visitChildren(mdastNode, lexicalParent);
      return;
    }
    const paragraph = $createParagraphNode();
    const align = mdastAlign(mdastNode);
    if (align) {
      paragraph.setFormat(align);
    }
    actions.addAndStepInto(paragraph);
  }
};

/** Import visitor: MDAST heading → `HeadingNode`, restoring the element format from `data.align`. */
const HeadingAlignmentImportVisitor: MdastImportVisitor<Heading> = {
  testNode: "heading",
  priority: ALIGNMENT_VISITOR_PRIORITY,
  visitNode: ({ mdastNode, actions }) => {
    const heading = $createHeadingNode(`h${mdastNode.depth}`);
    const align = mdastAlign(mdastNode);
    if (align) {
      heading.setFormat(align);
    }
    actions.addAndStepInto(heading);
  }
};

export const alignmentPlugin = realmPlugin({
  init(realm) {
    realm.pub(addImportVisitor$, [ParagraphAlignmentImportVisitor, HeadingAlignmentImportVisitor]);
    realm.pub(addExportVisitor$, [ParagraphAlignmentExportVisitor, HeadingAlignmentExportVisitor]);
    realm.pub(addMdastExtension$, { transforms: [transformTreeDivAlignToData] });
    realm.pub(addToMarkdownExtension$, alignmentToMarkdownExtension);
  }
});
