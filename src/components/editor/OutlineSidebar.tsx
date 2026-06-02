import { ListTree } from "lucide-react";
import type { OutlineHeading } from "../../lib/outline";

const UNTITLED_HEADING_LABEL = "(untitled heading)";

function OutlineSidebar({
  headings,
  onSelect
}: {
  headings: OutlineHeading[];
  onSelect: (index: number) => void;
}) {
  return (
    <aside className="nexus-outline" aria-label="Document outline">
      <div className="nexus-outline-header">
        <ListTree aria-hidden="true" className="nexus-outline-header-icon" />
        <span className="nexus-outline-title">Outline</span>
      </div>
      {headings.length === 0 ? (
        <p className="nexus-outline-empty">No headings yet</p>
      ) : (
        <nav className="nexus-outline-list">
          {headings.map((heading) => {
            const label = heading.text || UNTITLED_HEADING_LABEL;
            return (
              <button
                key={heading.index}
                type="button"
                className={`nexus-outline-item nexus-outline-item-level-${heading.level}`}
                style={{ paddingInlineStart: `${(heading.level - 1) * 0.85 + 0.55}rem` }}
                onClick={() => onSelect(heading.index)}
                title={label}
              >
                {label}
              </button>
            );
          })}
        </nav>
      )}
    </aside>
  );
}

export default OutlineSidebar;
