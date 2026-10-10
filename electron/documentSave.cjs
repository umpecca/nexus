const fs = require("node:fs/promises");
const path = require("node:path");
const { resolveWritePath, writeFileAtomically } = require("./atomicFile.cjs");

const pendingSaves = new Map();
const stagedAssets = new Map();
const pathKey = target => process.platform === "win32" ? target.toLowerCase() : target;

async function stageDiagramAsset(assetPath, owner) {
  const key = pathKey(await resolveWritePath(assetPath));
  const owners = stagedAssets.get(key) ?? new Set();
  const alreadyStaged = owners.has(owner);
  owners.add(owner);
  stagedAssets.set(key, owners);
  return () => {
    if (!alreadyStaged) owners.delete(owner);
    if (owners.size === 0) stagedAssets.delete(key);
  };
}

function releaseStagedDiagramAssets(owner) {
  for (const [key, owners] of stagedAssets) {
    owners.delete(owner);
    if (owners.size === 0) stagedAssets.delete(key);
  }
}

function referencesAsset(markdown, name) {
  // Conservative matching also preserves references in HTML, definitions, and escaped/encoded URLs.
  const normalized = markdown.replace(/%[0-9a-f]{2}/gi, match => match.toUpperCase());
  return [name, encodeURI(name), encodeURIComponent(name), name.replace(/[() ]/g, "\\$&")]
    .some(reference => normalized.includes(reference));
}

async function saveDocumentFile(filePath, markdown, keepNames, fileSystem = fs) {
  const target = await resolveWritePath(filePath, fileSystem);
  const key = pathKey(target);
  const previous = pendingSaves.get(key) ?? Promise.resolve();
  const pending = previous.catch(() => {}).then(async () => {
    let oldMarkdown = "";
    if (Array.isArray(keepNames)) {
      try { oldMarkdown = await fileSystem.readFile(target, "utf8"); } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    await writeFileAtomically(target, markdown, fileSystem);
    if (!Array.isArray(keepNames)) return;

    // Only delete assets referenced by the version just replaced. Newly prepared/orphaned assets
    // can belong to another window's pending save and must survive this transaction's cleanup.
    const base = path.basename(filePath).replace(/\.[^.]+$/, "");
    const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const ownPattern = new RegExp(`^${escapedBase}\\.(?:drawio|isoflow)\\.[0-9a-f]{8,12}\\.svg$`, "i");
    const keep = new Set(keepNames);
    try {
      const directory = path.dirname(path.resolve(filePath));
      const canonicalDirectory = await fileSystem.realpath(directory);
      for (const name of await fileSystem.readdir(directory)) {
        if (ownPattern.test(name) && !keep.has(name) && referencesAsset(oldMarkdown, name) &&
            !referencesAsset(markdown, name) &&
            !stagedAssets.has(pathKey(path.join(canonicalDirectory, name)))) {
          await fileSystem.unlink(path.join(directory, name)).catch(() => {});
        }
      }
    } catch {
      // Cleanup is best effort after commit; the document is already saved successfully.
    }
  });
  pendingSaves.set(key, pending);
  try { await pending; } finally {
    if (pendingSaves.get(key) === pending) pendingSaves.delete(key);
  }
}

module.exports = { saveDocumentFile, stageDiagramAsset, releaseStagedDiagramAssets };
