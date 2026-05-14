import { createRootEditorSubscription$, realmPlugin } from "@mdxeditor/editor";
import { $handleListInsertParagraph, $isListItemNode, ListItemNode } from "@lexical/list";
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  KEY_ENTER_COMMAND,
  type LexicalNode
} from "lexical";
import { $getNearestNodeOfType } from "@lexical/utils";

function isEmptyListItemChild(node: LexicalNode) {
  const type = node.getType();

  if ($isTextNode(node) || type === "paragraph" || type === "linebreak") {
    return node.getTextContent().trim().length === 0;
  }

  return false;
}

function getEmptySelectedListItem() {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return null;
  }

  const anchorNode = selection.anchor.getNode();
  const listItem = $isListItemNode(anchorNode)
    ? anchorNode
    : $getNearestNodeOfType(anchorNode, ListItemNode);

  if (!listItem) {
    return null;
  }

  const children = listItem.getChildren();
  if (children.length === 0 || children.every(isEmptyListItemChild)) {
    return listItem;
  }

  return null;
}

export const listExitPlugin = realmPlugin({
  init(realm) {
    realm.pub(createRootEditorSubscription$, (editor) => {
      return editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          if (event?.shiftKey || event?.altKey || event?.ctrlKey || event?.metaKey) {
            return false;
          }

          const listItem = getEmptySelectedListItem();
          if (!listItem) {
            return false;
          }

          event?.preventDefault();
          listItem.clear();
          listItem.selectStart();
          return $handleListInsertParagraph();
        },
        COMMAND_PRIORITY_HIGH
      );
    });
  }
});
