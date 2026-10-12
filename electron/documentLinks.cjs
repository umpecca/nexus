const path = require("node:path");
const { fileURLToPath } = require("node:url");
const { isMarkdownFile } = require("./documentFiles.cjs");

// Resolve against the document, never the Electron renderer's index.html URL.
function resolveDocumentLink(documentPath, href) {
  const source = href.trim();
  if (!source || /[\u0000-\u001f]/.test(source)) throw new Error("This link has an invalid address.");
  if (/^(https?:|mailto:)/i.test(source) || source.startsWith("//")) {
    const url = new URL(source.startsWith("//") ? `https:${source}` : source);
    return { kind: "external", url: url.href };
  }
  const hash = source.indexOf("#");
  const fragment = hash < 0 ? "" : decodeURIComponent(source.slice(hash + 1));
  const address = (hash < 0 ? source : source.slice(0, hash)).split("?")[0];
  if (!address) return { kind: "heading", fragment };
  let filePath;
  if (/^file:/i.test(address)) {
    filePath = fileURLToPath(address);
  } else {
    if (/^[a-z][a-z\d+.-]*:/i.test(address) && !/^[a-z]:[\\/]/i.test(address)) {
      throw new Error("This link type cannot be opened in Nexus.");
    }
    const decoded = decodeURIComponent(address);
    if (!path.isAbsolute(decoded) && !documentPath) {
      throw new Error("Save this document before opening a relative file link.");
    }
    filePath = path.resolve(documentPath ? path.dirname(documentPath) : ".", decoded);
  }
  if (filePath.includes("\0")) throw new Error("This link has an invalid address.");
  if (!isMarkdownFile(filePath)) throw new Error("Only local Markdown file links can be opened in Nexus.");
  return { kind: "document", filePath, fragment };
}

module.exports = { resolveDocumentLink };
