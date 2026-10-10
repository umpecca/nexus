import { useEffect, useRef, useState } from "react";
import { markdown } from "@codemirror/lang-markdown";
import { MergeView } from "@codemirror/merge";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { Button } from "../ui/button";
import { hasFoldableImageData, setAllImageDataExpanded, sourceImageFoldingExtension } from "./sourceImageFolding";

const defaultExtensions: Extension[] = [];

type ChangeReviewProps = {
  markdownDocument?: boolean;
  original: string;
  proposed: string;
  originalLabel?: string;
  proposedLabel?: string;
  extensions?: Extension[];
};

/** One read-only viewer for editor comparisons and proposals; folding never changes its inputs. */
export default function ChangeReview({
  markdownDocument = true,
  original,
  proposed,
  originalLabel = "Original",
  proposedLabel = "Proposed",
  extensions = defaultExtensions
}: ChangeReviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mergeRef = useRef<MergeView | null>(null);
  const [changeCount, setChangeCount] = useState(0);
  const [activeChange, setActiveChange] = useState(-1);
  const [hideUnchanged, setHideUnchanged] = useState(false);
  const [hasImages, setHasImages] = useState(false);

  useEffect(() => {
    if (!hostRef.current) return;
    const shared = [
      ...extensions,
      basicSetup,
      ...(markdownDocument ? [markdown(), sourceImageFoldingExtension()] : []),
      EditorView.lineWrapping,
      EditorState.readOnly.of(true),
      EditorView.editable.of(false)
    ];
    const merge = new MergeView({
      parent: hostRef.current,
      a: { doc: original, extensions: shared },
      b: { doc: proposed, extensions: shared },
      highlightChanges: true,
      gutter: true,
      // Bound detailed diff work for large unrelated documents and embedded image payloads.
      diffConfig: { scanLimit: 500, timeout: 100 }
    });
    merge.a.contentDOM.setAttribute("aria-label", originalLabel);
    merge.b.contentDOM.setAttribute("aria-label", proposedLabel);
    mergeRef.current = merge;
    setChangeCount(merge.chunks.length);
    setHasImages(markdownDocument && (hasFoldableImageData(merge.a) || hasFoldableImageData(merge.b)));
    setActiveChange(-1);
    return () => {
      mergeRef.current = null;
      merge.destroy();
    };
  }, [original, proposed, originalLabel, proposedLabel, extensions, markdownDocument]);

  useEffect(() => {
    mergeRef.current?.reconfigure({
      collapseUnchanged: hideUnchanged ? { margin: 3, minSize: 4 } : undefined
    });
  }, [hideUnchanged, original, proposed, originalLabel, proposedLabel, extensions]);

  function moveChange(direction: 1 | -1) {
    const merge = mergeRef.current;
    if (!merge?.chunks.length) return;
    const index = activeChange < 0
      ? direction === 1 ? 0 : merge.chunks.length - 1
      : (activeChange + direction + merge.chunks.length) % merge.chunks.length;
    const chunk = merge.chunks[index];
    for (const [view, from] of [[merge.a, chunk.fromA], [merge.b, chunk.fromB]] as const) {
      const position = Math.min(from, view.state.doc.length);
      view.dispatch({
        selection: { anchor: position },
        effects: EditorView.scrollIntoView(position, { y: "center" })
      });
    }
    setActiveChange(index);
  }

  function expandImages(expanded: boolean) {
    const merge = mergeRef.current;
    if (!merge) return;
    setAllImageDataExpanded(merge.a, expanded);
    setAllImageDataExpanded(merge.b, expanded);
  }

  return (
    <section className="nexus-change-review" aria-label="Document change review">
      <div className="nexus-change-review-controls">
        <Button type="button" size="sm" variant="outline" disabled={!changeCount}
          onClick={() => moveChange(-1)}>Previous change</Button>
        <Button type="button" size="sm" variant="outline" disabled={!changeCount}
          onClick={() => moveChange(1)}>Next change</Button>
        <span className="nexus-change-review-count" role="status" aria-live="polite">
          {!changeCount ? "No changes" : activeChange < 0
            ? `${changeCount} ${changeCount === 1 ? "change" : "changes"}`
            : `Change ${activeChange + 1} of ${changeCount}`}
        </span>
        <div className="nexus-image-fold-controls" role="group" aria-label="Image data folding">
          <span className="nexus-image-fold-label">Image data</span>
          <Button type="button" size="sm" variant="outline" disabled={!hasImages}
            title="Expand all image data in both panes" onClick={() => expandImages(true)}>Expand all</Button>
          <Button type="button" size="sm" variant="outline" disabled={!hasImages}
            title="Collapse all image data in both panes" onClick={() => expandImages(false)}>Collapse all</Button>
        </div>
        <label className="nexus-change-review-collapse">
          <input type="checkbox" checked={hideUnchanged}
            onChange={(event) => setHideUnchanged(event.target.checked)} />
          Hide unchanged sections
        </label>
      </div>
      <div className="nexus-change-review-labels" aria-hidden="true">
        <span>{originalLabel}</span><span>{proposedLabel}</span>
      </div>
      <div ref={hostRef} className="nexus-change-review-editor" />
    </section>
  );
}
