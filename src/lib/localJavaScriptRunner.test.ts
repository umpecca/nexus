import { describe, expect, it } from "vitest";
import {
  createLocalJavaScriptWorkerSource,
  isRunnableJavaScriptBlock,
  runLocalJavaScript,
  type LocalJavaScriptRunnerConsoleMethod
} from "./localJavaScriptRunner";

type FakeWorkerMessage =
  | { type: "console"; method: LocalJavaScriptRunnerConsoleMethod; args: string[] }
  | { type: "done" }
  | { type: "error"; error: string };

class FakeWorker {
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessage: ((event: MessageEvent<FakeWorkerMessage>) => void) | null = null;
  terminated = false;

  constructor(private readonly messages: FakeWorkerMessage[]) {}

  postMessage() {
    queueMicrotask(() => {
      for (const message of this.messages) {
        if (this.terminated) {
          return;
        }

        this.onmessage?.({ data: message } as MessageEvent<FakeWorkerMessage>);
      }
    });
  }

  terminate() {
    this.terminated = true;
  }
}

function createFakeWorkerFactory(messages: FakeWorkerMessage[]) {
  return () => new FakeWorker(messages) as unknown as Worker;
}

describe("local JavaScript runner", () => {
  it("matches only JavaScript blocks with nexus-run meta", () => {
    expect(isRunnableJavaScriptBlock("js", "nexus-run")).toBe(true);
    expect(isRunnableJavaScriptBlock("javascript", "editable nexus-run")).toBe(true);
    expect(isRunnableJavaScriptBlock("js", "")).toBe(false);
    expect(isRunnableJavaScriptBlock("ts", "nexus-run")).toBe(false);
  });

  it("captures console output from the worker", async () => {
    const result = await runLocalJavaScript("console.log('hello')", {
      workerFactory: createFakeWorkerFactory([
        { type: "console", method: "log", args: ["hello"] },
        { type: "done" }
      ])
    });

    expect(result).toEqual({
      status: "success",
      console: [{ id: 0, method: "log", args: ["hello"] }]
    });
  });

  it("reports worker errors with captured console output", async () => {
    const result = await runLocalJavaScript("throw new Error('boom')", {
      workerFactory: createFakeWorkerFactory([
        { type: "console", method: "warn", args: ["before"] },
        { type: "error", error: "Error: boom" }
      ])
    });

    expect(result).toEqual({
      status: "error",
      console: [{ id: 0, method: "warn", args: ["before"] }],
      error: "Error: boom"
    });
  });

  it("times out long-running code", async () => {
    const result = await runLocalJavaScript("while (true) {}", {
      timeoutMs: 5,
      workerFactory: createFakeWorkerFactory([])
    });

    expect(result.status).toBe("timeout");
    if (result.status === "timeout") {
      expect(result.error).toBe("Execution stopped after 5ms.");
    }
  });

  it("generates a worker that blocks network and nested worker APIs", () => {
    const source = createLocalJavaScriptWorkerSource("await Promise.resolve();");

    expect(source).toContain('"fetch"');
    expect(source).toContain('"WebSocket"');
    expect(source).toContain('"EventSource"');
    expect(source).toContain('"XMLHttpRequest"');
    expect(source).toContain('"importScripts"');
    expect(source).toContain('"Worker"');
    expect(source).toContain("new AsyncFunction");
  });
});
