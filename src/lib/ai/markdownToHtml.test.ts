// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import sharedDOMPurify from "dompurify";
import { renderChatMarkdown } from "./markdownToHtml";

function rendered(markdown: string) {
  const container = document.createElement("div");
  container.innerHTML = renderChatMarkdown(markdown);
  return container;
}

describe("assistant chat Markdown sanitization", () => {
  it("keeps the chat policy isolated from other libraries' global sanitizer hooks and config", () => {
    sharedDOMPurify.setConfig({ ALLOWED_TAGS: ["a"], ALLOWED_ATTR: ["href", "onclick"] });
    sharedDOMPurify.addHook("afterSanitizeAttributes", (node) => {
      if (node.tagName === "A") node.setAttribute("data-shared-hook", "present");
    });
    try {
      const link = rendered('<a href="javascript:alert(1)" onclick="alert(1)">link</a>').querySelector("a");
      expect(link?.getAttributeNames()).toEqual([]);
    } finally {
      sharedDOMPurify.clearConfig();
      sharedDOMPurify.removeAllHooks();
    }
  });
  it("preserves prose, code, lists, tables, and safe links", () => {
    const root = rendered('# Heading\n\n**bold** and *italic*\n\n- item\n\n```js\n<script>alert(1)</script>\n```\n\n| A | B |\n| - | - |\n| one | two |\n\n[web](https://example.com) [mail](mailto:me@example.com) [anchor](#heading)');
    expect(root.querySelector("h1")?.textContent).toBe("Heading");
    expect(root.querySelector("strong")?.textContent).toBe("bold");
    expect(root.querySelector("em")?.textContent).toBe("italic");
    expect(root.querySelector("li")?.textContent).toBe("item");
    expect(root.querySelector("pre code")?.textContent).toContain("<script>alert(1)</script>");
    expect(root.querySelectorAll("td")).toHaveLength(2);
    expect(Array.from(root.querySelectorAll("a"), (link) => link.getAttribute("href"))).toEqual([
      "https://example.com", "mailto:me@example.com", "#heading"
    ]);
  });

  it.each([
    'href="j&#x61;vascript:alert(1)"',
    "href=javascript:alert(1)",
    'href="JaVaScRiPt:alert(1)"',
    'href="java&#9;script:alert(1)"',
    'href="&#106;&#97;vascript:alert(1)"',
    'href="data:text/html,<script>alert(1)</script>"',
    'href="file:///C:/secret.txt"',
    'href="blob:https://example.com/id"',
    'href="vbscript:msgbox(1)"',
    'href="//example.com"',
    'href="relative.html"'
  ])("removes unsafe parsed link attributes: %s", (attribute) => {
    const link = rendered(`<a ${attribute}>link</a>`).querySelector("a");
    expect(link?.textContent).toBe("link");
    expect(link?.hasAttribute("href")).toBe(false);
  });

  it("removes executable/embedded elements and arbitrary attributes", () => {
    const root = rendered('<script>alert(1)</script><style>body{display:none}</style><iframe srcdoc="<script>alert(1)</script>"></iframe><object data="file:///secret"></object><svg onload="alert(1)"></svg><math><mi xlink:href="javascript:alert(1)">x</mi></math><form><input name="nexus"></form><img src="https://example.com/tracker" onerror="alert(1)"><a href="https://example.com" onclick="alert(1)" style="position:fixed" id="nexus" name="nexus" data-action="approve" target="_blank">safe</a>');
    expect(root.querySelector("script,style,iframe,object,svg,math,form,input,img")).toBeNull();
    const link = root.querySelector("a");
    expect(link?.getAttributeNames()).toEqual(["href"]);
  });

  it("sanitizes every prefix of a streamed malicious fragment", () => {
    const payload = '<a href="j&#x61;vascript:alert(1)" onmouseover="alert(1)">click</a><svg><g onload="alert(1)"></g></svg>';
    for (let length = 0; length <= payload.length; length += 1) {
      const root = rendered(payload.slice(0, length));
      expect(root.querySelector("script,svg,[onmouseover],[onload]")).toBeNull();
      for (const link of root.querySelectorAll("a[href]")) {
        expect(link.getAttribute("href")).toMatch(/^(?:https?:\/\/|mailto:|#)/i);
      }
    }
  });

  it("keeps nested/malformed parser attacks inert after insertion", () => {
    const root = rendered('<math><mtext><table><mglyph><style><!--</style><img title="--><img src=1 onerror=alert(1)>">');
    expect(root.querySelector("math,style,img,[onerror]")).toBeNull();
  });
});
