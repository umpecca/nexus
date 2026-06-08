import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, ChevronUp, Replace, ReplaceAll, X } from "lucide-react";
import { useEditorSearch } from "@mdxeditor/editor";
import { Button } from "../ui/button";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type FindTextPanelProps = {
  onActiveMatchChange: (range: Range) => void;
  openRequest: number;
  replaceRequest: number;
};

export default function FindTextPanel({
  onActiveMatchChange,
  openRequest,
  replaceRequest
}: FindTextPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const handledOpenRequestRef = useRef(0);
  const handledReplaceRequestRef = useRef(0);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const {
    closeSearch,
    cursor,
    currentRange,
    isSearchOpen,
    next,
    openSearch,
    prev,
    replace,
    replaceAll,
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
    if (replaceRequest <= handledReplaceRequestRef.current) {
      return;
    }

    handledReplaceRequestRef.current = replaceRequest;
    setShowReplace(true);
    openSearch();

    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [replaceRequest, openSearch]);

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
    setReplacement("");
    setShowReplace(false);
    closeSearch();
  }

  function toggleReplace() {
    setShowReplace((shown) => {
      const nextShown = !shown;
      requestAnimationFrame(() => {
        (nextShown ? replaceInputRef : inputRef).current?.focus();
      });
      return nextShown;
    });
  }

  const canReplace = Boolean(query) && total > 0;

  function replaceCurrent() {
    if (!canReplace) {
      return;
    }
    replace(replacement);
  }

  function replaceEvery() {
    if (!canReplace) {
      return;
    }
    replaceAll(replacement);
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

  function handleReplaceKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closePanel();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      replaceCurrent();
    }
  }

  if (!isSearchOpen) {
    return null;
  }

  const currentResult = total > 0 ? Math.max(cursor, 1) : 0;

  return (
    <div className="nexus-find-panel" role="search" aria-label="Find and replace">
      <Button
        aria-expanded={showReplace}
        aria-label={showReplace ? "Hide replace row" : "Show replace row"}
        className="nexus-find-toggle"
        onClick={toggleReplace}
        size="icon"
        title="Toggle replace"
        type="button"
        variant="ghost"
      >
        {showReplace ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
      </Button>
      <div className="nexus-find-body">
        <div className="nexus-find-row">
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
              title="Previous match"
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
              title="Next match"
              type="button"
              variant="ghost"
            >
              <ChevronDown aria-hidden="true" />
            </Button>
            <Button
              aria-label="Close find"
              onClick={closePanel}
              size="icon"
              title="Close"
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        </div>
        {showReplace ? (
          <div className="nexus-find-row">
            <input
              aria-label="Replace with"
              className="nexus-find-input"
              onChange={(event) => setReplacement(event.target.value)}
              onKeyDown={handleReplaceKeyDown}
              placeholder="Replace"
              ref={replaceInputRef}
              type="text"
              value={replacement}
            />
            <div className="nexus-find-actions">
              <Button
                aria-label="Replace match"
                disabled={!canReplace}
                onClick={replaceCurrent}
                size="icon"
                title="Replace"
                type="button"
                variant="ghost"
              >
                <Replace aria-hidden="true" />
              </Button>
              <Button
                aria-label="Replace all matches"
                disabled={!canReplace}
                onClick={replaceEvery}
                size="icon"
                title="Replace all"
                type="button"
                variant="ghost"
              >
                <ReplaceAll aria-hidden="true" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
