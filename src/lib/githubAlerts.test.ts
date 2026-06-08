import { describe, expect, it } from "vitest";
import type { Blockquote, Paragraph, Root, RootContent } from "mdast";
import {
  GITHUB_ALERT_LABELS,
  GITHUB_ALERT_TYPES,
  blockquoteToAlertDirective,
  createGithubAlertDirectiveNode,
  githubAlertMarker,
  isGithubAlertDirective,
  isGithubAlertType,
  transformTreeAlertsToDirectives
} from "./githubAlerts";

const text = (value: string) => ({ type: "text" as const, value });
const paragraph = (...children: Paragraph["children"]): Paragraph => ({ type: "paragraph", children });
const blockquote = (...children: RootContent[]): Blockquote =>
  ({ type: "blockquote", children } as Blockquote);

/** A blockquote whose first paragraph is `[!TYPE]\n<body>` — the shape fromMarkdown produces. */
const alertBlockquote = (marker: string, body = "Body text.") =>
  blockquote(paragraph(text(`${marker}\n${body}`)));

describe("isGithubAlertType", () => {
  it("accepts every alert kind", () => {
    for (const type of GITHUB_ALERT_TYPES) {
      expect(isGithubAlertType(type)).toBe(true);
    }
  });

  it("rejects unknown names and the directive-only kinds", () => {
    expect(isGithubAlertType("danger")).toBe(false);
    expect(isGithubAlertType("info")).toBe(false);
    expect(isGithubAlertType("NOTE")).toBe(false);
    expect(isGithubAlertType("")).toBe(false);
  });

  it("has a label for every kind", () => {
    for (const type of GITHUB_ALERT_TYPES) {
      expect(GITHUB_ALERT_LABELS[type]).toBeTruthy();
    }
  });
});

describe("githubAlertMarker", () => {
  it("formats the upper-cased marker for every kind", () => {
    expect(GITHUB_ALERT_TYPES.map((type) => githubAlertMarker(type))).toEqual([
      "[!NOTE]",
      "[!TIP]",
      "[!IMPORTANT]",
      "[!WARNING]",
      "[!CAUTION]"
    ]);
  });

  it("reproduces the original marker from a parsed alert's name", () => {
    for (const type of GITHUB_ALERT_TYPES) {
      const directive = blockquoteToAlertDirective(alertBlockquote(`[!${type.toUpperCase()}]`));
      expect(githubAlertMarker(directive!.name)).toBe(`[!${type.toUpperCase()}]`);
    }
  });
});

describe("isGithubAlertDirective", () => {
  it("is true only for a tagged container directive of a known kind", () => {
    expect(
      isGithubAlertDirective({ type: "containerDirective", name: "tip", data: { githubAlert: true }, children: [] })
    ).toBe(true);
  });

  it("is false for an untagged directive (an authored ::: admonition)", () => {
    expect(isGithubAlertDirective({ type: "containerDirective", name: "tip", children: [] })).toBe(false);
  });

  it("is false for a tagged directive with an unrecognised kind", () => {
    expect(
      isGithubAlertDirective({ type: "containerDirective", name: "danger", data: { githubAlert: true }, children: [] })
    ).toBe(false);
  });

  it("is false for non-directive values", () => {
    expect(isGithubAlertDirective(null)).toBe(false);
    expect(isGithubAlertDirective(blockquote(paragraph(text("hi"))))).toBe(false);
    expect(isGithubAlertDirective("tip")).toBe(false);
  });
});

describe("createGithubAlertDirectiveNode", () => {
  it("builds a tagged container directive of the given kind, wrapping the children", () => {
    const body = paragraph(text("Read carefully."));
    const node = createGithubAlertDirectiveNode("note", [body]);
    expect(node).toEqual({
      type: "containerDirective",
      name: "note",
      data: { githubAlert: true },
      children: [body]
    });
  });

  it("produces a node the descriptor recognises as a GitHub alert, for every kind", () => {
    for (const type of GITHUB_ALERT_TYPES) {
      expect(isGithubAlertDirective(createGithubAlertDirectiveNode(type, []))).toBe(true);
    }
  });
});

