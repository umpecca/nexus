const fs = require("node:fs/promises");
const { watch } = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { isTextDocument } = require("./documentFiles.cjs");

const documentExtensions = new Set([".md", ".markdown", ".mdx", ".txt"]);
const key = value => process.platform === "win32" ? value.toLowerCase() : value;
function containsPath(parent, target) {
  const relative = path.relative(key(path.resolve(parent)), key(path.resolve(target)));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}
function validateName(name) {
  if (typeof name !== "string" || !name || name.trim() !== name || /[\\/\x00-\x1f<>:"|?*]/.test(name) ||
      name === "." || name === ".." || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) {
    throw new Error("Use a file name without slashes, reserved names, or trailing dots/spaces.");
  }
}

/** A native picker grants one root per window. Renderer paths are relative to that root. */
function createFolderBrowser({ trash, onChange = () => {}, beforeMutation = () => {}, onMutation = () => {} }) {
  const sessions = new Map();
  const stagedCopies = new Set();
  let mutating = false;
  let saves = 0;

  function close(owner) {
    const session = sessions.get(owner);
    if (!session) return;
    for (const { watcher, timer } of session.watchers.values()) {
      watcher.close();
      clearTimeout(timer);
    }
    sessions.delete(owner);
  }
  async function open(owner, folderPath) {
    const root = await fs.realpath(folderPath);
    if (!(await fs.stat(root)).isDirectory()) throw new Error("Choose a folder.");
    close(owner);
    const info = { id: randomUUID(), path: root, name: path.basename(root) || root };
    sessions.set(owner, { info, watchers: new Map() });
    return info;
  }
  function sessionFor(owner, rootId) {
    const session = sessions.get(owner);
    if (!session || session.info.id !== rootId) throw new Error("This folder is no longer open.");
    return session;
  }
  async function resolve(session, relative) {
    if (typeof relative !== "string" || path.isAbsolute(relative) || relative.includes("\0") ||
        relative.includes(":") || relative.split(/[\\/]/).some(part => part === ".." || part === ".")) {
      throw new Error("The path must stay inside the opened folder.");
    }
    const root = session.info.path;
    const target = path.resolve(root, relative);
    if (!containsPath(root, target)) throw new Error("The path is outside the opened folder.");
    // Reject symlinks/junctions in every component, even those pointing inside the folder.
    let current = root;
    for (const part of path.relative(root, target).split(path.sep).filter(Boolean)) {
      current = path.join(current, part);
      if ((await fs.lstat(current)).isSymbolicLink()) throw new Error("Linked files and folders are not managed by the folder browser.");
    }
    if (!containsPath(root, await fs.realpath(target))) throw new Error("The path is outside the opened folder.");
    return target;
  }
  function observe(owner, session, relative, directory) {
    if (session.watchers.has(relative)) return;
    const record = { watcher: null, timer: undefined };
    const changed = () => {
      clearTimeout(record.timer);
      record.timer = setTimeout(() => {
        if (sessions.get(owner) === session) onChange(owner, { rootId: session.info.id, path: relative });
      }, 120);
    };
    try {
      record.watcher = watch(directory, changed);
      record.watcher.on("error", () => {
        record.watcher.close();
        session.watchers.delete(relative);
        changed();
      });
      session.watchers.set(relative, record);
    } catch { /* Refresh remains available when filesystem watching is unsupported. */ }
  }
  async function list(owner, { rootId, path: relative }) {
    const session = sessionFor(owner, rootId);
    const directory = await resolve(session, relative);
    observe(owner, session, relative, directory);
    const entries = await fs.readdir(directory, { withFileTypes: true });
    sessionFor(owner, rootId);
    return entries.filter(entry => !stagedCopies.has(path.join(directory, entry.name)) && (entry.isDirectory() || entry.isFile() || entry.isSymbolicLink())).map(entry => ({
      name: entry.name,
      path: path.relative(session.info.path, path.join(directory, entry.name)).split(path.sep).join("/"),
      kind: entry.isSymbolicLink() ? "link" : entry.isDirectory() ? "folder" : "file",
      openable: entry.isFile() && isTextDocument(entry.name)
    })).sort((a, b) => Number(b.kind === "folder") - Number(a.kind === "folder") || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  }
  async function getPath(owner, payload) {
    return resolve(sessionFor(owner, payload.rootId), payload.path);
  }
  async function documentPath(owner, payload) {
    const target = await getPath(owner, payload);
    if (!(await fs.stat(target)).isFile()) {
      throw new Error("Select a text document.");
    }
    return target;
  }
  function beginSave() {
    if (mutating) throw new Error("A folder operation is in progress. Try saving again when it finishes.");
    saves++;
    return () => { saves--; };
  }
  async function copyTree(source, destination) {
    const stat = await fs.lstat(source);
    if (stat.isSymbolicLink()) throw new Error("Folders containing linked files cannot be copied.");
    if (stat.isDirectory()) {
      await fs.mkdir(destination); // Exclusive reservation; never merge with an existing directory.
      for (const name of await fs.readdir(source)) await copyTree(path.join(source, name), path.join(destination, name));
    } else if (stat.isFile()) {
      await fs.copyFile(source, destination, fs.constants.COPYFILE_EXCL);
    } else throw new Error("Only regular files and folders can be copied.");
  }
  async function mutate(owner, payload, confirmTrash = async () => true) {
    if (mutating || saves) throw new Error("Wait for the current file operation or save to finish, then try again.");
    mutating = true;
    let reservedCopy;
    let copyRoot;
    try {
      const session = sessionFor(owner, payload.rootId);
      const root = session.info.path;
      copyRoot = root;
      const source = await resolve(session, payload.path);
      let destination;
      const { action, name, destination: parentPath } = payload;
      if (["newFile", "newFolder", "copy", "move", "rename"].includes(action)) {
        validateName(name);
        const parent = action === "rename" ? path.dirname(source) : await resolve(session, parentPath ?? payload.path);
        if (!(await fs.stat(parent)).isDirectory()) throw new Error("Choose a destination folder.");
        destination = path.join(parent, name);
        if (!containsPath(root, destination)) throw new Error("The destination is outside the opened folder.");
        try { await fs.lstat(destination); throw new Error("An item with that name already exists. Choose another name."); }
        catch (error) { if (error.code !== "ENOENT") throw error; }
      }
      if (!["newFile", "newFolder"].includes(action) && key(source) === key(root)) {
        throw new Error("The opened folder itself cannot be changed.");
      }
      if (["move", "copy"].includes(action) && containsPath(source, destination)) {
        throw new Error("A folder cannot be moved or copied into itself.");
      }
      // Recheck the grant after async work (a user may have closed/replaced the folder).
      sessionFor(owner, payload.rootId);
      await beforeMutation({ action, source, destination: destination ?? null });
      sessionFor(owner, payload.rootId);
      if (action === "newFile") {
        if (!documentExtensions.has(path.extname(name).toLowerCase())) throw new Error("New documents must use .md, .markdown, .mdx, or .txt.");
        await fs.writeFile(destination, "", { flag: "wx" });
      } else if (action === "newFolder") await fs.mkdir(destination);
      else if (action === "rename" || action === "move") {
        // The existence check above is repeated immediately before renaming. Never intentionally replace.
        try { await fs.lstat(destination); throw new Error("The destination already exists."); }
        catch (error) { if (error.code !== "ENOENT") throw error; }
        await fs.rename(source, destination);
      } else if (action === "copy") {
        // Stage in a uniquely reserved sibling folder, so failures never leave a partial user item.
        reservedCopy = await fs.mkdtemp(path.join(path.dirname(destination), ".nexus-copy-"));
        stagedCopies.add(reservedCopy);
        const staged = path.join(reservedCopy, "item");
        await copyTree(source, staged);
        try { await fs.lstat(destination); throw new Error("The destination already exists."); }
        catch (error) { if (error.code !== "ENOENT") throw error; }
        await fs.rename(staged, destination);
      } else if (action === "trash") {
        if (!(await confirmTrash(source))) return { canceled: true };
        sessionFor(owner, payload.rootId);
        await resolve(session, payload.path);
        await trash(source);
      } else throw new Error("Unknown folder operation.");
      const event = { action, source, destination: destination ?? null };
      await onMutation(event);
      for (const [sessionOwner, current] of Array.from(sessions)) {
        // Discard directory watches after mutations: renamed/removed directories otherwise retain stale handles.
        for (const { watcher, timer } of current.watchers.values()) { watcher.close(); clearTimeout(timer); }
        current.watchers.clear();
        let rootChange;
        if (["move", "rename", "trash"].includes(action) && containsPath(source, current.info.path)) {
          if (!destination) {
            close(sessionOwner);
            onChange(sessionOwner, { rootId: current.info.id, path: null, root: null });
            continue;
          }
          current.info.path = path.join(destination, path.relative(source, current.info.path));
          current.info.name = path.basename(current.info.path);
          rootChange = { ...current.info };
        }
        onChange(sessionOwner, { rootId: current.info.id, path: null, ...(rootChange ? { root: rootChange } : {}) });
      }
      return { canceled: false, path: destination ? path.relative(root, destination).split(path.sep).join("/") : null };
    } finally {
      if (reservedCopy) {
        stagedCopies.delete(reservedCopy);
        // This exact absolute temporary directory was created by this operation inside the granted root.
        const resolved = await fs.realpath(reservedCopy).catch(() => null);
        if (resolved && containsPath(copyRoot, resolved) && path.basename(resolved).startsWith(".nexus-copy-")) {
          await fs.rm(resolved, { recursive: true, force: true }).catch(() => {});
        }
      }
      mutating = false;
    }
  }
  return { open, close, list, getPath, documentPath, mutate, beginSave };
}
module.exports = { createFolderBrowser, containsPath, validateName };
