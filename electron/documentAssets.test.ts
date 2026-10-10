import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeImage, embedAsset, inspectAsset, localPath, registerAssetHandlers } from "./documentAssets.cjs";
import { isValidRendererPayload } from "./rendererIpc.cjs";

describe("document image I/O", () => {
  let root: string, documentPath: string, file: string;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"></svg>';
  const data = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const handlers = new Map<string, (event: unknown, payload: unknown) => Promise<Record<string, unknown>>>();
  let dialog: { showOpenDialog: ReturnType<typeof vi.fn>; showSaveDialog: ReturnType<typeof vi.fn> };
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-assets-test-"));
    documentPath = path.join(root, "notes.md"); file = path.join(root, "a b.svg");
    await fs.writeFile(documentPath, "original"); await fs.writeFile(file, svg);
    dialog = { showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [file] })), showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: path.join(root, "new image.svg") })) };
    registerAssetHandlers({ rendererIpc: { handle: (name: string, callback: typeof handlers extends Map<string, infer T> ? T : never) => handlers.set(name, callback) }, dialog, BrowserWindow: { fromWebContents: () => null } });
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    expect(path.dirname(root)).toBe(path.resolve(os.tmpdir())); expect(path.basename(root)).toMatch(/^nexus-assets-test-/);
    await fs.rm(root, { recursive: true, force: true });
  });
  const action = (payload: object) => handlers.get("asset:action")!({ sender: {} }, { documentPath, source: data, ...payload });
  it("inspects local, embedded, missing, untitled and remote sources without remote fetching", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect(await inspectAsset(documentPath, "./a%20b.svg")).toMatchObject({ kind: "local", bytes: Buffer.byteLength(svg), preview: data });
    expect(await inspectAsset(documentPath, data)).toMatchObject({ kind: "embedded", bytes: Buffer.byteLength(svg) });
    expect(await inspectAsset(documentPath, "no.svg")).toMatchObject({ kind: "missing" });
    expect(await inspectAsset(undefined, "relative.svg")).toMatchObject({ kind: "unresolved" });
    expect(await inspectAsset(documentPath, "https://example.com/a.png")).toEqual({ kind: "remote", preview: "https://example.com/a.png" });
    expect(fetch).not.toHaveBeenCalled();
    expect(localPath(documentPath, pathToFileURL(file).href)).toBe(file);
  });
  it("extracts exact bytes to an encoded relative path and keeps the document unchanged", async () => {
    const result = await action({ action: "extract" });
    expect(result.source).toBe("./new%20image.svg");
    expect(await fs.readFile(path.join(root, "new image.svg"), "utf8")).toBe(svg);
    expect(await fs.readFile(documentPath, "utf8")).toBe("original");
    expect((await fs.readdir(root)).some(name => name.endsWith(".tmp"))).toBe(false);
    expect(await action({ action: "extract" })).toMatchObject({ error: expect.stringMatching(/already exists/) });
    expect(await fs.readFile(path.join(root, "new image.svg"), "utf8")).toBe(svg);
  });
  it("does not write when canceled, unsaved, targeting the document, or changing extension", async () => {
    dialog.showSaveDialog.mockResolvedValue({ canceled: true });
    expect(await action({ action: "extract" })).toEqual({ canceled: true });
    expect(await action({ action: "extract", documentPath: undefined })).toMatchObject({ error: expect.stringMatching(/Save the document/) });
    dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: documentPath });
    expect(await action({ action: "extract" })).toHaveProperty("error");
    dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: path.join(root, "wrong.png") });
    expect(await action({ action: "extract" })).toHaveProperty("error");
    expect(await fs.readdir(root)).toHaveLength(2);
  });
  it("preserves embedding when replacing and makes located paths portable", async () => {
    expect(await action({ action: "replace" })).toEqual({ source: data });
    expect(await action({ action: "replace", source: "old.svg" })).toEqual({ source: "./a%20b.svg" });
    expect(await action({ action: "locate", source: "missing.svg" })).toEqual({ source: "./a%20b.svg" });
    expect(await embedAsset(documentPath, "./a%20b.svg")).toBe(data);
    dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    expect(await action({ action: "replace" })).toEqual({ canceled: true });
  });
  it("decodes SVG URL data and rejects malformed or oversized images", async () => {
    expect(decodeImage(`data:image/svg+xml,${encodeURIComponent(svg)}`).bytes.toString()).toBe(svg);
    expect(() => decodeImage("data:image/png;base64,bad!")).toThrow(/base64/);
    expect(() => decodeImage("data:text/plain;base64,AAAA")).toThrow(/format/);
    expect(decodeImage(`data:image/png;base64,${"A".repeat(2_000_000)}`).bytes.length).toBe(1_500_000);
    expect(decodeImage("data:image/png;base64,YQ").bytes.toString()).toBe("a");
    const oversized = path.join(root, "large.png");
    const handle = await fs.open(oversized, "w"); await handle.truncate(40 * 1024 * 1024 + 1); await handle.close();
    expect(await inspectAsset(documentPath, "./large.png")).toMatchObject({ kind: "unavailable", error: expect.stringMatching(/40 MB/) });
  });
  it("downloads only on explicit embed, with type and size validation", async () => {
    const fetch = vi.fn(async () => new Response(svg, { headers: { "content-type": "image/svg+xml; charset=utf-8" } }));
    vi.stubGlobal("fetch", fetch);
    expect(await embedAsset(documentPath, "https://example.com/a.svg")).toBe(data);
    expect(fetch.mock.calls[0][1]).toMatchObject({ signal: expect.any(AbortSignal) });
    fetch.mockResolvedValue(new Response("error", { headers: { "content-type": "text/html" } }));
    await expect(embedAsset(documentPath, "https://example.com/a.svg")).rejects.toThrow(/supported image/);
  });
  it("validates asset IPC source, action, and document-path types", () => {
    expect(isValidRendererPayload("asset:action", [{ source: data, documentPath, action: "extract" }])).toBe(true);
    for (const payload of [{ source: data, action: "delete" }, { source: 5, action: "embed" }, { source: data, action: "embed", documentPath: {} }]) {
      expect(isValidRendererPayload("asset:action", [payload])).toBe(false);
    }
  });
});
