import {
  addExportVisitor$,
  addImportVisitor$,
  addLexicalNode$,
  addMdastExtension$,
  addSyntaxExtension$,
  addToMarkdownExtension$,
  realmPlugin
} from "@mdxeditor/editor";
import {
  footnoteFromMarkdownExtension,
  footnoteSyntaxExtension,
  footnoteToMarkdownExtension
} from "../../lib/footnotes";
import {
  FootnoteReferenceNode,
  LexicalFootnoteReferenceVisitor,
  MdastFootnoteReferenceVisitor
} from "./FootnoteReferenceNode";
import {
  FootnoteDefinitionNode,
  LexicalFootnoteDefinitionVisitor,
  MdastFootnoteDefinitionVisitor
} from "./FootnoteDefinitionNode";

/**
 * MDXEditor plugin adding GitHub-flavoured Markdown footnotes (`[^1]` references
 * and `[^1]: …` definitions) to both editor surfaces:
 *
 * - **Markdown / source view** — the three stock `gfm-footnote` extensions teach
 *   the parser/serializer the syntax: a micromark syntax extension to tokenise
 *   `[^…]` (without it the parser sees literal text), a from-markdown extension to
 *   build `footnoteReference` / `footnoteDefinition` MDAST nodes, and a to-markdown
 *   extension to serialise them back. This mirrors how MDXEditor's core wires
 *   strikethrough.
 * - **Rich text view** — Lexical nodes plus import/export visitors render a
 *   reference as a superscript ({@link FootnoteReferenceNode}) and a definition as
 *   an editable block ({@link FootnoteDefinitionNode}), and convert each MDAST node
 *   to/from its Lexical node.
 *
 * Footnotes are distinct MDAST node types, so — unlike the GitHub-alerts plugin,
 * which shares `containerDirective` with admonitions — this plugin's serialisers
 * never collide with the directive plugins; registration order is irrelevant.
 */
export const footnotesPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addSyntaxExtension$]: footnoteSyntaxExtension(),
      [addMdastExtension$]: footnoteFromMarkdownExtension(),
      [addToMarkdownExtension$]: footnoteToMarkdownExtension(),
      [addLexicalNode$]: [FootnoteReferenceNode, FootnoteDefinitionNode],
      [addImportVisitor$]: [MdastFootnoteReferenceVisitor, MdastFootnoteDefinitionVisitor],
      [addExportVisitor$]: [LexicalFootnoteReferenceVisitor, LexicalFootnoteDefinitionVisitor]
    });
  }
});
