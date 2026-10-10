import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isMarkdownFile, isTextDocument, readDocumentText, MAX_TEXT_BYTES } from "./documentFiles.cjs";
import { isMarkdownFilename, isOpenableDocumentFilename } from "../src/lib/fileDrop";
import types from "./documentFileTypes.json";

describe("knowledge base file types and decoding", () => {
  let fixture: string;
  beforeEach(async () => { fixture = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-text-test-")); });
  afterEach(async () => {
    expect(path.dirname(fixture)).toBe(path.resolve(os.tmpdir()));
    expect(path.basename(fixture)).toMatch(/^nexus-text-test-/);
    await fs.rm(fixture, { recursive: true, force: true });
  });
  it("uses matching native and renderer file types, with plain text separate from Markdown", () => {
    for (const name of [...types.markdown.map(extension => `doc${extension}`), ...types.text.map(extension => `code${extension}`), ...types.names, ".env.local", "image.png", "unknown"]) {
      expect(isTextDocument(name)).toBe(isOpenableDocumentFilename(name));
      expect(isMarkdownFile(name)).toBe(isMarkdownFilename(name));
    }
    expect(isMarkdownFile("notes.txt")).toBe(false);
    expect(isMarkdownFile("README.md")).toBe(true);
  });
  it("preserves UTF-8 text, BOM, line endings, indentation and literal Markdown", async () => {
    const text = '\ufeffconst doc = "**literal**";\r\n\t// é 日本語\r\n  \r\n';
    const file = path.join(fixture, "code.ts");
    await fs.writeFile(file, text);
    expect(await readDocumentText(file)).toBe(text);
  });
  it("rejects binary bytes, invalid UTF-8, and UTF-16 without replacement decoding", async () => {
    const file = path.join(fixture, "data.bin");
    for (const bytes of [Buffer.from([0, 1, 2]), Buffer.from([0xc3, 0x28]), Buffer.from("hello", "utf16le")]) {
      await fs.writeFile(file, bytes);
      await expect(readDocumentText(file)).rejects.toThrow(/binary|UTF-8/);
    }
  });
  it("bounds code/text loads and rejects directories", async () => {
    const file = path.join(fixture, "large.log");
    await fs.writeFile(file, ""); await fs.truncate(file, MAX_TEXT_BYTES + 1);
    await expect(readDocumentText(file)).rejects.toThrow("larger than 8 MB");
    await expect(readDocumentText(fixture)).rejects.toThrow("regular text file");
  });
});
