import {
  addExportVisitor$,
  addImportVisitor$,
  addLexicalNode$,
  realmPlugin
} from "@mdxeditor/editor";
import {
  DrawioImageNode,
  LexicalDrawioImageVisitor,
  MdastDrawioImageVisitor
} from "./DrawioImageNode";

/**
 * MDXEditor plugin adding editable drawio diagrams. A diagram is just a Markdown image whose source
 * is an editable SVG (the diagram XML is embedded in the SVG — see `lib/drawioSvg.ts`), so no new
 * Markdown syntax is introduced and the import/export sides reuse the stock `image` mdast node:
 *
 * - **import** — {@link MdastDrawioImageVisitor} runs ahead of MDXEditor's built-in image visitor
 *   (higher priority) and upgrades only images whose URL carries embedded drawio source to a
 *   {@link DrawioImageNode}; every other image falls through to the default handling.
 * - **export** — {@link LexicalDrawioImageVisitor} serialises a {@link DrawioImageNode} straight
 *   back to a plain Markdown `image`, so the document degrades to a normal picture everywhere else.
 *
 * Pair with `imagePlugin`; registration order is irrelevant since the import side is resolved by
 * visitor priority and the two export visitors match disjoint Lexical node types.
 */
export const drawioPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addLexicalNode$]: DrawioImageNode,
      [addImportVisitor$]: MdastDrawioImageVisitor,
      [addExportVisitor$]: LexicalDrawioImageVisitor
    });
  }
});
