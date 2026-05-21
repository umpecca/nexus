import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useEditorSearch } from "@mdxeditor/editor";
import { Button } from "../ui/button";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type FindTextPanelProps = {
  onActiveMatchChange: (range: Range) => void;
  openRequest: number;
};

export default function FindTextPanel({ onActiveMatchChange, openRequest }: FindTextPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handledOpenRequestRef = useRef(0);
  const [query, setQuery] = useState("");
  const {
    closeSearch,
    cursor,
    currentRange,
    isSearchOpen,
    next,
    openSearch,
    prev,
    setSearch,
    total
  } = useEditorSearch();

  useEffect(() => {
    if (openRequest <= handledOpenRequestRef.current) {
      return;
    }

    handledOpenRequestRef.current = openRequest;
    openSearch();

    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [openRequest, openSearch]);

  useEffect(() => {
    if (!isSearchOpen) {
      return;
    }

    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [isSearchOpen]);

  useEffect(() => {
    if (!isSearchOpen || !query || !currentRange) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      onActiveMatchChange(currentRange);
    });

    return () => cancelAnimationFrame(frame);
  }, [currentRange, cursor, isSearchOpen, onActiveMatchChange, query, total]);

  function updateQuery(nextQuery: string) {
    setQuery(nextQuery);
    setSearch(escapeRegExp(nextQuery));
  }

  function closePanel() {
    updateQuery("");
    closeSearch();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closePanel();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) {
        prev();
      } else {
        next();
      }
    }
  }

  if (!isSearchOpen) {
    return null;
  }

  const currentResult = total > 0 ? Math.max(cursor, 1) : 0;

  return (
    <div className="nexus-find-panel" role="search" aria-label="Find text">
      <input
        aria-label="Find text"
        className="nexus-find-input"
        onChange={(event) => updateQuery(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find"
        ref={inputRef}
        type="search"
        value={query}
      />
      <span className="nexus-find-count" aria-live="polite">
        {query ? `${currentResult} of ${total}` : "0 of 0"}
      </span>
      <div className="nexus-find-actions">
        <Button
          aria-label="Previous match"
          disabled={!query || total === 0}
          onClick={prev}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ChevronUp aria-hidden="true" />
        </Button>
        <Button
          aria-label="Next match"
          disabled={!query || total === 0}
          onClick={next}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ChevronDown aria-hidden="true" />
        </Button>
        <Button
          aria-label="Close find"
          onClick={closePanel}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
