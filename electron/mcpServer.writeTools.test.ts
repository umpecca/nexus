import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
// Boots the real Streamable-HTTP MCP server and drives the in-buffer write tools end to end. The fake
// host mirrors main.cjs's requestComputedWrite: it computes the proposed buffer with the real pure
// edit logic, captures it, and either "approves" (applies) or "rejects" based on a switch the tests
// flip — standing in for the renderer's confirmation dialog.
import { configure, getListeningInfo, setHost, stop } from "./mcp-server.cjs";
import { applyEdits, replaceSection, setFrontmatter } from "./mcpDocumentEdits.cjs";

const INITIAL_DOC = [
  "---",
  "title: Old",
  "---",
  "",
  "# Title",
  "",
  "Intro paragraph.",
  "",
  "## Section",
  "",
  "Body text here."
].join("\n");

let currentDoc = INITIAL_DOC;
let decision: "approve" | "reject" = "approve";
let lastProposed: string | null = null;

type EditResult = { ok: boolean; markdown?: string };

function routeWrite(compute: (current: string) => EditResult) {
  const result = compute(currentDoc);
  if (!result.ok) {
    return Promise.resolve({ applied: false, reason: "edit-failed", error: result });
  }
  lastProposed = result.markdown ?? "";
  if (decision === "reject") {
    return Promise.resolve({ applied: false, reason: "user-rejected" });
  }
  currentDoc = result.markdown ?? "";
  return Promise.resolve({ applied: true });
}

setHost({
  getDocument: () => ({ windowId: "w1", title: "Title", filePath: null, dirty: false, markdown: currentDoc }),
  rejectAllPendingWrites: () => {},
  requestReplaceDocument: ({ markdown }: { markdown: string }) =>
    routeWrite(() => ({ ok: true, markdown })),
  requestApplyEdits: ({ edits }: { edits: unknown[] }) =>
    routeWrite((current) => applyEdits(current, edits as never)),
  requestReplaceSection: ({ selector, markdown }: { selector: unknown; markdown: unknown }) =>
    routeWrite((current) => replaceSection(current, selector as never, markdown)),
  requestSetFrontmatter: ({ set, remove }: { set?: unknown; remove?: unknown }) =>
    routeWrite((current) => setFrontmatter(current, { set, remove } as never))
});

let endpoint = "";

beforeAll(async () => {
  const result = await configure({ enabled: true, port: 0, authMode: "none", bearerToken: "" });
  expect(result.ok).toBe(true);
  endpoint = `http://127.0.0.1:${getListeningInfo().port}/mcp`;
});

afterAll(async () => {
  await stop();
});

beforeEach(() => {
  currentDoc = INITIAL_DOC;
  decision = "approve";
  lastProposed = null;
});

async function callTool(name: string, args: Record<string, unknown>): Promise<any> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } })
  });
  return response.json();
}

describe("MCP server write tools", () => {
  it("advertises the in-buffer write tools in tools/list", async () => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
    });
    const envelope = await response.json();
    const names = envelope.result.tools.map((tool: { name: string }) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining(["nexus_apply_edits", "nexus_replace_section", "nexus_set_frontmatter"])
    );
  });

  it("applies a literal edit and reports success", async () => {
    const envelope = await callTool("nexus_apply_edits", {
      edits: [{ find: "Body text here.", replace: "New body." }]
    });
    expect(envelope.result.isError).not.toBe(true);
    expect(JSON.parse(envelope.result.content[0].text)).toEqual({ applied: true });
    expect(lastProposed).toContain("New body.");
    expect(currentDoc).toContain("New body.");
  });

  it("returns an error without proposing a write when the anchor is missing", async () => {
    const envelope = await callTool("nexus_apply_edits", {
      edits: [{ find: "not in the document", replace: "x" }]
    });
    expect(envelope.result.isError).toBe(true);
    expect(envelope.result.content[0].text).toMatch(/not present in the document/);
    expect(lastProposed).toBeNull();
    expect(currentDoc).toBe(INITIAL_DOC);
  });

  it("rejects an ambiguous edit and suggests all:true", async () => {
    // "---" appears twice (the frontmatter fences), so a single edit is ambiguous.
    const envelope = await callTool("nexus_apply_edits", {
      edits: [{ find: "---", replace: "***" }]
    });
    expect(envelope.result.isError).toBe(true);
    expect(envelope.result.content[0].text).toMatch(/all/);
  });

  it("replaces a section by slug", async () => {
    const envelope = await callTool("nexus_replace_section", {
      slug: "section",
      markdown: "## Section\n\nReplaced body."
    });
    expect(JSON.parse(envelope.result.content[0].text)).toEqual({ applied: true });
    expect(lastProposed).toContain("Replaced body.");
    expect(lastProposed).not.toContain("Body text here.");
  });

  it("errors when replace_section has no selector", async () => {
    const envelope = await callTool("nexus_replace_section", { markdown: "x" });
    expect(envelope.result.isError).toBe(true);
    expect(envelope.result.content[0].text).toMatch(/index.*slug.*heading/);
  });

  it("errors when a section is not found", async () => {
    const envelope = await callTool("nexus_replace_section", { slug: "missing", markdown: "x" });
    expect(envelope.result.isError).toBe(true);
    expect(envelope.result.content[0].text).toMatch(/No section matched/);
  });

  it("merges a frontmatter field", async () => {
    const envelope = await callTool("nexus_set_frontmatter", { set: { title: "New", author: "Vince" } });
    expect(JSON.parse(envelope.result.content[0].text)).toEqual({ applied: true });
    expect(lastProposed).toContain("title: New");
    expect(lastProposed).toContain("author: Vince");
  });

  it("errors when set_frontmatter has neither set nor remove", async () => {
    const envelope = await callTool("nexus_set_frontmatter", {});
    expect(envelope.result.isError).toBe(true);
  });

  it("reports a user rejection as a normal (non-error) result", async () => {
    decision = "reject";
    const envelope = await callTool("nexus_apply_edits", {
      edits: [{ find: "Body text here.", replace: "New body." }]
    });
    expect(envelope.result.isError).not.toBe(true);
    expect(JSON.parse(envelope.result.content[0].text)).toEqual({
      applied: false,
      reason: "user-rejected"
    });
    expect(currentDoc).toBe(INITIAL_DOC);
  });
});
