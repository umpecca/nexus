export type MermaidRenderSuccess = {
  status: "success";
  svg: string;
};

export type MermaidRenderError = {
  status: "error";
  error: string;
};

export type MermaidRenderResult = MermaidRenderSuccess | MermaidRenderError;

export type MermaidRenderFunction = (
  id: string,
  definition: string
) => Promise<{ svg: string }> | { svg: string };

let initialized = false;
let nextDiagramId = 0;
let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;

export function isMermaidCodeBlock(language: string | null | undefined) {
  return (language ?? "").trim().toLowerCase() === "mermaid";
}

export function createMermaidDiagramId() {
  nextDiagramId += 1;
  return `nexus-mermaid-${Date.now()}-${nextDiagramId}`;
}

function loadMermaid() {
  mermaidPromise ??= import("mermaid").then((module) => module.default);
  return mermaidPromise;
}

async function initializeMermaid() {
  const mermaid = await loadMermaid();

  if (initialized) {
    return mermaid;
  }

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "default"
  });
  initialized = true;
  return mermaid;
}

export async function defaultMermaidRender(id: string, definition: string) {
  const mermaid = await initializeMermaid();
  return mermaid.render(id, definition);
}

export async function renderMermaidDiagram(
  definition: string,
  id = createMermaidDiagramId(),
  render: MermaidRenderFunction = defaultMermaidRender
): Promise<MermaidRenderResult> {
  try {
    const result = await render(id, definition);
    return { status: "success", svg: result.svg };
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
