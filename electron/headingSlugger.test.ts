import { describe, expect, it } from "vitest";
import { Marked, Renderer } from "marked";
// The slugger logic shared with the Electron export renderer.
import {
  createHeadingSlugger,
  decodeCharacterReferences,
  slugifyHeadingText
} from "./headingSlugger.cjs";
// The renderer-process twin. This test lives under electron/ (outside the tsconfig "src" include) so
// it can import both the CJS module and the TypeScript source without tripping the build type-check.
import {
  createHeadingSlugger as createHeadingSluggerTs,
  slugifyHeadingText as slugifyHeadingTextTs
} from "../src/lib/toc";

describe("slugifyHeadingText (CJS)", () => {
  it("lowercases, hyphenates, and drops punctuation", () => {
    expect(slugifyHeadingText("Hello, World!")).toBe("hello-world");
  });

  it("decodes entities before slugging", () => {
    expect(slugifyHeadingText("Tom &amp; Jerry")).toBe("tom-jerry");
    expect(slugifyHeadingText("A&#x20;B")).toBe("a-b");
  });

  it("keeps Unicode letters, underscores, and hyphens", () => {
    expect(slugifyHeadingText("Café snake_case-name")).toBe("café-snake_case-name");
  });
});

describe("createHeadingSlugger (CJS)", () => {
  it("disambiguates repeats and falls back to 'section'", () => {
    const slug = createHeadingSlugger();
    expect(slug("Notes")).toBe("notes");
    expect(slug("Notes")).toBe("notes-1");
    expect(slug("***")).toBe("section");
  });
});

describe("decodeCharacterReferences (CJS)", () => {
  it("leaves text without entities untouched", () => {
    expect(decodeCharacterReferences("plain")).toBe("plain");
  });
});

// Guards that the CommonJS export-renderer slugger and the TypeScript TOC-builder slugger never
// drift: the TOC's `#slug` links must match the exported headings' `id` attributes.
describe("TS/CJS slugger parity", () => {
  const fixtures = [
    "Simple Heading",
    "Heading, with! punctuation?",
    "Tom &amp; Jerry",
    "A&#x20;spaced ref",
    "Café résumé",
    "`code` and *emphasis*",
    "snake_case-name",
    "***",
    "Repeated",
    "Repeated",
    "Repeated"
  ];

  it("slugifies individual headings identically", () => {
    for (const text of fixtures) {
      expect(slugifyHeadingText(text)).toBe(slugifyHeadingTextTs(text));
    }
  });

  it("produces identical dedupe sequences in document order", () => {
    const cjs = createHeadingSlugger();
    const ts = createHeadingSluggerTs();
    expect(fixtures.map((text) => cjs(text))).toEqual(fixtures.map((text) => ts(text)));
  });
});

// Mirrors the renderer.heading override in main.cjs to prove the slugger gives every exported
// heading a unique id slug that an in-document TOC link can resolve to.
describe("export heading id assignment", () => {
  it("assigns deduped id slugs to every heading", async () => {
    const renderer = new Renderer();
    const slug = createHeadingSlugger();
    renderer.heading = (token) => {
      const id = slug(token.text);
      return `<h${token.depth} id="${id}">${token.text}</h${token.depth}>\n`;
    };
    const marked = new Marked({ gfm: true, renderer });

    const html = await marked.parse(["# A", "", "## B B", "", "## B B"].join("\n"));

    expect(html).toContain('id="a"');
    expect(html).toContain('id="b-b"');
    expect(html).toContain('id="b-b-1"');
  });
});
