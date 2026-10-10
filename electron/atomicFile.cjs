const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

async function resolveWritePath(filePath, fileSystem = fs) {
  const absolute = path.resolve(filePath);
  try {
    await fileSystem.lstat(absolute);
  } catch (error) {
    if (error.code === "ENOENT") return path.join(
      await fileSystem.realpath(path.dirname(absolute)), path.basename(absolute));
    throw error;
  }
  // Preserve links, canonicalize directory aliases, and fail safely for dangling links.
  return fileSystem.realpath(absolute);
}

async function writeFileAtomically(filePath, contents, fileSystem = fs) {
  const target = await resolveWritePath(filePath, fileSystem);
  let mode;
  try {
    const stats = await fileSystem.stat(target);
    if (!stats.isFile()) throw new Error("The destination is not a regular file.");
    mode = stats.mode & 0o777;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const temporary = path.join(path.dirname(target), `.nexus-save-${randomUUID()}.tmp`);
  let handle;
  let created = false;
  try {
    handle = await fileSystem.open(temporary, "wx", mode ?? 0o666);
    created = true;
    if (mode !== undefined) await handle.chmod(mode);
    await handle.writeFile(contents, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    // Same-directory rename replaces the old file without exposing a partial document.
    // If the OS refuses replacement, retain the original and report the error.
    await fileSystem.rename(temporary, target);
    created = false;
  } finally {
    if (handle) await handle.close().catch(() => {});
    if (created) await fileSystem.unlink(temporary).catch(() => {});
  }
}

module.exports = { resolveWritePath, writeFileAtomically };
