import {
  $createDirectiveNode,
  ButtonOrDropdownButton,
  activeEditor$,
  exportLexicalTreeToMdast,
  exportVisitors$,
  insertDirective$,
  jsxComponentDescriptors$,
  jsxIsAvailable$,
  rootEditor$
} from "@mdxeditor/editor";
import { usePublisher, useRealm } from "@mdxeditor/gurx";
import { $getSelection, $isRangeSelection } from "lexical";
import type { ReactNode } from "react";
import type { DirectiveNode } from "@mdxeditor/editor";
import type { BlockContent, DefinitionContent } from "mdast";
import type { ContainerDirective } from "mdast-util-directive";
import { dedupeBlocksByKey } from "../../lib/admonition";

/** One entry in the split button's dropdown — a directive kind plus its display label. */
export interface DirectiveControlItem {
  value: string;
  label: string;
}

export interface InsertDirectiveControlProps {
  /** Tooltip / accessible label for the split button. */
  title: string;
  /** Dropdown entries, one per directive kind, in display order. */
  items: DirectiveControlItem[];
  /** Narrow a chosen dropdown value to a kind this control accepts, before building a node from it. */
  isValidType: (value: string) => boolean;
  /**
   * Build the MDAST container directive for the chosen kind, wrapping `children` (empty for a bare
   * insert). This is the only behaviour that varies between callers: the admonition builder emits a
   * plain `:::` directive, while the GitHub-alert builder stamps `data.githubAlert` so the block
   * serialises back to `> [!TYPE]`.
   */
  createMdastNode: (name: string, children: Array<BlockContent | DefinitionContent>) => ContainerDirective;
  /** Button glyph (an icon element). */
  children: ReactNode;
}

/**
 * Shared toolbar control behind both the `:::` admonition button and the `> [!TYPE]` GitHub-alert
 * button — the two differ only in their kind list, validation guard, node builder, and icon, all
 * supplied as props.
 *
 * When the user picks a kind with a non-empty selection, the chosen directive *wraps* the selected
 * block(s) instead of being dropped in empty. We grab the top-level blocks the selection covers, export
 * each back to MDAST with the editor's own export visitors, hand those nodes to the new directive as its
 * children, then swap the originals out for the directive. Selecting nothing falls back to MDXEditor's
 * insert signal, so a bare click inserts an empty directive.
 *
 * Wrapping is block-granular: selecting part of a paragraph still wraps the whole paragraph, since a
 * directive's content is a sequence of blocks — there is no way to keep half a block outside it.
 */
function InsertDirectiveControl({
  title,
  items,
  isValidType,
  createMdastNode,
  children
}: InsertDirectiveControlProps) {
  const realm = useRealm();
  const insertDirective = usePublisher(insertDirective$);

  function handleChoose(value: string) {
    if (!isValidType(value)) {
      return;
    }

    const editor = realm.getValue(activeEditor$) ?? realm.getValue(rootEditor$);
    if (!editor) {
      return;
    }

    // Decide whether there is content to wrap before touching the editor. With no (or an empty)
    // selection we publish MDXEditor's insert signal for an empty directive; that has to happen
    // outside `editor.update`, so branch here first.
    let hasSelection = false;
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      hasSelection = $isRangeSelection(selection) && !selection.isCollapsed();
    });

    if (!hasSelection) {
      insertDirective(createMdastNode(value, []));
      return;
    }

    const exportVisitors = realm.getValue(exportVisitors$);
    const jsxComponentDescriptors = realm.getValue(jsxComponentDescriptors$);
    const jsxIsAvailable = realm.getValue(jsxIsAvailable$);

    let createdNode: DirectiveNode | null = null;

    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || selection.isCollapsed()) {
        return;
      }

      // Every node the selection touches maps to its enclosing top-level block; dedupe to the set of
      // blocks to wrap, in document order. (`getTopLevelElement` is null only for the root itself.)
      const blocks = dedupeBlocksByKey(
        selection
          .getNodes()
          .map((node) => node.getTopLevelElement())
          .filter((node): node is NonNullable<typeof node> => node !== null)
      );

      if (blocks.length === 0) {
        return;
      }

      // Export each block back to an MDAST node so it can live as the directive's content. Exporting a
      // single block returns that block's MDAST node (the export seeds its unist root from the first
      // node it visits), which is exactly one entry of the directive's children.
      const childBlocks: Array<BlockContent | DefinitionContent> = blocks.map(
        (block) =>
          exportLexicalTreeToMdast({
            root: block,
            visitors: exportVisitors,
            jsxComponentDescriptors,
            jsxIsAvailable,
            addImportStatements: false
          }) as unknown as BlockContent | DefinitionContent
      );

      createdNode = $createDirectiveNode(createMdastNode(value, childBlocks));

      blocks[0].insertBefore(createdNode);
      for (const block of blocks) {
        block.remove();
      }
    });

    // Focus the new directive's nested editor once it has mounted, mirroring the stock insert so the
    // caret lands inside the wrapped content rather than back in the document.
    setTimeout(() => {
      createdNode?.select();
    });
  }

  return (
    <ButtonOrDropdownButton title={title} onChoose={handleChoose} items={items}>
      {children}
    </ButtonOrDropdownButton>
  );
}

export default InsertDirectiveControl;
