import { EditorView } from "@codemirror/view";
import {
  buildImagesMarkdown,
  getPasteImageFiles,
  readImageFileAsDataUrl
} from "../../lib/imagePaste";

/**
 * Source-mode (CodeMirror) counterpart to the rich-text image-paste support. When the clipboard
 * holds image data, insert it at the cursor as a base64 markdown image instead of letting CodeMirror
 * drop nothing — an image clipboard carries no text for the default paste to use. Reading the blob is
 * async, so we preventDefault synchronously and dispatch the insert once the data URL is ready.
 *
 * Returned as a CodeMirror extension and added only to the source/diff editor (not code blocks), so a
 * plain text paste is untouched. Read-only views (the diff comparison) are skipped.
 */
export function sourceImagePasteExtension() {
  return EditorView.domEventHandlers({
    paste(event, view) {
      if (view.state.readOnly) {
        return false;
      }

      const files = getPasteImageFiles(event.clipboardData);
      if (files.length === 0) {
        return false;
      }

      event.preventDefault();

      void Promise.all(files.map((file) => readImageFileAsDataUrl(file)))
        .then((dataUrls) => {
          const insert = buildImagesMarkdown(dataUrls);
          const { from, to } = view.state.selection.main;
          view.dispatch({
            changes: { from, to, insert },
            selection: { anchor: from + insert.length }
          });
        })
        .catch(() => {
          // Reading the image failed; insert nothing rather than surfacing an unhandled rejection.
        });

      return true;
    }
  });
}
