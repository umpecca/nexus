/**
 * End-to-end round-trip tests that drive the *real* parser and serializer with
 * the same composition MDXEditor assembles: the directive micromark/mdast
 * extensions plus our import transform and to-markdown extension. This is what
 * guards the subtle bits unit tests can't — that `[!TIP]` is emitted unescaped
 * (mdast-util-to-markdown would otherwise write `\[!TIP]`), that the body stays
 * tight under `> `, and that authored `:::` admonitions are untouched.
 */
import { describe, expect, it } from "vitest";
import { fromMarkdown } from "mdast-util-from-markdown";
import { directiveFromMarkdown, directiveToMarkdown } from "mdast-util-directive";
import { toMarkdown } from "mdast-util-to-markdown";
import { directive } from "micromark-extension-directive";
import type { Root } from "mdast";
import {
  GITHUB_ALERT_TYPES,
  githubAlertToMarkdownExtension,
  isGithubAlertDirective,
  transformTreeAlertsToDirectives
} from "./githubAlerts";

const parse = (md: string): Root =>
  fromMarkdown(md, {
    extensions: [directive()],
    mdastExtensions: [directiveFromMarkdown(), { transforms: [transformTreeAlertsToDirectives] }]
  });

const serialize = (tree: Root): string =>
  toMarkdown(tree, { extensions: [directiveToMarkdown(), githubAlertToMarkdownExtension] });

const roundTrip = (md: string): string => serialize(parse(md));

describe("GitHub alert round-trip through the real parser/serializer", () => {
  it("imports an alert as a tagged container directive", () => {
    const tree = parse("> [!IMPORTANT]\n> Ship it.\n");
    expect(isGithubAlertDirective(tree.children[0])).toBe(true);
  });

  it("serialises a paragraph-bodied alert back to a tight, unescaped blockquote", () => {
    const out = roundTrip("> [!TIP]\n> Helpful advice.\n");
    expect(out).toBe("> [!TIP]\n> Helpful advice.\n");
    expect(out).not.toContain("\\["); // the bug we are guarding against
  });

  it("round-trips every alert kind unchanged, including the non-native Important/Warning", () => {
    for (const type of GITHUB_ALERT_TYPES) {
      const marker = `[!${type.toUpperCase()}]`;
      expect(roundTrip(`> ${marker}\n> Body.\n`)).toBe(`> ${marker}\n> Body.\n`);
    }
  });

  it("keeps an authored ::: admonition serialising as :::", () => {
    const md = ":::note\nPlain admonition.\n:::\n";
    expect(roundTrip(md)).toBe(md);
  });

  it("preserves both syntaxes side by side in one document", () => {
    const out = roundTrip("> [!WARNING]\n> Be careful.\n\n:::tip\nDo this.\n:::\n");
    expect(out).toContain("> [!WARNING]\n> Be careful.");
    expect(out).toContain(":::tip");
    expect(out).not.toContain("\\[");
  });

  it("keeps a list-bodied alert tight and still recognised after a round-trip", () => {
    const out = roundTrip("> [!NOTE]\n> - a\n> - b\n");
    expect(out.startsWith("> [!NOTE]\n")).toBe(true);
    expect(out).not.toContain("\\[");
    expect(isGithubAlertDirective(parse(out).children[0])).toBe(true);
  });

  it("is idempotent across a second round-trip", () => {
    const once = roundTrip("> [!CAUTION]\n> Risky.\n");
    expect(roundTrip(once)).toBe(once);
  });
});
