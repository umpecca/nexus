import { describe, expect, it } from "vitest";
import { fromMarkdown } from "mdast-util-from-markdown";
import { directiveFromMarkdown, directiveToMarkdown } from "mdast-util-directive";
import { toMarkdown } from "mdast-util-to-markdown";
import { directive } from "micromark-extension-directive";
import type { ContainerDirective } from "mdast-util-directive";
import type { Paragraph } from "mdast";
import {
  CALLOUT_OPTIONS,
  applyCalloutValue,
  calloutValue,
  calloutValueForNode,
  parseCalloutValue
} from "./callout";
import { githubAlertToMarkdownExtension, transformTreeAlertsToDirectives } from "./githubAlerts";

const paragraph = (value: string): Paragraph => ({ type: "paragraph", children: [{ type: "text", value }] });

const admonition = (name: string, body = "Body."): ContainerDirective => ({
  type: "containerDirective",
  name,
  children: [paragraph(body)]
});

const githubAlert = (name: string, body = "Body."): ContainerDirective => ({
  type: "containerDirective",
  name,
  data: { githubAlert: true },
  children: [paragraph(body)]
});

/** Serialize a single block the way the editor does, so a converted node round-trips to its on-disk form. */
const serializeBlock = (node: ContainerDirective): string =>
  toMarkdown(
    { type: "root", children: [node] },
    { extensions: [directiveToMarkdown(), githubAlertToMarkdownExtension] }
  ).trim();

const parseFirst = (md: string): ContainerDirective =>
  fromMarkdown(md, {
    extensions: [directive()],
    mdastExtensions: [directiveFromMarkdown(), { transforms: [transformTreeAlertsToDirectives] }]
  }).children[0] as ContainerDirective;

describe("CALLOUT_OPTIONS", () => {
  it("lists all five admonitions, a separator, then all five GitHub alerts", () => {
    expect(CALLOUT_OPTIONS).toEqual([
      { value: "admonition:note", label: "Note" },
      { value: "admonition:tip", label: "Tip" },
      { value: "admonition:danger", label: "Danger" },
      { value: "admonition:info", label: "Info" },
      { value: "admonition:caution", label: "Caution" },
      "separator",
      { value: "github:note", label: "Note (GitHub)" },
      { value: "github:tip", label: "Tip (GitHub)" },
      { value: "github:important", label: "Important (GitHub)" },
      { value: "github:warning", label: "Warning (GitHub)" },
      { value: "github:caution", label: "Caution (GitHub)" }
    ]);
  });
});

describe("calloutValue / parseCalloutValue", () => {
  it("round-trips every option value", () => {
    for (const option of CALLOUT_OPTIONS) {
      if (option === "separator") continue;
      const parsed = parseCalloutValue(option.value);
      expect(parsed).not.toBeNull();
      expect(calloutValue(parsed!.flavor, parsed!.name)).toBe(option.value);
    }
  });

  it("rejects values whose kind does not belong to the named flavor", () => {
    // danger/info are admonition-only; important/warning are GitHub-only.
    expect(parseCalloutValue("github:danger")).toBeNull();
    expect(parseCalloutValue("github:info")).toBeNull();
    expect(parseCalloutValue("admonition:important")).toBeNull();
    expect(parseCalloutValue("admonition:warning")).toBeNull();
  });

  it("rejects unknown flavors and malformed values", () => {
    expect(parseCalloutValue("other:note")).toBeNull();
    expect(parseCalloutValue("note")).toBeNull();
    expect(parseCalloutValue("")).toBeNull();
  });
});

describe("calloutValueForNode", () => {
  it("reports the GitHub flavor for a tagged directive", () => {
    expect(calloutValueForNode(githubAlert("warning"))).toBe("github:warning");
  });

  it("reports the admonition flavor for an untagged directive of a known kind", () => {
    expect(calloutValueForNode(admonition("danger"))).toBe("admonition:danger");
  });

  it("prefers the GitHub flavor for a tagged directive whose name is shared with admonitions", () => {
    expect(calloutValueForNode(githubAlert("note"))).toBe("github:note");
  });

  it("returns null for a directive that is neither a known admonition nor a tagged alert", () => {
    expect(calloutValueForNode({ type: "containerDirective", name: "important", children: [] })).toBeNull();
  });
});

describe("applyCalloutValue", () => {
  it("converts an admonition to a GitHub alert, stamping the flag and keeping the body", () => {
    const converted = applyCalloutValue(admonition("note", "Keep me."), "github:warning");
    expect(converted).toEqual({
      type: "containerDirective",
      name: "warning",
      data: { githubAlert: true },
      children: [paragraph("Keep me.")]
    });
  });

  it("converts a GitHub alert to an admonition, dropping the now-empty data object", () => {
    const converted = applyCalloutValue(githubAlert("important", "Keep me."), "admonition:info");
    expect(converted).toEqual({
      type: "containerDirective",
      name: "info",
      children: [paragraph("Keep me.")]
    });
    expect("data" in converted).toBe(false);
  });

  it("changes the kind within the GitHub flavor without touching the flag", () => {
    expect(applyCalloutValue(githubAlert("note"), "github:caution").data).toEqual({ githubAlert: true });
  });

  it("preserves unrelated data keys when stripping the GitHub flag", () => {
    const node = {
      ...githubAlert("note"),
      data: { githubAlert: true, hName: "div" }
    } as unknown as ContainerDirective;
    const converted = applyCalloutValue(node, "admonition:note");
    expect(converted.data).toEqual({ hName: "div" });
  });

  it("returns the node unchanged for an unknown value", () => {
    const node = admonition("note");
    expect(applyCalloutValue(node, "github:bogus")).toBe(node);
  });
});

describe("conversion round-trips to the correct on-disk syntax", () => {
  it("serialises an admonition→GitHub conversion as a > [!TYPE] blockquote", () => {
    const out = serializeBlock(applyCalloutValue(parseFirst(":::note\nHello.\n:::\n"), "github:warning"));
    expect(out).toBe("> [!WARNING]\n> Hello.");
    expect(out).not.toContain(":::");
  });

  it("serialises a GitHub→admonition conversion as a ::: directive", () => {
    const out = serializeBlock(applyCalloutValue(parseFirst("> [!IMPORTANT]\n> Hello.\n"), "admonition:info"));
    expect(out).toBe(":::info\nHello.\n:::");
    expect(out).not.toContain("[!");
  });
});
