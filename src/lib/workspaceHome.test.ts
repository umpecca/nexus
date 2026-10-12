// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { chooseWorkspaceHome, emptyWorkspaceHome, loadWorkspaceHome, remapWorkspaceHome, saveWorkspaceHome, workspaceRelativePath, workspaceStorageKey } from "./workspaceHome";

describe("workspace home", () => {
  beforeEach(() => localStorage.clear());
  const entry = (name: string, kind: "file" | "folder" | "link" = "file") => ({ name, path: name, kind, openable: kind === "file" });
  it("prefers README, falls back to index, and respects a designation without following linked items", () => {
    const workspace = emptyWorkspaceHome();
    expect(chooseWorkspaceHome(workspace, [entry("index.md"), entry("readme.MD")])).toBe("readme.MD");
    expect(chooseWorkspaceHome(workspace, [entry("README.md", "link"), entry("index.md")])).toBe("index.md");
    expect(chooseWorkspaceHome(workspace, [entry("README.md", "folder")])).toBeNull();
    expect(chooseWorkspaceHome({ ...workspace, home: "nested/index.md" }, [])).toBe("nested/index.md");
  });
  it("persists per folder and profile, using case-insensitive Windows root keys", () => {
    const key = workspaceStorageKey("C:\\Docs", "writer", "win32");
    const workspace = { home: "README.md", pinned: ["nested/note.md"], recent: ["README.md"], views: [{ name: "References", expanded: ["nested"], showOther: true }] };
    saveWorkspaceHome(key, workspace);
    expect(loadWorkspaceHome(workspaceStorageKey("c:/docs/", "writer", "win32"))).toEqual(workspace);
    expect(loadWorkspaceHome(workspaceStorageKey("C:/elsewhere", "writer", "win32"))).toEqual(emptyWorkspaceHome());
    expect(loadWorkspaceHome(workspaceStorageKey("C:/Docs", "reader", "win32"))).toEqual(emptyWorkspaceHome());
    expect(workspaceStorageKey("/Docs", "writer", "darwin")).not.toBe(workspaceStorageKey("/docs", "writer", "darwin"));
  });
  it("ignores corrupt state and rejects traversal or absolute persisted shortcuts", () => {
    localStorage.setItem("state", "not JSON");
    expect(loadWorkspaceHome("state")).toEqual(emptyWorkspaceHome());
    localStorage.setItem("state", JSON.stringify({ home: "../README.md", pinned: ["/absolute.md", "C:note.md", "a/../note.md", "good.md", "good.md"], views: [null, { name: "View", expanded: ["../outside", "nested"], showOther: true }] }));
    expect(loadWorkspaceHome("state")).toEqual({ home: null, pinned: ["good.md"], recent: [], views: [{ name: "View", expanded: ["nested"], showOther: true }] });
    expect(workspaceRelativePath("C:/docs", "C:/docs-other/note.md", true)).toBeNull();
    expect(workspaceRelativePath("C:/docs", "C:/docs/../secret.md", true)).toBeNull();
    expect(workspaceRelativePath("C:/docs", "c:\\DOCS\\nested\\note.md", true)).toBe("nested/note.md");
  });
  it("remaps documents and saved folder expansions, prunes deleted items, and resets an invalid home name", () => {
    const workspace = { home: "nested/README.md", pinned: ["nested/note.md", "nested-other/note.md"], recent: ["nested/README.md"], views: [{ name: "View", expanded: ["nested", "nested/child"], showOther: false }] };
    const moved = remapWorkspaceHome(workspace, "NESTED", "references", true);
    expect(moved).toEqual({ home: "references/README.md", pinned: ["references/note.md", "nested-other/note.md"], recent: ["references/README.md"], views: [{ name: "View", expanded: ["references", "references/child"], showOther: false }] });
    expect(remapWorkspaceHome(moved, "references", null)).toEqual({ home: null, pinned: ["nested-other/note.md"], recent: [], views: [{ name: "View", expanded: [], showOther: false }] });
    expect(remapWorkspaceHome(workspace, "nested/README.md", "nested/intro.md").home).toBeNull();
  });
});
