const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { fileURLToPath } = require("node:url");
const { toMarkdownImageSource, decodeImagePath } = require("./imagePaths.cjs");

const MAX_IMAGE_BYTES = 40 * 1024 * 1024;
const MIME_EXTENSIONS = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg", "image/bmp": "bmp", "image/avif": "avif", "image/x-icon": "ico" };
function localPath(documentPath, source) {
  if (/^file:/i.test(source)) return fileURLToPath(source);
  if (/^[a-z][a-z\d+.-]*:/i.test(source) && !/^[a-z]:[\\/]/i.test(source)) return null;
  if (source.startsWith("//") || source.startsWith("#")) return null;
  const pathname = decodeImagePath(source.split(/[?#]/)[0]);
  if (path.isAbsolute(pathname)) return pathname;
  return documentPath ? path.resolve(path.dirname(documentPath), pathname) : null;
}
function decodeImage(source) {
  const match = /^data:(image\/[a-z0-9.+-]+)([^,]*),([\s\S]*)$/i.exec(source);
  if (!match || !MIME_EXTENSIONS[match[1].toLowerCase()]) throw new Error("Unsupported image format.");
  const mimeType = match[1].toLowerCase();
  const base64 = /;base64/i.test(match[2]);
  if (base64 && (!/^[a-z0-9+/]*={0,2}$/i.test(match[3]) || match[3].length % 4 === 1 ||
    (match[3].includes("=") && match[3].length % 4 !== 0))) throw new Error("Invalid base64 image data.");
  if (base64 && match[3].length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) throw new Error("Images must be nonempty and at most 40 MB.");
  const bytes = base64 ? Buffer.from(match[3], "base64") : Buffer.from(decodeURIComponent(match[3]), "utf8");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error("Images must be nonempty and at most 40 MB.");
  return { bytes, mimeType };
}
const mimeForPath = filePath => Object.entries(MIME_EXTENSIONS).find(([, ext]) => ext === path.extname(filePath).slice(1).toLowerCase())?.[0]
  ?? (/\.jpe?g$/i.test(filePath) ? "image/jpeg" : null);
async function readImage(filePath) {
  const mimeType = mimeForPath(filePath);
  if (!mimeType) throw new Error("Choose a supported image file.");
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || !stat.size || stat.size > MAX_IMAGE_BYTES) throw new Error("Images must be nonempty and at most 40 MB.");
  const bytes = await fs.readFile(filePath);
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error("Image exceeds 40 MB.");
  return { mimeType, bytes };
}
const dataUrl = ({ bytes, mimeType }) => `data:${mimeType};base64,${bytes.toString("base64")}`;
async function inspectAsset(documentPath, source) {
  if (/^data:/i.test(source)) {
    const image = decodeImage(source);
    return { kind: "embedded", bytes: image.bytes.length, preview: source };
  }
  if (/^(https?:)?\/\//i.test(source)) return { kind: "remote", preview: source };
  const filePath = localPath(documentPath, source);
  if (!filePath) return { kind: "unresolved", error: "Save the document to resolve relative image paths." };
  try {
    const image = await readImage(filePath);
    return { kind: "local", bytes: image.bytes.length, preview: dataUrl(image), filePath };
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return { kind: "missing", filePath, error: "Image file is missing." };
    return { kind: "unavailable", filePath, error: error.message };
  }
}
async function embedAsset(documentPath, source) {
  if (/^data:/i.test(source)) { decodeImage(source); return source; }
  const filePath = localPath(documentPath, source);
  if (filePath) return dataUrl(await readImage(filePath));
  if (!/^https?:\/\//i.test(source) && !source.startsWith("//")) throw new Error("This image source cannot be embedded.");
  const response = await fetch(source.startsWith("//") ? `https:${source}` : source, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Image download failed (${response.status}).`);
  const mimeType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (!MIME_EXTENSIONS[mimeType]) { await response.body?.cancel(); throw new Error("The URL did not return a supported image."); }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_IMAGE_BYTES) throw new Error("Image exceeds 40 MB.");
    chunks.push(chunk);
  }
  if (!size) throw new Error("The image is empty.");
  return dataUrl({ bytes: Buffer.concat(chunks), mimeType });
}

function registerAssetHandlers({ rendererIpc, dialog, BrowserWindow }) {
  rendererIpc.handle("asset:inspect", async (_event, { documentPath, source }) => {
    try { return await inspectAsset(documentPath, source); }
    catch (error) { return { kind: "unavailable", error: error.message }; }
  });
  rendererIpc.handle("asset:action", async (event, { documentPath, source, action }) => {
    try {
      if (action === "embed") return { source: await embedAsset(documentPath, source) };
      const window = BrowserWindow.fromWebContents(event.sender);
      const show = (method, options) => window ? dialog[method](window, options) : dialog[method](options);
      if (action === "replace" || action === "locate") {
        const result = await show("showOpenDialog", { title: action === "locate" ? "Locate Missing Image" : "Replace Image", properties: ["openFile"], filters: [{ name: "Images", extensions: [...Object.values(MIME_EXTENSIONS), "jpeg"] }] });
        if (result.canceled || !result.filePaths.length) return { canceled: true };
        const image = await readImage(result.filePaths[0]);
        const nextSource = /^data:/i.test(source) && action === "replace" ? dataUrl(image)
          : toMarkdownImageSource(documentPath, result.filePaths[0]).split("/").map(part => encodeURIComponent(part)).join("/");
        // Absolute file URLs already carry their own encoding and scheme.
        return { source: nextSource.startsWith("file%3A") ? toMarkdownImageSource(documentPath, result.filePaths[0]) : nextSource };
      }
      if (!documentPath) throw new Error("Save the document before extracting an image to a relative file.");
      const image = decodeImage(source);
      const name = `image-${crypto.createHash("sha256").update(image.bytes).digest("hex").slice(0, 10)}.${MIME_EXTENSIONS[image.mimeType]}`;
      const result = await show("showSaveDialog", { title: "Extract Image to a New File", defaultPath: path.join(path.dirname(documentPath), name), filters: [{ name: "Image", extensions: [MIME_EXTENSIONS[image.mimeType]] }] });
      if (result.canceled || !result.filePath) return { canceled: true };
      const target = path.resolve(result.filePath);
      const relative = path.relative(path.dirname(documentPath), target);
      if (!relative || path.isAbsolute(relative) || target.toLowerCase() === path.resolve(documentPath).toLowerCase()) throw new Error("Choose an image file on the document's drive.");
      if (mimeForPath(target) !== image.mimeType) throw new Error("Keep the image's original file extension.");
      // Exclusive creation: never overwrite an existing image or document.
      const temporary = path.join(path.dirname(target), `.nexus-asset-${crypto.randomUUID()}.tmp`);
      const handle = await fs.open(temporary, "wx");
      try {
        try { await handle.writeFile(image.bytes); await handle.sync(); }
        finally { await handle.close(); }
        await fs.link(temporary, target);
      } finally { await fs.unlink(temporary); }
      return { source: toMarkdownImageSource(documentPath, target).split("/").map(part => encodeURIComponent(part)).join("/"), filePath: target };
    } catch (error) { return { error: error.code === "EEXIST" ? "That file already exists. Choose a new filename." : error.message }; }
  });
}
module.exports = { registerAssetHandlers, inspectAsset, embedAsset, decodeImage, localPath };
