export type LocalJavaScriptRunnerConsoleMethod = "log" | "info" | "warn" | "error";

export type LocalJavaScriptRunnerConsoleEntry = {
  id: number;
  method: LocalJavaScriptRunnerConsoleMethod;
  args: string[];
};

export type LocalJavaScriptRunnerResult =
  | {
      status: "success";
      console: LocalJavaScriptRunnerConsoleEntry[];
    }
  | {
      status: "error";
      console: LocalJavaScriptRunnerConsoleEntry[];
      error: string;
    }
  | {
      status: "timeout";
      console: LocalJavaScriptRunnerConsoleEntry[];
      error: string;
    };

export type LocalJavaScriptRunnerOptions = {
  timeoutMs?: number;
  workerFactory?: WorkerFactory;
};

type WorkerFactory = (source: string) => Worker;

type WorkerMessage =
  | {
      type: "console";
      method: LocalJavaScriptRunnerConsoleMethod;
      args: string[];
    }
  | {
      type: "done";
    }
  | {
      type: "error";
      error: string;
    };

const DEFAULT_TIMEOUT_MS = 2000;
const RUNNABLE_META_TOKEN = "nexus-run";
const RUNNABLE_LANGUAGES = new Set(["js", "javascript"]);

export function isRunnableJavaScriptBlock(language: string | null | undefined, meta: string | null | undefined) {
  const normalizedLanguage = (language ?? "").trim().toLowerCase();
  const metaTokens = (meta ?? "").split(/\s+/).filter(Boolean);

  return RUNNABLE_LANGUAGES.has(normalizedLanguage) && metaTokens.includes(RUNNABLE_META_TOKEN);
}

export function createLocalJavaScriptWorkerSource(code: string) {
  return `
"use strict";

const blockedApi = () => {
  throw new Error("Network and nested worker APIs are disabled in Nexus local runner.");
};

for (const name of ["fetch", "WebSocket", "EventSource", "XMLHttpRequest", "importScripts", "Worker"]) {
  try {
    self[name] = blockedApi;
  } catch (_error) {
    // Some globals are read-only in specific runtimes; try a descriptor replacement next.
  }

  try {
    Object.defineProperty(self, name, { configurable: true, value: blockedApi, writable: true });
  } catch (_error) {
    // If a runtime refuses replacement, keep initialization alive and let CSP/sandboxing be the backstop.
  }
}

function formatConsoleValue(value) {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Error) {
    return value.stack || value.message;
  }

  try {
    return JSON.stringify(value);
  } catch (_error) {
    return String(value);
  }
}

const runnerConsole = Object.fromEntries(["log", "info", "warn", "error"].map((method) => [
  method,
  (...args) => self.postMessage({ type: "console", method, args: args.map(formatConsoleValue) })
]));

self.onmessage = async () => {
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const run = new AsyncFunction("console", ${JSON.stringify(`"use strict";\n${code}`)});
    await run(runnerConsole);
    self.postMessage({ type: "done" });
  } catch (error) {
    self.postMessage({
      type: "error",
      error: error instanceof Error ? error.stack || error.message : String(error)
    });
  }
};
`;
}

export function createLocalJavaScriptWorker(source: string) {
  const blob = new Blob([source], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);
  URL.revokeObjectURL(url);
  return worker;
}

export function runLocalJavaScript(
  code: string,
  { timeoutMs = DEFAULT_TIMEOUT_MS, workerFactory = createLocalJavaScriptWorker }: LocalJavaScriptRunnerOptions = {}
): Promise<LocalJavaScriptRunnerResult> {
  const consoleEntries: LocalJavaScriptRunnerConsoleEntry[] = [];
  const worker = workerFactory(createLocalJavaScriptWorkerSource(code));

  return new Promise((resolve) => {
    let settled = false;

    function finish(result: LocalJavaScriptRunnerResult) {
      if (settled) {
        return;
      }

      settled = true;
      globalThis.clearTimeout(timeout);
      worker.terminate();
      resolve(result);
    }

    const timeout = globalThis.setTimeout(() => {
      finish({
        status: "timeout",
        console: consoleEntries,
        error: `Execution stopped after ${timeoutMs}ms.`
      });
    }, timeoutMs);

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;

      if (message.type === "console") {
        consoleEntries.push({
          id: consoleEntries.length,
          method: message.method,
          args: message.args
        });
        return;
      }

      if (message.type === "done") {
        finish({ status: "success", console: consoleEntries });
        return;
      }

      finish({ status: "error", console: consoleEntries, error: message.error });
    };

    worker.onerror = (event) => {
      finish({
        status: "error",
        console: consoleEntries,
        error: event.message
      });
    };

    worker.postMessage({ type: "run" });
  });
}
