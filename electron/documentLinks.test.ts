import { describe, expect, it } from "vitest";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveDocumentLink } from "./documentLinks.cjs";
import { isValidRendererPayload } from "./rendererIpc.cjs";

const documentPath = path.resolve("workspace/docs/index.md");
describe("document link resolution", () => {
  it.each(["guide.md", "GUIDE.MARKDOWN", "guide.mdx", "../guide.md", "nested/My%20Guide.md?view=1#setup%20here"])("resolves %s from the document directory", href => {
    const address = decodeURIComponent(href.split(/[?#]/)[0]);
    expect(resolveDocumentLink(documentPath, href)).toEqual({ kind: "document", filePath: path.resolve(path.dirname(documentPath), address), fragment: href.includes("#") ? "setup here" : "" });
  });
  it("supports absolute paths and file URLs with encoded reserved characters", () => {
    const target = path.resolve("workspace/My # Guide.md");
    expect(resolveDocumentLink(undefined, pathToFileURL(target).href + "#setup")).toEqual({ kind: "document", filePath: target, fragment: "setup" });
    const absolute = path.resolve("workspace/guide.md");
    expect(resolveDocumentLink(undefined, absolute)).toEqual({ kind: "document", filePath: absolute, fragment: "" });
  });
  it.each(["https://example.com/guide.md#setup", "http://example.com/doc.md", "mailto:owner@example.com", "//example.com/doc.md"])("keeps %s external", href => {
    expect(resolveDocumentLink(documentPath, href)).toEqual({ kind: "external", url: href.startsWith("//") ? `https:${href}` : href });
  });
  it("resolves headings without a saved document", () => {
    expect(resolveDocumentLink(undefined, "#review%20date")).toEqual({ kind: "heading", fragment: "review date" });
  });
  it("requires a saved base for relative file links", () => {
    expect(() => resolveDocumentLink(undefined, "guide.md")).toThrow("Save this document");
  });
  it.each(["javascript:alert(1)", "data:text/markdown,test.md", "ftp://example.com/doc.md", "note.txt", "run.exe", "bad%00.md", "bad%ZZ.md", "\0evil.md", ""])("rejects unsupported/invalid %s", href => {
    expect(() => resolveDocumentLink(documentPath, href)).toThrow();
  });
  it("validates link IPC payloads", () => {
    expect(isValidRendererPayload("link:resolve", [{ documentPath, href: "guide.md" }])).toBe(true);
    expect(isValidRendererPayload("link:resolve", [{ href: "#setup" }])).toBe(true);
    for (const payload of [null, {}, { href: "" }, { href: [] }, { href: "guide.md", documentPath: 42 }, { href: "x".repeat(32769) }]) {
      expect(isValidRendererPayload("link:resolve", [payload])).toBe(false);
    }
  });
});
