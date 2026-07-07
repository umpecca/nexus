/**
 * Rich-text nicety: pasting a URL while text is selected wraps the selection in a link instead of
 * replacing it with the raw address. We only hijack a lone-URL plain-text paste over a non-collapsed
 * selection; rich (HTML) pastes, image pastes, and collapsed carets fall through to the normal paste.
 *
 * Registered at HIGH priority so the image plugin's CRITICAL paste handler still wins for images, while
 * we still beat Lexical's default text paste (registered at EDITOR priority). Returning true stops the
 * default paste so the URL text is not also inserted.
 */
import { createRootEditorSubscription$, realmPlugin } from "@mdxeditor/editor";
import { TOGGLE_LINK_COMMAND } from "@lexical/link";
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_HIGH, PASTE_COMMAND } from "lexical";
import { extractPastedUrl } from "../../lib/pasteLink";

export const pasteLinkPlugin = realmPlugin({
  init(realm) {
    realm.pub(createRootEditorSubscription$, (editor) => {
      return editor.registerCommand(
        PASTE_COMMAND,
        (event: ClipboardEvent) => {
          const clipboardData = event.clipboardData;
          if (!clipboardData) {
            return false;
          }

          // A rich (HTML) paste already carries its own links/formatting — leave it to normal paste.
          if (clipboardData.getData("text/html")) {
            return false;
          }

          const url = extractPastedUrl(clipboardData.getData("text/plain"));
          if (!url) {
            return false;
          }

          const selection = $getSelection();
          if (!$isRangeSelection(selection) || selection.isCollapsed()) {
            return false;
          }

          event.preventDefault();
          editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
          return true;
        },
        COMMAND_PRIORITY_HIGH
      );
    });
  }
});
