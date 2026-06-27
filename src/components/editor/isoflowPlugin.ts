import {
  addExportVisitor$,
  addImportVisitor$,
  addLexicalNode$,
  realmPlugin
} from "@mdxeditor/editor";
import {
  IsoflowImageNode,
  LexicalIsoflowImageVisitor,
  MdastIsoflowImageVisitor
} from "./IsoflowImageNode";

/**
 * MDXEditor plugin adding editable isoflow diagrams. A diagram is just a Markdown image whose source
 * is an editable SVG (a PNG snapshot carrying the isoflow model in `data-isoflow` — see
 * `lib/isoflowSvg.ts`), so no new Markdown syntax is introduced and the import/export sides reuse the
 * stock `image` mdast node:
 *
 * - **import** — {@link MdastIsoflowImageVisitor} runs ahead of MDXEditor's built-in image visitor
 *   (higher priority) and upgrades only images whose URL carries embedded isoflow source to an
 *   {@link IsoflowImageNode}; every other image (including drawio diagrams) falls through.
 * - **export** — {@link LexicalIsoflowImageVisitor} serialises an {@link IsoflowImageNode} straight
 *   back to a plain Markdown `image`, so the document degrades to a normal picture everywhere else.
 *
 * Pair with `imagePlugin`; registration order relative to `drawioPlugin` is irrelevant since the
 * import side is resolved by visitor priority and the export visitors match disjoint Lexical nodes.
 */
export const isoflowPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addLexicalNode$]: IsoflowImageNode,
      [addImportVisitor$]: MdastIsoflowImageVisitor,
      [addExportVisitor$]: LexicalIsoflowImageVisitor
    });
  }
});
