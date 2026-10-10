import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  addEditorWrapper$, markdownProcessingError$, markdownSourceEditorValue$,
  onBlur$, readOnly$, realmPlugin, viewMode$, type ViewMode
} from "@mdxeditor/editor";
import { Cell, useCellValues, usePublisher } from "@mdxeditor/gurx";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { basicSetup } from "codemirror";
import ChangeReview from "./ChangeReview";
import { Button } from "../ui/button";
import { hasFoldableImageData, setAllImageDataExpanded } from "./sourceImageFolding";

const comparison$ = Cell("");
const sourceExtensions$ = Cell<Extension[]>([]);
const reviewExtensions$ = Cell<Extension[]>([]);

function SourceEditor() {
  const [value, readOnly, extensions] = useCellValues(markdownSourceEditorValue$, readOnly$, sourceExtensions$);
  const publishMarkdown = usePublisher(markdownSourceEditorValue$);
  const publishBlur = usePublisher(onBlur$);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [hasImages, setHasImages] = useState(false);
  // External setMarkdown updates the existing editor. Ordinary typing publishes only document
  // changes, keeping undo history and display-only image folding out of the Markdown change flow.
  const initialValue = useRef(value);
  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: initialValue.current,
        extensions: [
          ...extensions, basicSetup, markdown(), EditorView.lineWrapping,
          EditorState.readOnly.of(readOnly),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              publishMarkdown(update.state.doc.toString());
              setHasImages(hasFoldableImageData(update.view));
            }
          }),
          EditorView.focusChangeEffect.of((_, focused) => {
            if (!focused) publishBlur(new FocusEvent("blur"));
            return null;
          })
        ]
      })
    });
    viewRef.current = view;
    setHasImages(hasFoldableImageData(view));
    return () => { viewRef.current = null; view.destroy(); };
  }, [extensions, readOnly, publishMarkdown, publishBlur]);

  useEffect(() => {
    initialValue.current = value;
    const view = viewRef.current;
    if (view && view.state.doc.toString() !== value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }
  }, [value]);
  return (
    <div className="nexus-source-view">
      <div className="nexus-source-image-controls" role="group" aria-label="Image data folding">
        <span className="nexus-image-fold-label">Image data</span>
        <Button type="button" size="sm" variant="outline" disabled={!hasImages}
          title="Expand all image data" onClick={() => {
            if (viewRef.current) setAllImageDataExpanded(viewRef.current, true);
          }}>Expand all</Button>
        <Button type="button" size="sm" variant="outline" disabled={!hasImages}
          title="Collapse all image data" onClick={() => {
            if (viewRef.current) setAllImageDataExpanded(viewRef.current, false);
          }}>Collapse all</Button>
      </div>
      <div ref={hostRef} className="cm-sourceView mdxeditor-source-editor" />
    </div>
  );
}

function ReviewSourceWrapper({ children }: { children: ReactNode }) {
  const [error, mode, current, comparison, extensions] = useCellValues(
    markdownProcessingError$, viewMode$, markdownSourceEditorValue$, comparison$, reviewExtensions$
  );
  return (
    <div className="mdxeditor-diff-source-wrapper">
      <div className="mdxeditor-rich-text-editor"
        style={{ display: mode === "rich-text" && error === null ? "block" : "none" }}>
        {children}
      </div>
      {mode === "source" ? <SourceEditor /> : null}
      {mode === "diff" ? (
        <div className="mdxeditor-diff-editor">
          <ChangeReview original={comparison} proposed={current} extensions={extensions}
            originalLabel="Compared version" proposedLabel="Current document" />
        </div>
      ) : null}
    </div>
  );
}

/** Use MDXEditor's public source-mode cells and keep its rich-text tree mounted across modes. */
export const reviewSourcePlugin = realmPlugin<{
  diffMarkdown: string;
  viewMode: ViewMode;
  sourceExtensions: Extension[];
  reviewExtensions: Extension[];
}>({
  init(realm, params) {
    realm.pubIn({
      [addEditorWrapper$]: ReviewSourceWrapper,
      [comparison$]: params?.diffMarkdown ?? "",
      [viewMode$]: params?.viewMode ?? "rich-text",
      [sourceExtensions$]: params?.sourceExtensions ?? [],
      [reviewExtensions$]: params?.reviewExtensions ?? []
    });
  },
  update(realm, params) {
    realm.pub(comparison$, params?.diffMarkdown ?? "");
    realm.pub(sourceExtensions$, params?.sourceExtensions ?? []);
    realm.pub(reviewExtensions$, params?.reviewExtensions ?? []);
  }
});
