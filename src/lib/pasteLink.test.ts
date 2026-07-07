import { describe, expect, it } from "vitest";
import { extractPastedUrl } from "./pasteLink";

describe("extractPastedUrl", () => {
  it("accepts a lone http/https URL", () => {
    expect(extractPastedUrl("https://example.com")).toBe("https://example.com");
    expect(extractPastedUrl("http://example.com/path?q=1#frag")).toBe(
      "http://example.com/path?q=1#frag"
    );
  });

  it("trims surrounding whitespace and newlines", () => {
    expect(extractPastedUrl("  https://example.com  ")).toBe("https://example.com");
    expect(extractPastedUrl("https://example.com\n")).toBe("https://example.com");
  });

  it("rejects prose and multi-token text", () => {
    expect(extractPastedUrl("just some words")).toBeNull();
    expect(extractPastedUrl("see https://example.com now")).toBeNull();
    expect(extractPastedUrl("https://a.com https://b.com")).toBeNull();
  });

  it("rejects bare domains without a scheme", () => {
    expect(extractPastedUrl("example.com")).toBeNull();
    expect(extractPastedUrl("www.example.com/path")).toBeNull();
  });

  it("rejects non-web and unsafe schemes", () => {
    expect(extractPastedUrl("mailto:someone@example.com")).toBeNull();
    expect(extractPastedUrl("ftp://example.com")).toBeNull();
    expect(extractPastedUrl("javascript:alert(1)")).toBeNull();
    expect(extractPastedUrl("file:///etc/hosts")).toBeNull();
  });

  it("rejects empty input", () => {
    expect(extractPastedUrl("")).toBeNull();
    expect(extractPastedUrl("   ")).toBeNull();
  });
});
