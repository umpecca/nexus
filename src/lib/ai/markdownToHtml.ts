import createDOMPurify from "dompurify";
import { Marked } from "marked";

// Keep chat options private; configuring Marked's global singleton also changes unrelated callers.
const chatMarkdown = new Marked({ gfm: true, breaks: true });
// Mermaid adds global DOMPurify hooks. A private instance keeps chat's policy independent.
const chatSanitizer = createDOMPurify(typeof window === "undefined" ? undefined : window);

/** Treat assistant text (including saved transcripts and streaming fragments) as untrusted HTML. */
export function renderChatMarkdown(markdown: string): string {
  if (!chatSanitizer.isSupported) {
    // Unsupported environments must not fall back to returning unsanitized HTML.
    return "";
  }
  const html = chatMarkdown.parse(markdown ?? "", { async: false }) as string;
  return chatSanitizer.sanitize(html, {
    ALLOWED_TAGS: [
      "p", "br", "hr", "h1", "h2", "h3", "h4", "h5", "h6",
      "strong", "b", "em", "i", "s", "del", "blockquote", "pre", "code",
      "ul", "ol", "li", "a", "table", "thead", "tbody", "tr", "th", "td"
    ],
    ALLOWED_ATTR: ["href", "title", "start", "colspan", "rowspan"],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    // DOMPurify checks parsed attributes after entity decoding. Chat only needs web/mail links
    // and document anchors; file:, data:, blob:, relative paths, and script schemes fail closed.
    ALLOWED_URI_REGEXP: /^(?:https?:\/\/|mailto:|#)/i
  });
}
