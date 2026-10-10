import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeFileAtomically } from "./atomicFile.cjs";
import { saveDocumentFile, stageDiagramAsset, releaseStagedDiagramAssets } from "./documentSave.cjs";

let directory: string;
let documentPath: string;
const oldAsset = "note.drawio.1111111111.svg";
const newAsset = "note.drawio.2222222222.svg";
const stagedAsset = "note.drawio.3333333333.svg";

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-atomic-test-"));
  documentPath = path.join(directory, "note.md");
});

afterEach(async () => {
  releaseStagedDiagramAssets("another-window");
  expect(path.dirname(directory)).toBe(path.resolve(os.tmpdir()));
  expect(path.basename(directory)).toMatch(/^nexus-atomic-test-/);
  await fs.rm(directory, { recursive: true, force: true });
});

async function seedDiagrams() {
  await fs.writeFile(documentPath, `![old](./${oldAsset})`, "utf8");
  await fs.writeFile(path.join(directory, oldAsset), "old SVG");
  await fs.writeFile(path.join(directory, newAsset), "new SVG");
  await fs.writeFile(path.join(directory, stagedAsset), "another pending save's SVG");
}

// Real files with only the selected operation failing, including a genuinely partial temp write.
function failingFs(operation: string) {
  return {
    ...fs,
    rename: async (from: string, to: string) => {
      if (operation === "rename") throw new Error("rename failed");
      return fs.rename(from, to);
    },
    open: async (...args: Parameters<typeof fs.open>) => {
      if (operation === "open") throw new Error("open failed");
      const handle = await fs.open(...args);
      let closeFailed = false;
      return {
        chmod: handle.chmod.bind(handle),
        writeFile: async (contents: string, encoding: BufferEncoding) => {
          if (operation === "write") {
            await handle.writeFile("partial", encoding);
            throw new Error("write failed");
          }
          return handle.writeFile(contents, encoding);
        },
        sync: async () => {
          if (operation === "sync") throw new Error("sync failed");
          return handle.sync();
        },
        close: async () => {
          if (operation === "close" && !closeFailed) {
            closeFailed = true;
            throw new Error("close failed");
          }
          return handle.close();
        }
      };
    }
  };
}

describe("atomic document writes", () => {
  it("keeps the original readable until the complete, flushed file is renamed beside it", async () => {
    await fs.writeFile(documentPath, "original");
    const contents = "# complete Unicode document ✓\n".repeat(20000);
    let replaced = false;
    await writeFileAtomically(documentPath, contents, {
      ...fs,
      rename: async (temporary: string, target: string) => {
        expect(path.dirname(temporary)).toBe(await fs.realpath(directory));
        expect(target).toBe(await fs.realpath(documentPath));
        expect(await fs.readFile(documentPath, "utf8")).toBe("original");
        expect(await fs.readFile(temporary, "utf8")).toBe(contents);
        await fs.rename(temporary, target);
        replaced = true;
      }
    });
    expect(replaced).toBe(true);
    expect(await fs.readFile(documentPath, "utf8")).toBe(contents);
    expect(await fs.readdir(directory)).toEqual(["note.md"]);
  });

  it.each(["open", "write", "sync", "close", "rename"])(
    "%s failure retains the old document and every diagram, and removes temp files", async (operation) => {
      await seedDiagrams();
      const before = (await fs.readdir(directory)).sort();
      await expect(saveDocumentFile(documentPath, `![new](./${newAsset})`, [newAsset], failingFs(operation)))
        .rejects.toThrow(`${operation} failed`);
      expect(await fs.readFile(documentPath, "utf8")).toBe(`![old](./${oldAsset})`);
      expect(await fs.readFile(path.join(directory, oldAsset), "utf8")).toBe("old SVG");
      expect((await fs.readdir(directory)).sort()).toEqual(before);
    }
  );

  it("creates a new document atomically and leaves no empty file on failure", async () => {
    await expect(writeFileAtomically(documentPath, "new", failingFs("write"))).rejects.toThrow();
    expect(await fs.readdir(directory)).toEqual([]);
    await writeFileAtomically(documentPath, "new");
    expect(await fs.readFile(documentPath, "utf8")).toBe("new");
  });

  it("does not truncate a previously written diagram asset on failure", async () => {
    const asset = path.join(directory, oldAsset);
    await fs.writeFile(asset, "valid SVG");
    await expect(writeFileAtomically(asset, "replacement SVG", failingFs("sync"))).rejects.toThrow();
    expect(await fs.readFile(asset, "utf8")).toBe("valid SVG");
  });

  it("follows file symlinks while retaining the link", async () => {
    const target = path.join(directory, "target.md");
    await fs.writeFile(target, "old target");
    await fs.symlink(target, documentPath, "file");
    await writeFileAtomically(documentPath, "new target");
    expect((await fs.lstat(documentPath)).isSymbolicLink()).toBe(true);
    expect(await fs.readFile(target, "utf8")).toBe("new target");
  });

  it("does not replace a dangling symlink", async () => {
    await fs.symlink(path.join(directory, "missing.md"), documentPath, "file");
    await expect(writeFileAtomically(documentPath, "new")).rejects.toMatchObject({ code: "ENOENT" });
    expect((await fs.lstat(documentPath)).isSymbolicLink()).toBe(true);
  });

  it.skipIf(process.platform === "win32")("retains existing POSIX file permissions", async () => {
    await fs.writeFile(documentPath, "old", { mode: 0o640 });
    await writeFileAtomically(documentPath, "new");
    expect((await fs.stat(documentPath)).mode & 0o777).toBe(0o640);
  });
});

