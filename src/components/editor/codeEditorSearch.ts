import { useCallback, useMemo, useRef, useState, type RefObject } from "react";
import { EditorView } from "@codemirror/view";
import {
  closeSearchPanel, findNext, findPrevious, getSearchQuery, openSearchPanel,
  replaceAll, replaceNext, search, searchPanelOpen, SearchQuery, setSearchQuery
} from "@codemirror/search";
import type { FindTextSearch } from "./FindTextPanel";

/** CodeMirror supplies matching, highlighting, scrolling and undo; Nexus supplies the UI. */
export function useCodeEditorSearch(viewRef: RefObject<EditorView | null>) {
  const query = useRef("");
  const matches = useRef<{ from: number; to: number }[]>([]);
  const [result, setResult] = useState({ isSearchOpen: false, total: 0, cursor: 0 });
  const extension = useMemo(() => [
    search({ literal: true, createPanel: () => {
      const dom = document.createElement("div");
      dom.hidden = true;
      return { dom };
    } }),
    EditorView.theme({ ".cm-panels": { border: "none", background: "transparent" } }),
    EditorView.updateListener.of(update => {
      const current = getSearchQuery(update.state);
      if (update.docChanged || !current.eq(getSearchQuery(update.startState))) {
        matches.current = [];
        if (current.valid) {
          const cursor = current.getCursor(update.state);
          for (let match = cursor.next(); !match.done; match = cursor.next()) matches.current.push(match.value);
        }
      }
      const selection = update.state.selection.main;
      const index = matches.current.findIndex(match => match.from === selection.from && match.to === selection.to);
      const next = { isSearchOpen: searchPanelOpen(update.state), total: matches.current.length, cursor: index + 1 };
      setResult(previous => previous.isSearchOpen === next.isSearchOpen && previous.total === next.total && previous.cursor === next.cursor ? previous : next);
    })
  ], []);
  const openSearch = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const alreadyOpen = searchPanelOpen(view.state);
    openSearchPanel(view);
    // Keep the query in sync with Nexus's input, rather than CodeMirror's selection prefill.
    if (!alreadyOpen) view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: query.current, literal: true })) });
  }, [viewRef]);
  const closeSearch = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    query.current = "";
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: "", literal: true })) });
    closeSearchPanel(view);
    view.focus();
  }, [viewRef]);
  const setSearch = useCallback((value: string) => {
    query.current = value;
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: value, literal: true })) });
    if (value) findNext(view);
  }, [viewRef]);
  const next = useCallback(() => { openSearch(); if (query.current && viewRef.current) findNext(viewRef.current); }, [openSearch, viewRef]);
  const prev = useCallback(() => { openSearch(); if (query.current && viewRef.current) findPrevious(viewRef.current); }, [openSearch, viewRef]);
  const replace = useCallback((replacement: string) => {
    const view = viewRef.current;
    if (!view || !query.current || !matches.current.length) return;
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: query.current, replace: replacement, literal: true })) });
    const selected = view.state.selection.main;
    if (!matches.current.some(match => match.from === selected.from && match.to === selected.to)) findNext(view);
    replaceNext(view);
    findNext(view);
  }, [viewRef]);
  const replaceEvery = useCallback((replacement: string) => {
    const view = viewRef.current;
    if (!view || !query.current) return;
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: query.current, replace: replacement, literal: true })) });
    replaceAll(view);
  }, [viewRef]);
  const controller: FindTextSearch = { ...result, openSearch, closeSearch, setSearch, next, prev, replace, replaceAll: replaceEvery };
  return { extension, controller };
}
