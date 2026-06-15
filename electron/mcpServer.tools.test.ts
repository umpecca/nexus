import { afterAll, beforeAll, describe, expect, it } from "vitest";
// This test lives under electron/ (outside the tsconfig "src" include) so it can import the CommonJS
// server and tool modules directly. It boots the real Streamable-HTTP MCP server on a loopback port
// and drives the four read tools end to end through JSON-RPC, backing the host with the same pure
// logic the production host uses.
import { configure, getListeningInfo, setHost, stop } from "./mcp-server.cjs";
import {
  buildDocumentOutline,
  findInDocument,
  getDocumentSection,
  searchDocument
} from "./mcpDocumentTools.cjs";

const DOC = [
  "# Title",
  "",
  "Intro about alpha.",
  "",
  "## Alpha",
  "",
  "Alpha body mentions alpha twice: alpha.",
  "",
  "## Beta",
  "",
  "Beta body.",
  ""
].join("\n");

const SELECTION = { ok: true, mode: "rich-text", hasSelection: true, text: "selected words" };

setHost({
  listWindows: () => [
    { windowId: "w1", title: "Title", filePath: null, dirty: false, focused: true }
  ],
  getDocument: () => ({ windowId: "w1", title: "Title", filePath: null, dirty: false, markdown: DOC }),
  getOutline: () => ({
    windowId: "w1",
    title: "Title",
    filePath: null,
    headings: buildDocumentOutline(DOC)
  }),
  getSection: (_windowId: string | undefined, selector: Record<string, unknown>) => ({
    windowId: "w1",
    filePath: null,
    ...getDocumentSection(DOC, selector)
  }),
  searchDocument: (_windowId: string | undefined, options: Record<string, unknown>) => ({
    windowId: "w1",
    filePath: null,
    ...searchDocument(DOC, options)
  }),
  find: (_windowId: string | undefined, options: Record<string, unknown>) => ({
    windowId: "w1",
    filePath: null,
    ...findInDocument(DOC, options)
  }),
  getSelection: async () => SELECTION,
  rejectAllPendingWrites: () => {},
  requestReplaceDocument: async () => ({ applied: false, reason: "not-implemented" })
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

async function rpc(method: string, params?: unknown): Promise<any> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  return response.json();
}

async function callTool(name: string, args?: Record<string, unknown>): Promise<any> {
  return rpc("tools/call", { name, arguments: args ?? {} });
}

/** Parse the JSON payload a successful read tool returns as its single text content block. */
function readToolJson(envelope: any): any {
  expect(envelope.result.isError).not.toBe(true);
  return JSON.parse(envelope.result.content[0].text);
}

describe("MCP server read tools", () => {
  it("advertises the four new read tools in tools/list", async () => {
    const envelope = await rpc("tools/list");
    const names = envelope.result.tools.map((tool: { name: string }) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "nexus_get_outline",
        "nexus_get_section",
        "nexus_search_document",
        "nexus_find",
        "nexus_get_selection"
      ])
    );
  });

  it("returns the document outline", async () => {
    const result = readToolJson(await callTool("nexus_get_outline"));
    expect(result.headings.map((heading: { slug: string }) => heading.slug)).toEqual([
      "title",
      "alpha",
      "beta"
    ]);
  });

  it("returns a section by slug", async () => {
    const result = readToolJson(await callTool("nexus_get_section", { slug: "beta" }));
    expect(result.found).toBe(true);
    expect(result.markdown).toBe("## Beta\n\nBeta body.");
  });

  it("searches the document", async () => {
    const result = readToolJson(await callTool("nexus_search_document", { query: "alpha" }));
    expect(result.total).toBe(5);
    expect(result.matches[0].line).toBe(3);
  });

  it("finds matches with context and the enclosing heading", async () => {
    const result = readToolJson(await callTool("nexus_find", { query: "alpha", contextLines: 0 }));
    expect(result.matchingLines).toBe(3);
    // The body line under "## Alpha" reports its two occurrences and that it sits in the Alpha section.
    const bodyMatch = result.matches.find((entry: { line: number }) => entry.line === 7);
    expect(bodyMatch.matchCount).toBe(3);
    expect(bodyMatch.heading).toMatchObject({ text: "Alpha", slug: "alpha" });
    expect(bodyMatch.context).toBe("Alpha body mentions alpha twice: alpha.");
  });

  it("reports an error when find has an empty query", async () => {
    const envelope = await callTool("nexus_find", { query: "" });
    expect(envelope.result.isError).toBe(true);
    expect(envelope.result.content[0].text).toMatch(/non-empty/);
  });

  it("returns the editor selection", async () => {
    const result = readToolJson(await callTool("nexus_get_selection"));
    expect(result).toMatchObject({ hasSelection: true, text: "selected words", mode: "rich-text" });
  });

  it("reports an error when get_section has no selector", async () => {
    const envelope = await callTool("nexus_get_section", {});
    expect(envelope.result.isError).toBe(true);
    expect(envelope.result.content[0].text).toMatch(/index.*slug.*heading/);
  });

  it("reports an error when search has an empty query", async () => {
    const envelope = await callTool("nexus_search_document", { query: "" });
    expect(envelope.result.isError).toBe(true);
    expect(envelope.result.content[0].text).toMatch(/non-empty/);
  });
});
