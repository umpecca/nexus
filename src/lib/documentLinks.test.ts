import { describe, expect, it } from "vitest";
import { findLinkedHeading } from "./documentLinks";

describe("linked headings", () => {
  it("ignores YAML comments while preserving source line offsets", () => {
    expect(findLinkedHeading("---\n# Setup\ntitle: Guide\n---\n\n# Guide\n\n## Setup", "setup"))
      .toEqual({ level: 2, text: "Setup", index: 1, line: 7 });
  });
  it("uses the same duplicate and Unicode slugs as Nexus's table of contents", () => {
    const markdown = "# Guide\n\n## Setup\n\n```md\n## Hidden\n```\n\n## Setup\n\n## Révision &amp; dates";
    expect(findLinkedHeading(markdown, "setup-1")).toMatchObject({ index: 2, line: 8 });
    expect(findLinkedHeading(markdown, "révision-dates")).toMatchObject({ index: 3 });
    expect(findLinkedHeading(markdown, "hidden")).toBeUndefined();
    expect(findLinkedHeading(markdown, "missing")).toBeUndefined();
  });
});
