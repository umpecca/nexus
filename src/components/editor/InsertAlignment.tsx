import { useEffect, useState } from "react";
import { activeEditor$, rootEditor$, TooltipWrap } from "@mdxeditor/editor";
import { useCellValues } from "@mdxeditor/gurx";
import { $getSelection, $isParagraphNode, $isRangeSelection } from "lexical";
import type { ElementFormatType, LexicalEditor, ParagraphNode } from "lexical";
import { $isHeadingNode } from "@lexical/rich-text";
import type { HeadingNode } from "@lexical/rich-text";
import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "../ui/button";
import { dedupeBlocksByKey } from "../../lib/admonition";
import { ALIGNMENTS } from "../../lib/alignment";
import type { Alignment } from "../../lib/alignment";

type AlignableBlock = ParagraphNode | HeadingNode;

const ALIGNMENT_ICONS: Record<Alignment, LucideIcon> = {
  left: AlignLeft,
  center: AlignCenter,
  right: AlignRight
};

const ALIGNMENT_LABELS: Record<Alignment, string> = {
  left: "Align left",
  center: "Align center",
  right: "Align right"
};

/**
 * The top-level blocks the current selection touches that can carry an alignment. Only paragraphs and
 * headings qualify — the blocks people centre in practice and the ones the import/export round-trip
 * supports. Must be called inside a Lexical read/update.
 */
function selectedAlignableBlocks(): AlignableBlock[] {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return [];
  }
  const tops = selection
    .getNodes()
    .map((node) => node.getTopLevelElement())
    .filter((node): node is NonNullable<typeof node> => node !== null);
  return dedupeBlocksByKey(tops).filter(
    (block): block is AlignableBlock => $isParagraphNode(block) || $isHeadingNode(block)
  );
}

/**
 * The alignment shared by the selection's blocks for the pressed state, or `null` when nothing
 * alignable is selected (so the buttons can disable). A centre/right block reports itself; everything
 * else — including the cleared/default format — reads as "left". Must be called inside a Lexical read.
 */
function readSelectionAlignment(): Alignment | null {
  const blocks = selectedAlignableBlocks();
  if (blocks.length === 0) {
    return null;
  }
  const format = blocks[0].getFormatType();
  return format === "center" || format === "right" ? format : "left";
}

/**
 * Apply an alignment to every alignable block in the selection. "Left" is the document default, so it
 * clears the element format (emitting no `<div>` wrapper) rather than writing `align="left"`.
 */
function applyAlignment(editor: LexicalEditor, alignment: Alignment): void {
  editor.update(() => {
    const format: ElementFormatType = alignment === "left" ? "" : alignment;
    for (const block of selectedAlignableBlocks()) {
      block.setFormat(format);
    }
  });
}

/**
 * Toolbar control: left / center / right buttons that set the alignment of the selected paragraph(s) or
 * heading(s) via Lexical's element format. Alignment renders natively (Lexical sets `text-align`) and is
 * persisted as a `<div align="…">` wrapper by {@link alignmentPlugin}. The pressed state tracks the
 * caret through an update listener, and the buttons disable when the selection has nothing alignable
 * (e.g. inside a code block or table).
 */
function InsertAlignment() {
  const [activeEditor, rootEditor] = useCellValues(activeEditor$, rootEditor$);
  const editor = activeEditor ?? rootEditor;
  const [current, setCurrent] = useState<Alignment | null>(null);

  useEffect(() => {
    if (!editor) {
      setCurrent(null);
      return;
    }
    // Recompute on every editor update so the pressed state follows both caret moves and the format
    // changes our own buttons make (a pure setFormat does not fire SELECTION_CHANGE).
    const refresh = () => setCurrent(editor.getEditorState().read(readSelectionAlignment));
    refresh();
    return editor.registerUpdateListener(refresh);
  }, [editor]);

  const disabled = !editor || current === null;

  return (
    <>
      {ALIGNMENTS.map((alignment) => {
        const Icon = ALIGNMENT_ICONS[alignment];
        return (
          <TooltipWrap key={alignment} title={ALIGNMENT_LABELS[alignment]}>
            <Button
              aria-label={ALIGNMENT_LABELS[alignment]}
              aria-pressed={current === alignment}
              disabled={disabled}
              onClick={() => editor && applyAlignment(editor, alignment)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Icon aria-hidden="true" />
            </Button>
          </TooltipWrap>
        );
      })}
    </>
  );
}

export default InsertAlignment;
