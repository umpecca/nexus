import { describe, expect, it } from "vitest";
import {
  buildImageMarkdown,
  buildImagesMarkdown,
  isImageOnlyPayload,
  readImageFileAsDataUrl
} from "./imagePaste";

describe("isImageOnlyPayload", () => {
  it("treats a payload of only image items as an image paste", () => {
    expect(isImageOnlyPayload(["image/png"])).toBe(true);
    expect(isImageOnlyPayload(["image/png", "image/jpeg"])).toBe(true);
  });

  it("ignores an empty payload", () => {
    expect(isImageOnlyPayload([])).toBe(false);
  });

  it("does not hijack a mixed payload (e.g. image copied from a web page with text/html)", () => {
    expect(isImageOnlyPayload(["image/png", "text/html"])).toBe(false);
    expect(isImageOnlyPayload(["text/plain"])).toBe(false);
  });
});

describe("buildImageMarkdown", () => {
  const dataUrl = "data:image/png;base64,iVBORw0KGgo=";

  it("embeds the data URL with empty alt text by default", () => {
    expect(buildImageMarkdown(dataUrl)).toBe(`![](${dataUrl})`);
  });

  it("includes alt text when provided", () => {
    expect(buildImageMarkdown(dataUrl, "diagram")).toBe(`![diagram](${dataUrl})`);
  });
});

describe("buildImagesMarkdown", () => {
  it("joins multiple embedded images with newlines", () => {
    const result = buildImagesMarkdown(["data:image/png;base64,AAA", "data:image/png;base64,BBB"]);
    expect(result).toBe("![](data:image/png;base64,AAA)\n![](data:image/png;base64,BBB)");
  });
});

describe("readImageFileAsDataUrl", () => {
  it("rejects when there is no blob to read", async () => {
    await expect(readImageFileAsDataUrl(null)).rejects.toThrow("No image data to read.");
  });
});
