export type KatexRenderSuccess = {
  status: "success";
  html: string;
};

export type KatexRenderError = {
  status: "error";
  error: string;
};

export type KatexRenderResult = KatexRenderSuccess | KatexRenderError;

export type KatexRenderOptions = {
  displayMode?: boolean;
};

type KatexModule = typeof import("katex");

let katexPromise: Promise<KatexModule["default"]> | null = null;

export function isMathCodeBlock(language: string | null | undefined) {
  return (language ?? "").trim().toLowerCase() === "math";
}

function loadKatex() {
  katexPromise ??= import("katex").then((module) => module.default);
  return katexPromise;
}

export async function renderMath(
  source: string,
  options: KatexRenderOptions = {}
): Promise<KatexRenderResult> {
  try {
    const katex = await loadKatex();
    const html = katex.renderToString(source, {
      displayMode: options.displayMode ?? true,
      throwOnError: true,
      output: "htmlAndMathml",
      strict: "ignore"
    });
    return { status: "success", html };
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
