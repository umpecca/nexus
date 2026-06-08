import { useEffect, useRef } from "react";
import { ListTree } from "lucide-react";
import type { OutlineHeading } from "../../lib/outline";
import { OUTLINE_WIDTH_MAX_PIXELS, OUTLINE_WIDTH_MIN_PIXELS } from "../../lib/settings";

const UNTITLED_HEADING_LABEL = "(untitled heading)";
const OUTLINE_WIDTH_KEYBOARD_STEP_PIXELS = 16;
/** Keep at least this much room for the editor when dragging the outline wider. */
const MIN_EDITOR_WIDTH_PIXELS = 240;

function clampOutlineWidth(width: number, containerWidth: number) {
  const maxByContainer =
    containerWidth > 0 ? containerWidth - MIN_EDITOR_WIDTH_PIXELS : OUTLINE_WIDTH_MAX_PIXELS;
  const max = Math.max(OUTLINE_WIDTH_MIN_PIXELS, Math.min(OUTLINE_WIDTH_MAX_PIXELS, maxByContainer));
  return Math.round(Math.min(max, Math.max(OUTLINE_WIDTH_MIN_PIXELS, width)));
}

function OutlineSidebar({
  headings,
  width,
  activeIndex,
  onSelect,
  onResize
}: {
  headings: OutlineHeading[];
  width: number;
  activeIndex: number;
  onSelect: (heading: OutlineHeading) => void;
  onResize: (width: number) => void;
}) {
  const asideRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLElement>(null);

  // Keep the active (scroll-spy) entry visible without scrolling the page or the
  // editor: nudge only the outline list when the highlighted item drifts out of view.
  useEffect(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }

    const active = list.querySelector<HTMLElement>(".nexus-outline-item-active");
    if (!active) {
      return;
    }

    const listRect = list.getBoundingClientRect();
    const itemRect = active.getBoundingClientRect();
    if (itemRect.top < listRect.top) {
      list.scrollTop -= listRect.top - itemRect.top + 8;
    } else if (itemRect.bottom > listRect.bottom) {
      list.scrollTop += itemRect.bottom - listRect.bottom + 8;
    }
  }, [activeIndex, headings]);

  const handleResizePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    const aside = asideRef.current;
    // The outline overlays the editor surface, so its parent gives both the
    // available width and the element that carries the --outline-width variable.
    const surface = aside?.parentElement ?? null;
    if (!aside || !surface) {
      return;
    }

    event.preventDefault();
    const sidebarLeft = aside.getBoundingClientRect().left;
    let latestWidth = width;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      latestWidth = clampOutlineWidth(moveEvent.clientX - sidebarLeft, surface.clientWidth);
      // Update the live width via the CSS variable so dragging stays smooth
      // without re-rendering the editor on every pointer move.
      surface.style.setProperty("--outline-width", `${latestWidth}px`);
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      document.body.classList.remove("nexus-resizing-col");
      onResize(latestWidth);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    document.body.classList.add("nexus-resizing-col");
  };

  const handleResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();
    const containerWidth = asideRef.current?.parentElement?.clientWidth ?? 0;
    const delta =
      event.key === "ArrowLeft"
        ? -OUTLINE_WIDTH_KEYBOARD_STEP_PIXELS
        : OUTLINE_WIDTH_KEYBOARD_STEP_PIXELS;
    onResize(clampOutlineWidth(width + delta, containerWidth));
  };

  return (
    <aside ref={asideRef} className="nexus-outline" aria-label="Document outline">
      <div className="nexus-outline-header">
        <ListTree aria-hidden="true" className="nexus-outline-header-icon" />
        <span className="nexus-outline-title">Outline</span>
      </div>
      {headings.length === 0 ? (
        <p className="nexus-outline-empty">No headings yet</p>
      ) : (
        <nav className="nexus-outline-list" ref={listRef}>
          {headings.map((heading) => {
            const label = heading.text || UNTITLED_HEADING_LABEL;
            const isActive = heading.index === activeIndex;
            return (
              <button
                key={heading.index}
                type="button"
                className={`nexus-outline-item nexus-outline-item-level-${heading.level}${
                  isActive ? " nexus-outline-item-active" : ""
                }`}
                style={{ paddingInlineStart: `${(heading.level - 1) * 0.85 + 0.55}rem` }}
                onClick={() => onSelect(heading)}
                aria-current={isActive ? "true" : undefined}
                title={label}
              >
                {label}
              </button>
            );
          })}
        </nav>
      )}
      <div
        className="nexus-outline-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize outline panel"
        aria-valuemin={OUTLINE_WIDTH_MIN_PIXELS}
        aria-valuemax={OUTLINE_WIDTH_MAX_PIXELS}
        aria-valuenow={Math.round(width)}
        tabIndex={0}
        onPointerDown={handleResizePointerDown}
        onKeyDown={handleResizeKeyDown}
      />
    </aside>
  );
}

export default OutlineSidebar;
