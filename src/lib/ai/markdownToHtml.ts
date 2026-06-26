// Render an assistant chat message (Markdown) to HTML for display in the chat panel. `marked` is
// already a project dependency. marked no longer ships a sanitizer, and the content comes from a
// network LLM rendered inside an Electron renderer, so we post-process the HTML to drop scripting
// vectors before it is injected with dangerouslySetInnerHTML. This is a defensive allowlist-ish
// pass, not a full HTML sanitizer — the chat only needs prose, code, lists, links, and tables.

import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true });

function stripDangerousHtml(html: string): string {
  return (
    html
      // Drop entire scripting/embedding elements and their content.
      .replace(/<\s*(script|style|iframe|object|embed)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
      // Drop self-closing / unmatched dangerous or metadata tags.
      .replace(/<\s*(script|style|iframe|object|embed|link|meta|base)\b[^>]*>/gi, "")
      // Strip inline event handlers (onclick=, onerror=, …) in any quoting style.
      .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
      .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
      .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
      // Neutralize javascript: URLs in href/src.
      .replace(/(href|src)\s*=\s*"\s*javascript:[^"]*"/gi, '$1="#"')
      .replace(/(href|src)\s*=\s*'\s*javascript:[^']*'/gi, "$1='#'")
  );
}

/** Render Markdown to sanitized HTML suitable for dangerouslySetInnerHTML in the chat transcript. */
export function renderChatMarkdown(markdown: string): string {
  const html = marked.parse(markdown ?? "", { async: false }) as string;
  return stripDangerousHtml(html);
}
