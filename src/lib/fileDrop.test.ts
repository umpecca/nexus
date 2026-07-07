import { describe, expect, it } from "vitest";
import { isOpenableDocumentFilename } from "./fileDrop";

describe("isOpenableDocumentFilename", () => {
  it("accepts the known document extensions", () => {
    expect(isOpenableDocumentFilename("notes.md")).toBe(true);
    expect(isOpenableDocumentFilename("README.markdown")).toBe(true);
    expect(isOpenableDocumentFilename("doc.mdx")).toBe(true);
    expect(isOpenableDocumentFilename("plain.txt")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isOpenableDocumentFilename("NOTES.MD")).toBe(true);
    expect(isOpenableDocumentFilename("Doc.Markdown")).toBe(true);
  });

  it("rejects other file types", () => {
    expect(isOpenableDocumentFilename("photo.png")).toBe(false);
    expect(isOpenableDocumentFilename("archive.zip")).toBe(false);
    expect(isOpenableDocumentFilename("script.mdxyz")).toBe(false);
    expect(isOpenableDocumentFilename("noextension")).toBe(false);
  });

  it("matches the extension, not a substring of the name", () => {
    expect(isOpenableDocumentFilename("md")).toBe(false);
    expect(isOpenableDocumentFilename("my.md.backup")).toBe(false);
  });
});
