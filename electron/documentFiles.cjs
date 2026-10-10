const fs = require("node:fs/promises");
const path = require("node:path");
const types = require("./documentFileTypes.json");
const markdownExtensions = new Set(types.markdown);
const textExtensions = new Set(types.text);
const textNames = new Set(types.names);
const MAX_TEXT_BYTES = 8 * 1024 * 1024;
function isMarkdownFile(filename) { return markdownExtensions.has(path.extname(filename).toLowerCase()); }
function isTextDocument(filename) {
  const name = path.basename(filename).toLowerCase();
  return isMarkdownFile(filename) || textExtensions.has(path.extname(name)) || textNames.has(name) || name.startsWith(".env.");
}
async function readDocumentText(filePath) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) throw new Error("Choose a regular text file.");
  if (!isMarkdownFile(filePath) && stat.size > MAX_TEXT_BYTES) throw new Error("Code and text files larger than 8 MB cannot be opened in Nexus.");
  const bytes = await fs.readFile(filePath);
  if (bytes.includes(0)) throw new Error("This file contains binary data or uses an unsupported encoding. Open a UTF-8 text file.");
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new Error("This file is not valid UTF-8 text. Convert it to UTF-8 before opening it in Nexus."); }
  return text;
}
module.exports = { isMarkdownFile, isTextDocument, readDocumentText, MAX_TEXT_BYTES };