describe("blockquoteToAlertDirective", () => {
  it("recognises every alert kind and lower-cases the name", () => {
    for (const type of GITHUB_ALERT_TYPES) {
      const directive = blockquoteToAlertDirective(alertBlockquote(`[!${type.toUpperCase()}]`));
      expect(directive?.name).toBe(type);
      expect(directive?.type).toBe("containerDirective");
      expect(directive?.data?.githubAlert).toBe(true);
    }
  });

  it("keeps the body text when the marker shares a paragraph with it", () => {
    const directive = blockquoteToAlertDirective(alertBlockquote("[!TIP]", "Helpful advice."));
    expect(directive?.children).toEqual([paragraph(text("Helpful advice."))]);
  });

  it("drops the marker's now-empty paragraph when it stood alone, keeping later blocks", () => {
    const list: RootContent = {
      type: "list",
      ordered: false,
      children: [{ type: "listItem", children: [paragraph(text("item"))] }]
    } as RootContent;
    const directive = blockquoteToAlertDirective(blockquote(paragraph(text("[!NOTE]")), list));
    expect(directive?.children).toEqual([list]);
  });

  it("preserves inline formatting that follows the marker line", () => {
    const directive = blockquoteToAlertDirective(
      blockquote(paragraph(text("[!IMPORTANT]\nSee "), { type: "strong", children: [text("this")] }))
    );
    expect(directive?.children).toEqual([
      paragraph(text("See "), { type: "strong", children: [text("this")] })
    ]);
  });

  it("tolerates trailing whitespace after the marker", () => {
    const directive = blockquoteToAlertDirective(alertBlockquote("[!WARNING]  ", "Careful."));
    expect(directive?.name).toBe("warning");
    expect(directive?.children).toEqual([paragraph(text("Careful."))]);
  });

  it("returns null when the kind is lower-case or mis-cased", () => {
    expect(blockquoteToAlertDirective(alertBlockquote("[!tip]"))).toBeNull();
    expect(blockquoteToAlertDirective(alertBlockquote("[!Note]"))).toBeNull();
  });

  it("returns null when other text shares the marker's line", () => {
    expect(blockquoteToAlertDirective(blockquote(paragraph(text("[!TIP] inline note"))))).toBeNull();
  });

  it("returns null for an ordinary blockquote", () => {
    expect(blockquoteToAlertDirective(blockquote(paragraph(text("Just a quote."))))).toBeNull();
  });

  it("returns null when the first block is not a paragraph", () => {
    const heading: RootContent = { type: "heading", depth: 2, children: [text("[!TIP]")] } as RootContent;
    expect(blockquoteToAlertDirective(blockquote(heading))).toBeNull();
  });
});

describe("transformTreeAlertsToDirectives", () => {
  it("converts alert blockquotes, leaves ordinary blockquotes, and descends into nested alerts", () => {
    const ordinary = blockquote(paragraph(text("Plain quote.")));
    const nestedAlert = alertBlockquote("[!CAUTION]", "Nested.");
    const tree: Root = {
      type: "root",
      children: [
        alertBlockquote("[!NOTE]", "Top level."),
        ordinary,
        {
          type: "list",
          ordered: false,
          children: [{ type: "listItem", children: [nestedAlert] }]
        } as RootContent
      ]
    };

    transformTreeAlertsToDirectives(tree);

    expect((tree.children[0] as { type: string }).type).toBe("containerDirective");
    expect((tree.children[0] as { name: string }).name).toBe("note");
    // The ordinary blockquote is untouched.
    expect(tree.children[1]).toEqual(ordinary);
    // The alert nested inside the list item was converted in place.
    const listItem = (tree.children[2] as { children: Array<{ children: RootContent[] }> }).children[0];
    expect((listItem.children[0] as { type: string }).type).toBe("containerDirective");
    expect((listItem.children[0] as { name: string }).name).toBe("caution");
  });
});
