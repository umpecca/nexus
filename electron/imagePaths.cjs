// Decides what string to drop into a freshly inserted markdown image's `(src)` after the user picks
// a file from the import dialog. When the document is saved on disk we prefer a path relative to the
// document's own folder (e.g. `./images/logo.png`) so the markdown stays portable — move the folder,
// the references still resolve. Untitled documents have no folder to anchor against, so we fall back
// to an absolute `file://` URL, which is also what every caller did before relative paths existed.
//
// The renderer's preview already understands both forms (see `resolveImagePreviewSource` in main.cjs),
// so whichever string we return here renders identically in the editor.

const path = require("path");
const { pathToFileURL } = require("url");

function defaultToFileUrl(absolutePath) {
  return pathToFileURL(absolutePath).href;
}

// `documentPath`   absolute path of the saved markdown file, or "" / undefined when untitled.
// `imageFilePath`  absolute path of the image the user chose.
// The `pathApi`/`toFileUrl` overrides exist purely so the unit test can pin Windows vs. POSIX
// semantics regardless of the host OS; production callers use the Node defaults.
function toMarkdownImageSource(
  documentPath,
  imageFilePath,
  { pathApi = path, toFileUrl = defaultToFileUrl } = {}
) {
  const absoluteImagePath = pathApi.resolve(imageFilePath);

  // No document folder to be relative to (untitled buffer) — keep the absolute reference.
  if (typeof documentPath !== "string" || documentPath.trim().length === 0) {
    return toFileUrl(absoluteImagePath);
  }

  const documentDir = pathApi.dirname(pathApi.resolve(documentPath));
  const relativePath = pathApi.relative(documentDir, absoluteImagePath);

  // `path.relative` hands back an absolute path when the two live on different Windows drives
  // (e.g. doc on C:, image on D:) because no relative form exists. Fall back to the file URL.
  if (!relativePath || pathApi.isAbsolute(relativePath)) {
    return toFileUrl(absoluteImagePath);
  }

  // Markdown wants forward slashes on every platform.
  const posixRelative = relativePath.split(pathApi.sep).join("/");

  // Paths into a sibling/parent already start with `..`; make same- and child-folder paths
  // explicitly relative with a leading `./` so the reference is unambiguous.
  return posixRelative.startsWith(".") ? posixRelative : `./${posixRelative}`;
}

module.exports = { toMarkdownImageSource };
