import type { FolderEntry } from "../electron";

export type WorkspaceView = { name: string; expanded: string[]; showOther: boolean };
export type WorkspaceHome = { home: string | null; pinned: string[]; recent: string[]; views: WorkspaceView[] };
export const emptyWorkspaceHome = (): WorkspaceHome => ({ home: null, pinned: [], recent: [], views: [] });

// Reject control bytes as well as filesystem traversal in locally persisted shortcuts.
const relativePath = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 4096
  && !/[\\:]/.test(value) && [...value].every(char => char.charCodeAt(0) >= 32)
  && !value.split("/").some(part => !part || part === "." || part === "..");
export const isHomeDocument = (value: string) => /(?:^|\/)(?:readme|index)\.md$/i.test(value);
const paths = (value: unknown, max = 100): string[] => Array.isArray(value) ? [...new Set(value.filter(relativePath))].slice(0, max) : [];

export function workspaceStorageKey(rootPath: string, profile = "default", platform = window.nexus?.platform) {
  const normalized = rootPath.replace(/\\/g, "/").replace(/\/$/, "");
  return `nexus.workspace:${JSON.stringify([profile, platform === "win32" ? normalized.toLowerCase() : normalized])}`;
}

export function loadWorkspaceHome(key: string): WorkspaceHome {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!value || typeof value !== "object") return emptyWorkspaceHome();
    return {
      home: relativePath(value.home) && isHomeDocument(value.home) ? value.home : null,
      pinned: paths(value.pinned), recent: paths(value.recent, 8),
      views: Array.isArray(value.views) ? value.views.filter((view: WorkspaceView) => view && typeof view.name === "string" && view.name.trim() && view.name.length <= 80)
        .slice(0, 20).map((view: WorkspaceView) => ({ name: view.name.trim(), expanded: paths(view.expanded), showOther: view.showOther === true })) : []
    };
  } catch { return emptyWorkspaceHome(); }
}

export function saveWorkspaceHome(key: string, workspace: WorkspaceHome) {
  localStorage.setItem(key, JSON.stringify(workspace));
}

export function chooseWorkspaceHome(workspace: WorkspaceHome, entries: FolderEntry[]): string | null {
  if (workspace.home) return workspace.home;
  const files = entries.filter(entry => entry.kind === "file" && entry.openable);
  return files.find(entry => /^readme\.md$/i.test(entry.name))?.path
    ?? files.find(entry => /^index\.md$/i.test(entry.name))?.path ?? null;
}

export function workspaceRelativePath(root: string, absolute: string, windows = window.nexus?.platform === "win32"): string | null {
  const base = root.replace(/\\/g, "/").replace(/\/$/, "") + "/";
  const target = absolute.replace(/\\/g, "/");
  if (!(windows ? target.toLowerCase().startsWith(base.toLowerCase()) : target.startsWith(base))) return null;
  const relative = target.slice(base.length);
  return relativePath(relative) ? relative : null;
}

/** Relative references follow managed file/folder moves. A deleted designation falls back to automatic home selection. */
export function remapWorkspaceHome(workspace: WorkspaceHome, source: string, destination: string | null, windows = false): WorkspaceHome {
  const compare = (path: string) => windows ? path.toLowerCase() : path;
  const remap = (path: string) => compare(path) === compare(source) || compare(path).startsWith(compare(source) + "/")
    ? destination === null ? null : destination + path.slice(source.length) : path;
  const list = (items: string[]) => [...new Set(items.map(remap).filter((path): path is string => path !== null))];
  const home = workspace.home ? remap(workspace.home) : null;
  return { home: home && isHomeDocument(home) ? home : null, pinned: list(workspace.pinned), recent: list(workspace.recent),
    views: workspace.views.map(view => ({ ...view, expanded: list(view.expanded) })) };
}
