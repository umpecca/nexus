import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { applyDocumentProperties, emptyDocumentProperties, readDocumentProperties, validReviewDate } from "./documentProperties";

describe("YAML document properties", () => {
  const body = '# Body\n\n* Keep **formatting**, [links](../a.md), and `code`.\n\n```yaml\nstatus: untouched\n```\n';
  const metadata = (markdown: string) => parse(markdown.split(/^---\s*$/m)[1]);
  it("creates portable quoted properties and a tag sequence without changing the body", () => {
    const properties = { title: 'Title: "quoted" # literal', type: "System", tags: "finance\nops, team\nfinance", status: "true", owner: "[Alice]", review_date: "2028-02-29" };
    const result = applyDocumentProperties(body, properties);
    expect(metadata(result.markdown)).toEqual({ ...properties, tags: ["finance", "ops, team"] });
    expect(result.markdown.endsWith(body)).toBe(true);
    expect(result.change).toEqual({ from: 0, to: 0, insert: result.markdown.slice(0, -body.length) });
    expect(readDocumentProperties(result.markdown).tags).toBe("finance\nops, team");
  });
  it("preserves other YAML bytes, nested fields, comments, key order and the document body", () => {
    const unknown = '# Vendor metadata\ncustom: { nested: ["x", true, 17] } # unchanged\nmultiline: |\n  literal: # content\n';
    const source = `---\n# Title note\ntitle: Old # inline\ntags:\n  - original\nowner: Alice\n${unknown}---\n\n${body}`;
    const properties = { ...readDocumentProperties(source), title: "New", status: "Custom status" };
    const result = applyDocumentProperties(source, properties);
    expect(result.markdown).toContain(`title: "New" # inline\ntags:\n  - original\nowner: Alice\n${unknown}status: "Custom status"\n`);
    expect(result.markdown.slice(result.markdown.indexOf("\n---\n") + 5)).toBe("\n" + body);
    expect(metadata(result.markdown).custom).toEqual({ nested: ["x", true, 17] });
  });
  it("replaces a block tag list without joining the next key or removing unrelated comments", () => {
    const source = `---\ntags:\n  - original\n  - second\n# Owner note\nowner: Alice\n---\n${body}`;
    const result = applyDocumentProperties(source, { ...readDocumentProperties(source), tags: "new\nother" });
    expect(metadata(result.markdown)).toEqual({ tags: ["new", "other"], owner: "Alice" });
    expect(result.markdown).toContain('# Owner note\nowner: Alice\n');
    expect(result.markdown.endsWith(body)).toBe(true);
  });
  it("handles block scalar text, empty YAML values and quoted property names safely", () => {
    const source = `---\n"title": |-\n  Old title\nowner:\n# Keep this comment\ncustom: 7\n---\n${body}`;
    const result = applyDocumentProperties(source, { ...readDocumentProperties(source), title: "New title", owner: "Alice" });
    expect(metadata(result.markdown)).toEqual({ title: "New title", owner: "Alice", custom: 7 });
    expect(result.markdown).toContain('# Keep this comment\ncustom: 7\n');
  });
  it("preserves indentation when adding fields to an indented top-level mapping", () => {
    const source = `---\n  title: Old\n  custom:\n    nested: true\n---\n${body}`;
    const result = applyDocumentProperties(source, { ...readDocumentProperties(source), status: "Approved" });
    expect(result.markdown).toContain('  custom:\n    nested: true\n  status: "Approved"\n');
    expect(metadata(result.markdown)).toEqual({ title: "Old", custom: { nested: true }, status: "Approved" });
  });
  it("removes cleared fields while keeping unrelated metadata and comments", () => {
    const source = `---\ntitle: Old # inline\ntags: [old]\nowner: Alice\n# Keep\ncustom: true\n---\n${body}`;
    const result = applyDocumentProperties(source, { ...readDocumentProperties(source), title: "", tags: "" });
    expect(metadata(result.markdown)).toEqual({ owner: "Alice", custom: true });
    expect(result.markdown).toContain("# Keep\ncustom: true\n");
    expect(result.markdown.endsWith(body)).toBe(true);
  });
  it("removes an empty frontmatter block but keeps an existing frontmatter comment", () => {
    const source = `---\ntitle: Old\n---\n\n${body}`;
    expect(applyDocumentProperties(source, emptyDocumentProperties()).markdown).toBe("\n" + body);
    const commented = source.replace("title: Old", "# Preserve me\ntitle: Old");
    expect(applyDocumentProperties(commented, emptyDocumentProperties()).markdown).toBe(`---\n# Preserve me\n---\n\n${body}`);
  });
  it("keeps unchanged documents byte-identical, including legacy scalar tags", () => {
    const source = `---\ntitle: 'Old'\ntags: legacy, scalar\nreview_date: later\ncustom: 1\n---\n${body}`;
    const properties = readDocumentProperties(source);
    expect(applyDocumentProperties(source, properties)).toMatchObject({ markdown: source, change: null });
    const changed = applyDocumentProperties(source, { ...properties, owner: "Alice" }).markdown;
    expect(changed).toContain("tags: legacy, scalar\nreview_date: later\ncustom: 1\n");
    expect(applyDocumentProperties(body, emptyDocumentProperties()).markdown).toBe(body);
  });
  it("preserves BOM and CRLF and supports a closing delimiter at EOF", () => {
    const source = '\ufeff---\r\ntitle: Old\r\ncustom: true\r\n---\r\n\r\n# Body\r\n';
    const result = applyDocumentProperties(source, { ...readDocumentProperties(source), title: "New", tags: "a\nb" });
    expect(result.markdown).toBe('\ufeff---\r\ntitle: "New"\r\ncustom: true\r\ntags: ["a","b"]\r\n---\r\n\r\n# Body\r\n');
    expect(result.change?.from).toBe(1);
    expect(applyDocumentProperties('\ufeff# Body\r\n', { ...emptyDocumentProperties(), title: "New" }).markdown).toBe('\ufeff---\r\ntitle: "New"\r\n---\r\n\r\n# Body\r\n');
    expect(readDocumentProperties('---\ntitle: Old\n---').title).toBe("Old");
  });
  it("supports flow mappings, preserving unknown values and comments", () => {
    const source = `---\n{title: Old, owner: Alice, custom: {nested: [1, 2]}} # keep\n---\n${body}`;
    const result = applyDocumentProperties(source, { ...readDocumentProperties(source), title: "New", owner: "", tags: "a\nb" });
    expect(metadata(result.markdown)).toEqual({ title: "New", custom: { nested: [1, 2] }, tags: ["a", "b"] });
    expect(result.markdown).toContain("# keep");
    expect(result.markdown.endsWith(body)).toBe(true);
  });
  it.each([
    ["---\ntitle: [broken\n---\n", "Invalid YAML"],
    ["---\ntitle: One\ntitle: Two\n---\n", "Invalid YAML"],
    ["---\ntitle: Old\n", "closing"],
    ["---\n- item\n---\n", "mapping"],
    ["---\nowner: {name: Alice}\n---\n", "owner"],
    ["---\ntags: [good, 3]\n---\n", "tags"],
    ["---\ntitle: &shared Old\ncustom: *shared\n---\n", "anchor"],
    ["---\nowner: &shared null\ncustom: *shared\n---\n", "anchor"],
    ["---\ntags: [&shared Old]\ncustom: *shared\n---\n", "tags"],
    ["---\nowner: *shared\ncustom: &shared Alice\n---\n", "owner"]
  ])("rejects incompatible frontmatter without producing a replacement: %s", (source, message) => {
    expect(() => readDocumentProperties(source)).toThrow(message);
    expect(() => applyDocumentProperties(source, emptyDocumentProperties())).toThrow(message);
  });
  it("accepts leap dates and rejects invalid calendar dates or injected YAML", () => {
    expect(validReviewDate("2028-02-29")).toBe(true);
    for (const date of ["2026-02-29", "2026-04-31", "2026-13-01", "2026-1-01", "0000-01-01", "tomorrow", "2026-12-31\nowner: Injected"]) {
      expect(validReviewDate(date)).toBe(false);
      expect(() => applyDocumentProperties(body, { ...emptyDocumentProperties(), review_date: date })).toThrow("calendar date");
    }
    const result = applyDocumentProperties(body, { ...emptyDocumentProperties(), title: "Title\nowner: Not a field" });
    expect(metadata(result.markdown)).toEqual({ title: "Title\nowner: Not a field" });
  });
});