describe("diagram cleanup after commit", () => {
  it("preserves an old asset another window is reusing for its pending save", async () => {
    await seedDiagrams();
    await stageDiagramAsset(path.join(directory, oldAsset), "another-window");
    await saveDocumentFile(documentPath, `![new](./${newAsset})`, [newAsset]);
    expect(await fs.readFile(path.join(directory, oldAsset), "utf8")).toBe("old SVG");
    await saveDocumentFile(documentPath, `![reused](./${oldAsset})`, [oldAsset]);
    releaseStagedDiagramAssets("another-window");
    expect(await fs.readFile(documentPath, "utf8")).toContain(oldAsset);
    expect(await fs.readFile(path.join(directory, oldAsset), "utf8")).toBe("old SVG");
  });
  it("deletes replaced assets only after commit and keeps new, staged, and unrelated SVGs", async () => {
    await seedDiagrams();
    await fs.writeFile(path.join(directory, "someone-else.drawio.1111111111.svg"), "other document");
    await fs.writeFile(path.join(directory, "note.custom.svg"), "user asset");
    const contents = `![new](./${newAsset})`;
    const deleted: string[] = [];
    await saveDocumentFile(documentPath, contents, [newAsset], {
      ...fs,
      unlink: async (file: string) => {
        expect(await fs.readFile(documentPath, "utf8")).toBe(contents);
        deleted.push(path.basename(file));
        return fs.unlink(file);
      }
    });
    expect(deleted).toEqual([oldAsset]);
    expect((await fs.readdir(directory)).sort()).toEqual([
      newAsset, stagedAsset, "note.md", "note.custom.svg", "someone-else.drawio.1111111111.svg"
    ].sort());
  });

  it("preserves still-referenced local assets even if they weren't externalized this time", async () => {
    await seedDiagrams();
    const contents = `![old](./${oldAsset})\n![new](./${newAsset})`;
    await saveDocumentFile(documentPath, contents, [newAsset]);
    expect(await fs.readFile(path.join(directory, oldAsset), "utf8")).toBe("old SVG");
  });

  it("preserves URL-encoded assets with spaces and unicode in their name", async () => {
    documentPath = path.join(directory, "note ü.md");
    const asset = "note ü.drawio.1111111111.svg";
    await fs.writeFile(path.join(directory, asset), "SVG");
    await fs.writeFile(documentPath, `![old](<${asset}>)`);
    await saveDocumentFile(documentPath, `![still used](${encodeURI(asset).toLowerCase()})`, []);
    expect(await fs.readFile(path.join(directory, asset), "utf8")).toBe("SVG");
  });

  it.each(["readdir", "unlink"])("%s cleanup failure still reports a successfully saved document", async (operation) => {
    await seedDiagrams();
    const fileSystem = { ...fs, [operation]: async () => { throw new Error("cleanup failed"); } };
    await expect(saveDocumentFile(documentPath, "saved", [], fileSystem)).resolves.toBeUndefined();
    expect(await fs.readFile(documentPath, "utf8")).toBe("saved");
    expect(await fs.readFile(path.join(directory, oldAsset), "utf8")).toBe("old SVG");
  });

  it("does no cleanup when the diagram-as-files setting is off", async () => {
    await seedDiagrams();
    await saveDocumentFile(documentPath, "saved inline");
    expect(await fs.readFile(path.join(directory, oldAsset), "utf8")).toBe("old SVG");
  });

  it("serializes commits and cleanup across windows saving the same file", async () => {
    await seedDiagrams();
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    let started!: () => void;
    const atRename = new Promise<void>(resolve => { started = resolve; });
    const first = saveDocumentFile(documentPath, `![new](./${newAsset})`, [newAsset], {
      ...fs,
      rename: async (temporary: string, target: string) => {
        started();
        await blocked;
        await fs.rename(temporary, target);
      }
    });
    await atRename;
    const second = saveDocumentFile(documentPath, `![staged](./${stagedAsset})`, [stagedAsset]);
    expect(await fs.readFile(documentPath, "utf8")).toBe(`![old](./${oldAsset})`);
    release();
    await Promise.all([first, second]);
    expect(await fs.readFile(documentPath, "utf8")).toBe(`![staged](./${stagedAsset})`);
    expect(await fs.readFile(path.join(directory, stagedAsset), "utf8")).toContain("pending save");
    expect((await fs.readdir(directory)).sort()).toEqual([stagedAsset, "note.md"].sort());
  });

  it("allows retry after a failed replacement without losing the old diagram", async () => {
    await seedDiagrams();
    await expect(saveDocumentFile(documentPath, "failed", [], failingFs("rename"))).rejects.toThrow();
    await saveDocumentFile(documentPath, `![new](./${newAsset})`, [newAsset]);
    expect(await fs.readFile(documentPath, "utf8")).toBe(`![new](./${newAsset})`);
    expect(await fs.readFile(path.join(directory, newAsset), "utf8")).toBe("new SVG");
  });
});
