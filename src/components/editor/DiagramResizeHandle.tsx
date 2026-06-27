import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

/**
 * A small bottom-right resize handle for an embedded diagram image (shared by the isoflow and drawio
 * decorator nodes). Dragging it scales the image on the page, aspect-locked: the live width is applied
 * to the `<img>` directly for smooth feedback, and `onResizeEnd(width)` fires on release so the caller
 * can bake the new size into the image source (which is what persists). `max-width: 100%` on the image
 * caps the width at the column, so the diagram can never exceed the page width.
 *
 * Hover-revealed via CSS (`.nexus-*:hover .nexus-diagram-resize`), mirroring the "Edit diagram" button.
 */
const MIN_WIDTH = 60;

export function DiagramResizeHandle({
  imgRef,
  onResizeEnd
}: {
  imgRef: RefObject<HTMLImageElement | null>;
  onResizeEnd: (width: number) => void;
}) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  function handlePointerDown(event: ReactPointerEvent<HTMLSpanElement>) {
    const img = imgRef.current;
    if (!img) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startWidth: img.getBoundingClientRect().width };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLSpanElement>) {
    const img = imgRef.current;
    const state = drag.current;
    if (!img || !state) {
      return;
    }
    const next = Math.max(MIN_WIDTH, Math.round(state.startWidth + (event.clientX - state.startX)));
    img.style.width = `${next}px`;
    img.style.height = "auto";
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLSpanElement>) {
    const img = imgRef.current;
    const state = drag.current;
    drag.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (!img || !state) {
      return;
    }
    // The rendered width is already clamped to the column by `max-width: 100%`, so this is the final size.
    onResizeEnd(Math.max(MIN_WIDTH, Math.round(img.getBoundingClientRect().width)));
  }

  return (
    <span
      className="nexus-diagram-resize"
      role="presentation"
      aria-hidden="true"
      title="Drag to resize"
      // Keep the click from collapsing the editor selection onto the decorator.
      onMouseDown={(event) => event.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
  );
}

export default DiagramResizeHandle;
