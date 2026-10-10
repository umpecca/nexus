import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Compartment, EditorState, Prec, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { LanguageDescription, type LanguageSupport } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { basicSetup } from "codemirror";
import ChangeReview from "./ChangeReview";
import { Button } from "../ui/button";
import { FindReplacePanel } from "./FindTextPanel";
import { useCodeEditorSearch } from "./codeEditorSearch";

export type CodeFileEditorHandle = { getValue: () => string; getView: () => EditorView | null; focus: () => void };
const emptyExtensions: Extension[] = [];
/** Consistent CRLF/CR files keep their newline convention; mixed files retain their literal CRs. */
export function codeLineSeparator(value: string) {
  if (value.includes("\r\n") && !/(^|[^\r])\n|\r(?!\n)/.test(value)) return "\r\n";
  if (value.includes("\r") && !value.includes("\n")) return "\r";
  return "\n";
}

const CodeFileEditor = forwardRef<CodeFileEditorHandle, {
  value: string;
  filename: string;
  onChange: (value: string) => void;
  extensions?: Extension[];
  zoom?: number;
  findRequest?: number;
  replaceRequest?: number;
  diffRequest?: number;
  comparison?: string;
  onReviewChange?: (review: boolean) => void;
}>(function CodeFileEditor({ value, filename, onChange, extensions = emptyExtensions, zoom = 100,
  findRequest = 0, replaceRequest = 0, diffRequest = 0, comparison = "", onReviewChange }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const { extension: searchExtension, controller: search } = useCodeEditorSearch(view);
  const [localFindRequest, setLocalFindRequest] = useState(0);
  const [localReplaceRequest, setLocalReplaceRequest] = useState(0);
  const props = useRef({ value, onChange, onReviewChange, search });
  props.current = { value, onChange, onReviewChange, search };
  const compartments = useMemo(() => ({ theme: new Compartment(), font: new Compartment(), wrap: new Compartment(), language: new Compartment(), separator: new Compartment() }), []);
  const fontSize = `${14 * zoom / 100}px`;
  const [wrap, setWrap] = useState(false);
  const [languageChoice, setLanguageChoice] = useState("auto");
  const [languageSupport, setLanguageSupport] = useState<LanguageSupport | null>(null);
  const [review, setReview] = useState(false);
  const synchronizing = useRef(false);
  const automatic = LanguageDescription.matchFilename(languages, filename);
  const description = languageChoice === "auto" ? automatic : languages.find(language => language.name === languageChoice) ?? null;
  const searchKeys = useMemo(() => Prec.highest(keymap.of([
    { key: "Mod-f", run: () => { setReview(false); setLocalFindRequest(count => count + 1); return true; } },
    { key: "Mod-h", run: () => { setReview(false); setLocalReplaceRequest(count => count + 1); return true; } },
    { key: "F3", run: () => { setReview(false); props.current.search.next(); return true; }, shift: () => { setReview(false); props.current.search.prev(); return true; } },
    { key: "Mod-g", run: () => { setReview(false); props.current.search.next(); return true; }, shift: () => { setReview(false); props.current.search.prev(); return true; } },
    { key: "Escape", run: () => { if (!props.current.search.isSearchOpen) return false; props.current.search.closeSearch(); return true; } }
  ])), []);
  const reviewExtensions = useMemo(() => [...extensions, searchKeys, ...(languageSupport ? [languageSupport] : [])], [extensions, searchKeys, languageSupport]);
  useImperativeHandle(ref, () => ({ getValue: () => view.current?.state.sliceDoc() ?? props.current.value,
    getView: () => view.current, focus: () => view.current?.focus() }), []);

  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({ parent: host.current, state: EditorState.create({ doc: props.current.value, extensions: [
      basicSetup, searchExtension, keymap.of([indentWithTab]), compartments.theme.of([]), compartments.font.of([]), compartments.wrap.of([]), compartments.language.of([]),
      searchKeys,
      compartments.separator.of(EditorState.lineSeparator.of(codeLineSeparator(props.current.value))),
      EditorView.contentAttributes.of({ "aria-label": "Code and text editor", spellcheck: "false" }),
      EditorView.updateListener.of(update => {
        if (update.docChanged && !synchronizing.current) props.current.onChange(update.state.sliceDoc());
      })
    ] }) });
    view.current = editor;
    return () => { view.current = null; editor.destroy(); };
  }, [compartments, searchExtension, searchKeys]);
  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.sliceDoc() === value) return;
    synchronizing.current = true;
    try {
      const separator = codeLineSeparator(value);
      const inserted = EditorState.create({ doc: value, extensions: EditorState.lineSeparator.of(separator) }).doc;
      editor.dispatch({ effects: compartments.separator.reconfigure(EditorState.lineSeparator.of(separator)),
        changes: { from: 0, to: editor.state.doc.length, insert: inserted } });
    } finally { synchronizing.current = false; }
  }, [value, compartments]);
  useEffect(() => { view.current?.dispatch({ effects: compartments.theme.reconfigure(extensions) }); }, [extensions, compartments]);
  // A theme update invalidates CodeMirror's cached line heights, even for short documents
  // whose scroller dimensions don't change when the font grows or shrinks.
  useEffect(() => {
    view.current?.dispatch({ effects: compartments.font.reconfigure(EditorView.theme({ "&": { fontSize } })) });
  }, [fontSize, compartments]);
  useEffect(() => { view.current?.dispatch({ effects: compartments.wrap.reconfigure(wrap ? EditorView.lineWrapping : []) }); }, [wrap, compartments]);
  useEffect(() => {
    let active = true;
    setLanguageSupport(null);
    view.current?.dispatch({ effects: compartments.language.reconfigure([]) });
    if (description) void description.load().then(support => {
      if (active) { setLanguageSupport(support); view.current?.dispatch({ effects: compartments.language.reconfigure(support) }); }
    }).catch(() => {});
    return () => { active = false; };
  }, [description, compartments]);
  useEffect(() => {
    if (findRequest || replaceRequest || localFindRequest || localReplaceRequest) {
      setReview(false);
      props.current.search.openSearch();
    }
  }, [findRequest, replaceRequest, localFindRequest, localReplaceRequest]);
  useEffect(() => { if (diffRequest) setReview(true); }, [diffRequest]);
  useEffect(() => { if (review) props.current.search.closeSearch(); }, [review]);
  useEffect(() => { props.current.onReviewChange?.(review); }, [review]);

  return <div className="nexus-code-file">
    <div className="nexus-code-file-toolbar">
      <strong>{review ? "Changes" : "Code / Text"}</strong>
      <label>Language <select aria-label="Code language" value={languageChoice} onChange={event => setLanguageChoice(event.target.value)}>
        <option value="auto">Auto ({automatic?.name ?? "Plain text"})</option><option value="plain">Plain text</option>
        {languages.map(language => <option key={language.name} value={language.name}>{language.name}</option>)}
      </select></label>
      <label><input type="checkbox" checked={wrap} onChange={event => setWrap(event.target.checked)} /> Wrap lines</label>
      <Button size="sm" variant="ghost" onClick={() => { setReview(false); setLocalReplaceRequest(count => count + 1); }}>Find / Replace</Button>
      {review ? <Button size="sm" variant="outline" onClick={() => setReview(false)}>Back to editor</Button> : null}
    </div>
    <FindReplacePanel search={search} openRequest={findRequest + localFindRequest} replaceRequest={replaceRequest + localReplaceRequest} />
    <div className="nexus-code-file-content" ref={host} style={{ display: review ? "none" : undefined }} />
    {review ? <ChangeReview original={comparison} proposed={value} extensions={reviewExtensions} markdownDocument={false} fontSize={fontSize} /> : null}
  </div>;
});
export default CodeFileEditor;
