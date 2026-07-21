import {
  addExportVisitor$,
  addImportVisitor$,
  addLexicalNode$,
  realmPlugin
} from "@mdxeditor/editor";
import {
  InlineMathNode,
  LexicalInlineMathVisitor,
  MdastInlineMathVisitor
} from "./InlineMathNode";

/** Render portable `math:...` inline-code spans as inline KaTeX in rich-text mode. */
export const inlineMathPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addLexicalNode$]: InlineMathNode,
      [addImportVisitor$]: MdastInlineMathVisitor,
      [addExportVisitor$]: LexicalInlineMathVisitor
    });
  }
});
