const fs = require("node:fs/promises");
const { watch } = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { resolveWritePath } = require("./atomicFile.cjs");

const fingerprint = contents => createHash("sha256").update(contents).digest("hex");
const pathKey = target => process.platform === "win32" ? target.toLowerCase() : target;

/** Per-window watchers; save completion acknowledges only the bytes actually submitted to save. */
function createDocumentWatcher({ onChange, fileSystem = fs, watchDirectory = watch, debounceMs = 350 }) {
  const states = new Map();
  const pendingWrites = new Map();

  function stop(owner) {
    const state = states.get(owner);
    if (!state) return;
    states.delete(owner);
    clearTimeout(state.timeout);
    state.watcher?.close();
  }

  function schedule(owner, state) {
    if (states.get(owner) !== state) return;
    clearTimeout(state.timeout);
    state.timeout = setTimeout(() => {
      state.timeout = null;
      void check(owner, state);
    }, debounceMs);
  }

  function attach(owner, state) {
    // Directory watching survives atomic replacements of the document's inode. Watch the real
    // target directory as well when the user opened the document through a symlink.
    const watcher = watchDirectory(path.dirname(state.target), { persistent: false }, (_event, filename) => {
      if (filename == null || pathKey(String(filename)) === pathKey(path.basename(state.target))) {
        schedule(owner, state);
      }
    });
    state.watcher = watcher;
    watcher.on("error", () => {
      if (states.get(owner) !== state || state.watcher !== watcher) return;
      watcher.close();
      state.watcher = null;
      schedule(owner, state);
    });
  }

  async function check(owner, state) {
    if (states.get(owner) !== state || !state.ready || pendingWrites.has(state.key)) return;
    const generation = state.generation;
    let nextHash;
    try {
      nextHash = fingerprint(await fileSystem.readFile(state.target));
    } catch (error) {
      if (states.get(owner) !== state || generation !== state.generation || pendingWrites.has(state.key)) return;
      // Read errors other than absence do not prove the document was removed. Keep watching so a
      // subsequent filesystem event can retry after a transient permission or sharing failure.
      if (error.code === "ENOENT" || error.code === "ENOTDIR") {
        stop(owner);
        onChange(owner, { filePath: state.filePath, kind: "missing", timestamp: Date.now() });
      } else if (!state.watcher) {
        schedule(owner, state);
      }
      return;
    }
    if (states.get(owner) !== state || generation !== state.generation || pendingWrites.has(state.key)) return;
    if (!state.watcher) {
      try { attach(owner, state); } catch { schedule(owner, state); }
    }
    if (nextHash === state.lastHash) return;
    state.lastHash = nextHash;
    state.generation += 1;
    onChange(owner, { filePath: state.filePath, kind: "changed", timestamp: Date.now() });
  }

  async function start(owner, filePath) {
    stop(owner);
    const state = {
      filePath: path.resolve(filePath), target: null, key: null,
      lastHash: null, generation: 0, ready: false, timeout: null, watcher: null
    };
    states.set(owner, state);
    try {
      state.target = await fileSystem.realpath(state.filePath);
      state.key = pathKey(state.target);
      if (states.get(owner) !== state) return { filePath: state.filePath };
      attach(owner, state);
      const generation = state.generation;
      const initialHash = fingerprint(await fileSystem.readFile(state.target));
      if (generation === state.generation) state.lastHash = initialHash;
      if (states.get(owner) === state) {
        state.ready = true;
        schedule(owner, state);
      }
    } catch (error) {
      if (states.get(owner) === state) stop(owner);
      throw error;
    }
    return { filePath: state.filePath };
  }

  function acknowledgeRead(owner, filePath, markdown) {
    const state = states.get(owner);
    if (!state || pathKey(state.filePath) !== pathKey(path.resolve(filePath))) return;
    // Do not reread disk here: a newer edit may already have replaced the version being returned.
    state.lastHash = fingerprint(markdown);
    state.generation += 1;
    schedule(owner, state);
  }

  async function beginSave(owner, filePath, markdown) {
    const savingState = states.get(owner);
    const target = await resolveWritePath(filePath, fileSystem);
    const key = pathKey(target);
    const savedHash = fingerprint(markdown);
    const writes = pendingWrites.get(key) ?? new Set();
    const token = {};
    writes.add(token);
    pendingWrites.set(key, writes);
    for (const state of states.values()) {
      if (state.key === key) state.generation += 1;
    }
    return (committed) => {
      if (!writes.delete(token)) return;
      // A closed/replaced watcher must not inherit acknowledgement from an old document's save.
      if (committed && states.get(owner) === savingState && savingState?.key === key) {
        savingState.lastHash = savedHash;
      }
      if (writes.size === 0) pendingWrites.delete(key);
      for (const [watchingOwner, state] of states) {
        if (state.key === key) {
          state.generation += 1;
          schedule(watchingOwner, state);
        }
      }
    };
  }

  return { start, stop, acknowledgeRead, beginSave };
}

module.exports = { createDocumentWatcher };
