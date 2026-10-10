import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDocumentWatcher } from "./documentWatch.cjs";
import { writeFileAtomically } from "./atomicFile.cjs";
import { saveDocumentFile } from "./documentSave.cjs";

let directory: string;
let documentPath: string;
const managers: ReturnType<typeof createDocumentWatcher>[] = [];

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-watch-test-"));
  documentPath = path.join(directory, "note.md");
  await fs.writeFile(documentPath, "original");
});

afterEach(async () => {
  vi.restoreAllMocks();
  for (const manager of managers.splice(0)) {
    for (const owner of [1, 2, 3]) manager.stop(owner);
  }
  expect(path.dirname(directory)).toBe(path.resolve(os.tmpdir()));
  expect(path.basename(directory)).toMatch(/^nexus-watch-test-/);
  await fs.rm(directory, { recursive: true, force: true });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}

function setup(options: { native?: boolean; readFile?: typeof fs.readFile; realpath?: typeof fs.realpath } = {}) {
  const onChange = vi.fn();
  const handles: (EventEmitter & { callback: (event: string, filename?: string | null) => void; close: ReturnType<typeof vi.fn> })[] = [];
  let reads = 0;
  const manager = createDocumentWatcher({
    onChange,
    debounceMs: 5,
    fileSystem: {
      ...fs,
      realpath: options.realpath ?? fs.realpath,
      readFile: async (...args: Parameters<typeof fs.readFile>) => {
        try { return await (options.readFile ?? fs.readFile)(...args); } finally { reads++; }
      }
    },
    ...(options.native ? {} : {
      watchDirectory: (_directory: string, _options: unknown, callback: (event: string, filename?: string | null) => void) => {
        const handle = Object.assign(new EventEmitter(), { callback, close: vi.fn() });
        handles.push(handle);
        return handle;
      }
    })
  });
  managers.push(manager);
  const settle = async (action: () => void) => {
    const before = reads;
    action();
    await vi.waitFor(() => expect(reads).toBeGreaterThan(before), { interval: 10 });
  };
  const event = (index = 0, filename: string | null = "note.md") => handles[index].callback("change", filename);
  const save = async (owner: number, text: string) => {
    const finish = await manager.beginSave(owner, documentPath, text);
    await saveDocumentFile(documentPath, text);
    return finish;
  };
  return { manager, onChange, handles, settle, event, save };
}

describe("document save acknowledgements", () => {
  it("ignores its own committed content and duplicate notifications, even long after save", async () => {
    const { manager, onChange, settle, event, save } = setup();
    await manager.start(1, documentPath);
    const finish = await save(1, "saved ✓");
    await settle(() => finish(true));
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 10_000);
    await settle(() => event());
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reports an immediate external write before the save completion is acknowledged", async () => {
    const { manager, onChange, settle, save } = setup();
    await manager.start(1, documentPath);
    const finish = await save(1, "saved");
    await fs.writeFile(documentPath, "agent edit");
    await settle(() => finish(true));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(1, expect.objectContaining({ filePath: documentPath, kind: "changed" }));
  });

  it("reports an immediate external write after acknowledgement", async () => {
    const { manager, onChange, settle, save, event } = setup();
    await manager.start(1, documentPath);
    const finish = await save(1, "saved");
    await settle(() => finish(true));
    await fs.writeFile(documentPath, "agent edit");
    await settle(() => event());
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("detects different bytes with the same size and mtime", async () => {
    const { manager, onChange, settle, event } = setup();
    await manager.start(1, documentPath);
    const stats = await fs.stat(documentPath);
    await fs.writeFile(documentPath, "modified");
    await fs.utimes(documentPath, stats.atime, stats.mtime);
    await settle(() => event());
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("does not ignore a later external reversion to an older version Nexus saved", async () => {
    const { manager, onChange, settle, save, event } = setup();
    await manager.start(1, documentPath);
    await settle(() => {});
    for (const text of ["first saved", "second saved"]) {
      const finish = await save(1, text);
      await settle(() => finish(true));
    }
    await fs.writeFile(documentPath, "first saved");
    await settle(() => event());
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("reports deletion immediately after saving", async () => {
    const { manager, onChange, settle, save } = setup();
    await manager.start(1, documentPath);
    const finish = await save(1, "saved");
    await fs.unlink(documentPath);
    await settle(() => finish(true));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(1, expect.objectContaining({ kind: "missing" }));
  });

  it("checks external content after a failed slow save and releases the pending save", async () => {
    const { manager, onChange, settle, event } = setup();
    await manager.start(1, documentPath);
    const finish = await manager.beginSave(1, documentPath, "never committed");
    await fs.writeFile(documentPath, "agent edit during write");
    event();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(onChange).not.toHaveBeenCalled();
    await settle(() => finish(false));
    expect(onChange).toHaveBeenCalledOnce();
    await fs.writeFile(documentPath, "another edit");
    await settle(() => event());
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("leaves unchanged content quiet after a failed save", async () => {
    const { manager, onChange, settle } = setup();
    await manager.start(1, documentPath);
    const finish = await manager.beginSave(1, documentPath, "never committed");
    await settle(() => finish(false));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("notifies another window about the save while keeping the saving window quiet", async () => {
    const { manager, onChange, settle, save } = setup();
    await manager.start(1, documentPath);
    await manager.start(2, documentPath);
    const finish = await save(1, "saved");
    await settle(() => finish(true));
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith(2, expect.objectContaining({ kind: "changed" })));
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("handles overlapping saves by different windows using their own committed baselines", async () => {
    const { manager, onChange, settle, save } = setup();
    await manager.start(1, documentPath);
    await manager.start(2, documentPath);
    const first = await save(1, "first window");
    const second = await save(2, "second window");
    first(true);
    await settle(() => second(true));
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith(1, expect.objectContaining({ kind: "changed" })));
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("does not adopt a newer disk version when acknowledging a read", async () => {
    const { manager, onChange, settle } = setup();
    await manager.start(1, documentPath);
    const loaded = await fs.readFile(documentPath, "utf8");
    await fs.writeFile(documentPath, "edit after read");
    await settle(() => manager.acknowledgeRead(1, documentPath, loaded));
    expect(onChange).toHaveBeenCalledOnce();
  });
});

describe("watcher lifetime and file replacement", () => {
  it("ignores stale disk reads and callbacks after switching documents", async () => {
    const pending = deferred<Buffer>();
    let delay = false;
    const { manager, onChange, settle, event, handles } = setup({
      readFile: (async (...args: Parameters<typeof fs.readFile>) => delay ? pending.promise : fs.readFile(...args)) as typeof fs.readFile
    });
    await manager.start(1, documentPath);
    await settle(() => event());
    delay = true;
    event();
    await new Promise(resolve => setTimeout(resolve, 20));
    delay = false;
    const replacement = path.join(directory, "other.md");
    await fs.writeFile(replacement, "other document");
    await manager.start(1, replacement);
    pending.resolve(Buffer.from("stale read"));
    handles[0].callback("rename", "note.md");
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(handles[0].close).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not let an old save acknowledge a replacement watcher for the same path", async () => {
    const { manager, onChange, settle, save } = setup();
    await manager.start(1, documentPath);
    const finish = await save(1, "old save");
    await manager.start(1, documentPath);
    await fs.writeFile(documentPath, "external after reopen");
    await settle(() => finish(true));
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("ignores reads that started before a save and finish after its acknowledgement", async () => {
    const pending = deferred<Buffer>();
    let delay = false;
    const { manager, onChange, settle, event, save } = setup({
      readFile: (async (...args: Parameters<typeof fs.readFile>) => delay ? pending.promise : fs.readFile(...args)) as typeof fs.readFile
    });
    await manager.start(1, documentPath);
    delay = true;
    event();
    await new Promise(resolve => setTimeout(resolve, 20));
    const finish = await save(1, "saved");
    delay = false;
    await settle(() => finish(true));
    pending.resolve(Buffer.from("old version from before save"));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores unrelated directory changes and handles events without filenames", async () => {
    const { manager, onChange, settle, event } = setup();
    await manager.start(1, documentPath);
    await settle(() => event());
    await fs.writeFile(documentPath, "external");
    event(0, "different.md");
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(onChange).not.toHaveBeenCalled();
    await settle(() => event(0, null));
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("cancels an in-flight watcher start when the window closes", async () => {
    const pending = deferred<string>();
    const { manager, handles } = setup({ realpath: (() => pending.promise) as typeof fs.realpath });
    const starting = manager.start(1, documentPath);
    manager.stop(1);
    pending.resolve(documentPath);
    await starting;
    expect(handles).toHaveLength(0);
  });

  it("reattaches after a watcher error without reporting a readable file as missing", async () => {
    const { manager, onChange, handles, settle, event } = setup();
    await manager.start(1, documentPath);
    await settle(() => handles[0].emit("error", new Error("temporary watcher error")));
    expect(handles).toHaveLength(2);
    expect(onChange).not.toHaveBeenCalled();
    await fs.writeFile(documentPath, "external edit");
    await settle(() => event(1));
    expect(onChange).toHaveBeenCalledWith(1, expect.objectContaining({ kind: "changed" }));
  });

  it("does not acknowledge a new watcher when it replaces one during save initialization", async () => {
    const pending = deferred<string>();
    let delay = false;
    const { manager, onChange, settle } = setup({
      realpath: (async (target: Parameters<typeof fs.realpath>[0]) => delay ? pending.promise : fs.realpath(target)) as typeof fs.realpath
    });
    await manager.start(1, documentPath);
    delay = true;
    const beginning = manager.beginSave(1, documentPath, "old save");
    await new Promise(resolve => setTimeout(resolve, 20));
    delay = false;
    await fs.writeFile(documentPath, "newly opened version");
    await manager.start(1, documentPath);
    pending.resolve(documentPath);
    const finish = await beginning;
    // If the old save were acknowledged on the replacement watcher, the current unchanged bytes
    // would be incorrectly reported as an external change relative to that old save's content.
    await settle(() => finish(true));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("detects successive atomic replacements through the native directory watcher", async () => {
    const { manager, onChange, save } = setup({ native: true });
    await manager.start(1, documentPath);
    const finish = await save(1, "saved");
    await writeFileAtomically(documentPath, "agent first");
    finish(true);
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledOnce());
    await writeFileAtomically(documentPath, "agent second");
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
  });
});
