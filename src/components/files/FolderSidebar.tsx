import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, ChevronRight, FileText, Folder, FolderPlus, FilePlus, ClipboardPaste, RefreshCw, X, Link } from "lucide-react";
import type { FolderEntry, FolderMutation, FolderRoot } from "../../electron";
import { Button } from "../ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "../ui/context-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";

const parentOf = (value: string) => value.includes("/") ? value.slice(0, value.lastIndexOf("/")) : "";
type Form = { action: FolderMutation["action"]; path: string; name: string; destination: string; title: string };
type ClipboardItem = { entry: FolderEntry; cut: boolean };
type DirectoryState = { entries?: FolderEntry[]; error?: string; loading: boolean };
const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);

export default function FolderSidebar({ root, filePath, onOpen, onClose, onRootChange }: {
  root: FolderRoot;
  filePath?: string;
  onOpen: (path: string) => Promise<void>;
  onClose: () => void;
  onRootChange: (root: FolderRoot | null) => void;
}) {
  const [directories, setDirectories] = useState<Record<string, DirectoryState>>({});
  const [expanded, setExpanded] = useState(new Set<string>());
  const [selected, setSelected] = useState("");
  const [selectionHint, setSelectionHint] = useState<FolderEntry | null>(null);
  const [showOther, setShowOther] = useState(false);
  const [clipboard, setClipboard] = useState<ClipboardItem | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [width, setWidth] = useState(260);
  const treeRef = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const requests = useRef(new Map<string, number>());
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const rootEntry: FolderEntry = { path: "", name: root.name, kind: "folder", openable: false };
  const selectedEntry = Object.values(directories).flatMap(dir => dir.entries ?? []).find(entry => entry.path === selected)
    ?? (selectionHint?.path === selected ? selectionHint : rootEntry);
  const destinationFor = (entry: FolderEntry) => entry.kind === "folder" ? entry.path : parentOf(entry.path);

  const load = useCallback(async (path: string) => {
    const sequence = (requests.current.get(path) ?? 0) + 1;
    requests.current.set(path, sequence);
    setDirectories(current => ({ ...current, [path]: { ...current[path], loading: true, error: undefined } }));
    try {
      if (!window.nexus) throw new Error("Folder browsing is unavailable in this window.");
      const entries = await window.nexus.listFolder({ rootId: root.id, path });
      if (alive.current && requests.current.get(path) === sequence) {
        setDirectories(current => ({ ...current, [path]: { entries, loading: false } }));
      }
    } catch (error) {
      if (alive.current && requests.current.get(path) === sequence) {
        setDirectories(current => ({ ...current, [path]: { error: messageOf(error), loading: false } }));
      }
    }
  }, [root.id]);
  const refresh = useCallback(() => {
    void load("");
    for (const path of expandedRef.current) void load(path);
  }, [load]);

  useEffect(() => {
    alive.current = true;
    void load("");
    const unsubscribe = window.nexus?.onFolderChange(event => {
      if (event.rootId !== root.id) return;
      if (event.root !== undefined) onRootChange(event.root);
      if (event.root === null) return;
      if (event.path === null) refresh();
      else if (event.path === "" || expandedRef.current.has(event.path)) void load(event.path);
    });
    return () => { alive.current = false; unsubscribe?.(); };
  }, [load, refresh, root.id, onRootChange]);

  function toggle(path: string) {
    if (!expanded.has(path)) void load(path);
    setExpanded(current => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }
  async function openEntry(entry: FolderEntry) {
    setSelected(entry.path);
    setError("");
    if (entry.kind === "folder") toggle(entry.path);
    else if (entry.kind === "file" && (entry.openable || showOther)) {
      try { await onOpen(entry.path); } catch (error) { if (alive.current) setError(messageOf(error)); }
    }
  }
  function showForm(action: Form["action"], entry: FolderEntry, title: string) {
    setError("");
    const name = action === "newFile" ? "Untitled.md" : action === "newFolder" ? "New folder" : entry.name;
    setForm({ action, path: entry.path, name, destination: destinationFor(entry), title });
  }
  async function mutate(payload: Omit<FolderMutation, "rootId">) {
    if (busy) return;
    setBusy(true);
    setError("");
    const source = Object.values(directories).flatMap(dir => dir.entries ?? []).find(entry => entry.path === payload.path);
    try {
      if (!window.nexus) throw new Error("File management is unavailable in this window.");
      const result = await window.nexus.mutateFolder({ ...payload, rootId: root.id });
      if (!alive.current || result.canceled) return;
      setForm(null);
      if (result.path) {
        setSelected(result.path);
        setSelectionHint({ path: result.path, name: payload.name!, kind: payload.action === "newFolder" ? "folder" : payload.action === "newFile" ? "file" : source?.kind ?? "file", openable: payload.action === "newFile" || (source?.openable ?? false) });
      }
      if (["move", "rename", "trash"].includes(payload.action)) {
        setClipboard(null);
        // Old expanded paths no longer exist after a directory is moved or removed.
        setExpanded(current => new Set([...current].filter(value => value !== payload.path && !value.startsWith(`${payload.path}/`))));
      }
      refresh();
      if (result.path) {
        const parents: string[] = [];
        let parent = parentOf(result.path);
        while (parent) { parents.push(parent); parent = parentOf(parent); }
        setExpanded(current => new Set([...current, ...parents]));
        for (const path of parents) void load(path);
      }
      if (payload.action === "newFile" && result.path) await onOpen(result.path);
    } catch (error) { if (alive.current) setError(messageOf(error)); }
    finally { if (alive.current) setBusy(false); }
  }
  function paste(entry: FolderEntry) {
    if (!clipboard) return;
    const destination = destinationFor(entry);
    let name = clipboard.entry.name;
    if (!clipboard.cut) {
      const existing = new Set((directories[destination]?.entries ?? []).map(item => item.name.toLowerCase()));
      const dot = clipboard.entry.kind === "file" ? name.lastIndexOf(".") : -1;
      const stem = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : "";
      for (let index = 1; existing.has(name.toLowerCase()); index++) name = `${stem} copy${index > 1 ? ` ${index}` : ""}${ext}`;
    }
    void mutate({ action: clipboard.cut ? "move" : "copy", path: clipboard.entry.path, name, destination });
  }
  async function reveal(entry: FolderEntry) {
    try { await window.nexus?.revealFolderItem({ rootId: root.id, path: entry.path }); }
    catch (error) { setError(messageOf(error)); }
  }
  async function copyPath(entry: FolderEntry) {
    try { await navigator.clipboard.writeText(root.path.replace(/[\\/]$/, "") + (entry.path ? `/${entry.path}` : "")); }
    catch (error) { setError(messageOf(error)); }
  }
  function actions(entry: FolderEntry) {
    return <ContextMenuContent>
      <ContextMenuItem disabled={busy} onSelect={() => showForm("newFile", entry, "New Markdown file")}>New Markdown file…</ContextMenuItem>
      <ContextMenuItem disabled={busy} onSelect={() => showForm("newFolder", entry, "New folder")}>New folder…</ContextMenuItem>
      <ContextMenuItem disabled={!clipboard || busy} onSelect={() => paste(entry)}>Paste {clipboard?.cut ? "(move)" : "(copy)"}</ContextMenuItem>
      {entry.path && entry.kind !== "link" ? <>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={busy} onSelect={() => showForm("rename", entry, "Rename")}>Rename…</ContextMenuItem>
        <ContextMenuItem disabled={busy} onSelect={() => setClipboard({ entry, cut: false })}>Copy</ContextMenuItem>
        <ContextMenuItem disabled={busy} onSelect={() => setClipboard({ entry, cut: true })}>Cut</ContextMenuItem>
        <ContextMenuItem disabled={busy} onSelect={() => {
          const dot = entry.kind === "file" ? entry.name.lastIndexOf(".") : -1;
          setForm({ action: "copy", path: entry.path, name: dot > 0 ? `${entry.name.slice(0, dot)} copy${entry.name.slice(dot)}` : `${entry.name} copy`, destination: parentOf(entry.path), title: "Duplicate" });
          setError("");
        }}>Duplicate…</ContextMenuItem>
        <ContextMenuItem disabled={busy} onSelect={() => showForm("copy", entry, "Copy to folder")}>Copy to…</ContextMenuItem>
        <ContextMenuItem disabled={busy} onSelect={() => showForm("move", entry, "Move to folder")}>Move to…</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={busy} onSelect={() => void mutate({ action: "trash", path: entry.path })}>Move to {window.nexus?.platform === "win32" ? "Recycle Bin" : "Trash"}…</ContextMenuItem>
      </> : null}
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={() => void copyPath(entry)}>Copy path</ContextMenuItem>
      <ContextMenuItem disabled={entry.kind === "link"} onSelect={() => void reveal(entry)}>Reveal in {window.nexus?.platform === "darwin" ? "Finder" : "file manager"}</ContextMenuItem>
    </ContextMenuContent>;
  }
  const visible: { entry: FolderEntry; depth: number }[] = [];
  function walk(path: string, depth: number) {
    for (const entry of directories[path]?.entries ?? []) {
      if (!showOther && entry.kind !== "folder" && !entry.openable) continue;
      visible.push({ entry, depth });
      if (entry.kind === "folder" && expanded.has(entry.path)) walk(entry.path, depth + 1);
    }
  }
  walk("", 1);
  function focusItem(path: string) {
    setSelected(path);
    const target = [...(treeRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [])].find(node => node.dataset.path === path);
    target?.focus();
  }
  function treeKey(event: KeyboardEvent, entry: FolderEntry) {
    const all = [rootEntry, ...visible.map(row => row.entry)];
    const index = all.findIndex(item => item.path === entry.path);
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusItem(all[event.key === "Home" ? 0 : event.key === "End" ? all.length - 1 : Math.max(0, Math.min(all.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))].path);
    } else if (event.key === "ArrowRight" && entry.kind === "folder") {
      event.preventDefault();
      if (entry.path && !expanded.has(entry.path)) toggle(entry.path);
      else if (all[index + 1] && parentOf(all[index + 1].path) === entry.path) focusItem(all[index + 1].path);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (entry.path && expanded.has(entry.path)) toggle(entry.path);
      else focusItem(parentOf(entry.path));
    } else if (event.key === "F2" && entry.path && entry.kind !== "link") {
      event.preventDefault(); showForm("rename", entry, "Rename");
    } else if ((event.ctrlKey || event.metaKey) && ["c", "x", "v"].includes(event.key.toLowerCase())) {
      event.preventDefault();
      if (event.key.toLowerCase() === "v") paste(entry);
      else if (entry.path && entry.kind !== "link") setClipboard({ entry, cut: event.key.toLowerCase() === "x" });
    } else if (event.key === "Delete" && entry.path && entry.kind !== "link") {
      event.preventDefault(); void mutate({ action: "trash", path: entry.path });
    }
  }
  function row(entry: FolderEntry, depth: number) {
    const isFolder = entry.kind === "folder";
    const opened = isFolder && (entry.path === "" || expanded.has(entry.path));
    const normalize = (path: string) => window.nexus?.platform === "win32" ? path.replace(/\\/g, "/").toLowerCase() : path;
    const active = filePath && normalize(filePath) === normalize(`${root.path.replace(/\\/g, "/").replace(/\/$/, "")}/${entry.path}`);
    return <ContextMenu key={entry.path}>
      <ContextMenuTrigger asChild>
        <button type="button" role="treeitem" data-path={entry.path} aria-level={depth + 1}
          aria-expanded={isFolder ? opened : undefined} aria-selected={selected === entry.path}
          tabIndex={selected === entry.path || (!allPaths.has(selected) && entry.path === "") ? 0 : -1}
          className={`nexus-file-row${active ? " is-active" : ""}${clipboard?.cut && clipboard.entry.path === entry.path ? " is-cut" : ""}`}
          style={{ paddingLeft: `${8 + depth * 14}px` }} title={entry.kind === "link" ? "Linked items are shown but cannot be opened or managed here." : entry.name}
          onFocus={() => setSelected(entry.path)} onKeyDown={event => treeKey(event, entry)}
          onClick={() => entry.path ? void openEntry(entry) : setSelected("")}>
          {isFolder ? opened ? <ChevronDown /> : <ChevronRight /> : <span className="nexus-file-indent" />}
          {isFolder ? <Folder /> : entry.kind === "link" ? <Link /> : <FileText />}
          <span>{entry.name}</span>
        </button>
      </ContextMenuTrigger>
      {actions(entry)}
    </ContextMenu>;
  }
  const allPaths = new Set(["", ...visible.map(row => row.entry.path)]);
  return <aside className="nexus-files" aria-label="Folder browser" style={{ width }}>
    <header className="nexus-files-header"><strong>Files</strong><Button variant="ghost" size="icon" aria-label="Close folder" title="Close folder" onClick={onClose}><X /></Button></header>
    <div className="nexus-files-toolbar">
      <Button variant="ghost" size="icon" disabled={busy} title="New Markdown file" aria-label="New Markdown file" onClick={() => showForm("newFile", selectedEntry, "New Markdown file")}><FilePlus /></Button>
      <Button variant="ghost" size="icon" disabled={busy} title="New folder" aria-label="New folder" onClick={() => showForm("newFolder", selectedEntry, "New folder")}><FolderPlus /></Button>
      <Button variant="ghost" size="icon" disabled={!clipboard || busy} title="Paste into selected folder" aria-label="Paste into selected folder" onClick={() => paste(selectedEntry)}><ClipboardPaste /></Button>
      <Button variant="ghost" size="icon" title="Refresh folder" aria-label="Refresh folder" onClick={refresh}><RefreshCw /></Button>
    </div>
    <label className="nexus-files-filter"><input type="checkbox" checked={showOther} onChange={event => setShowOther(event.target.checked)} /> Show other files</label>
    <div role="tree" aria-label={root.name} className="nexus-files-tree" ref={treeRef} aria-busy={busy}>
      {row(rootEntry, 0)}
      {visible.map(({ entry, depth }) => row(entry, depth))}
      {directories[""]?.loading && !directories[""]?.entries ? <p role="status">Loading folder…</p> : null}
      {!directories[""]?.loading && directories[""]?.entries && visible.length === 0 ? <p>No {showOther ? "files" : "documents or folders"} here.</p> : null}
      {Object.entries(directories).filter(([path, dir]) => dir.error && (path === "" || expanded.has(path))).map(([path, dir]) => <p role="alert" key={path}>{path || root.name}: {dir.error} <button onClick={() => void load(path)}>Retry</button></p>)}
    </div>
    {error && !form ? <p className="nexus-files-error" role="alert">{error}</p> : null}
    <div className="nexus-files-resizer" role="separator" aria-label="Resize folder browser" aria-orientation="vertical" aria-valuenow={width} aria-valuemin={180} aria-valuemax={480} tabIndex={0}
      onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); setWidth(current => event.key === "Home" ? 180 : event.key === "End" ? 480 : Math.max(180, Math.min(480, current + (event.key === "ArrowRight" ? 16 : -16)))); } }}
      onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) { const left = event.currentTarget.parentElement!.getBoundingClientRect().left; setWidth(Math.max(180, Math.min(480, event.clientX - left, window.innerWidth - 400))); } }}
      onPointerUp={event => event.currentTarget.releasePointerCapture(event.pointerId)} />
    <Dialog open={form !== null} onOpenChange={open => { if (!open && !busy) { setForm(null); setError(""); } }}>
      {form ? <DialogContent onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onInteractOutside={event => { if (busy) event.preventDefault(); }}>
        <DialogHeader><DialogTitle>{form.title}</DialogTitle><DialogDescription>
          {form.action === "move" ? "Relative links remain as written. Move their assets too when changing folders." : `Inside ${root.name}. Existing files will not be replaced.`}
        </DialogDescription></DialogHeader>
        <form id="folder-operation" className="nexus-file-form" onSubmit={event => { event.preventDefault(); void mutate(form); }}>
          <label>Name<input autoFocus required value={form.name} disabled={busy} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
          {["copy", "move"].includes(form.action) && form.title !== "Duplicate" ? <label>Destination folder<input value={form.destination} disabled={busy} list="folder-destinations" placeholder="Leave blank for the opened folder" onChange={event => setForm({ ...form, destination: event.target.value.replace(/\\/g, "/") })} /><small>Folder path relative to {root.name}. Leave blank for its top level.</small></label> : <small>{form.action === "rename" ? parentOf(form.path) || root.name : form.destination || root.name}</small>}
          <datalist id="folder-destinations">{[...new Set(Object.values(directories).flatMap(dir => (dir.entries ?? []).filter(entry => entry.kind === "folder").map(entry => entry.path)))].map(path => <option key={path} value={path} />)}</datalist>
          {error ? <p role="alert">{error}</p> : null}
        </form>
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => { setForm(null); setError(""); }}>Cancel</Button><Button type="submit" form="folder-operation" disabled={busy || !form.name.trim()}>{busy ? "Working…" : form.title}</Button></DialogFooter>
      </DialogContent> : null}
    </Dialog>
  </aside>;
}
