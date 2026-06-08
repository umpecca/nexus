import path from "node:path";
import { describe, expect, it } from "vitest";
// The relative-image-source logic used by the "image:select-local" IPC handler. This test lives under
// electron/ (outside the tsconfig "src" include) so it can require the raw CommonJS module directly.
import { toMarkdownImageSource } from "./imagePaths.cjs";

// Pin Windows path semantics regardless of where the test runs, with a deterministic file:// stub so
// the absolute fallbacks are assertable cross-platform.
const win = {
  pathApi: path.win32,
  toFileUrl: (absolutePath: string) => `file://${absolutePath.replace(/\\/g, "/")}`
};

const posix = {
  pathApi: path.posix,
  toFileUrl: (absolutePath: string) => `file://${absolutePath}`
};

describe("toMarkdownImageSource (Windows)", () => {
  it("makes a child-folder image relative with a ./ prefix", () => {
    expect(
      toMarkdownImageSource("C:\\docs\\readme.md", "C:\\docs\\images\\logo.png", win)
    ).toBe("./images/logo.png");
  });

  it("makes a same-folder image relative with a ./ prefix", () => {
    expect(toMarkdownImageSource("C:\\docs\\readme.md", "C:\\docs\\logo.png", win)).toBe(
      "./logo.png"
    );
  });

  it("walks up to a sibling folder with ../", () => {
    expect(
      toMarkdownImageSource("C:\\docs\\guide\\readme.md", "C:\\docs\\assets\\logo.png", win)
    ).toBe("../assets/logo.png");
  });

  it("falls back to a file URL across different drives", () => {
    expect(
      toMarkdownImageSource("C:\\docs\\readme.md", "D:\\media\\logo.png", win)
    ).toBe("file://D:/media/logo.png");
  });
});

describe("toMarkdownImageSource (POSIX)", () => {
  it("makes a child-folder image relative with a ./ prefix", () => {
    expect(
      toMarkdownImageSource("/home/me/docs/readme.md", "/home/me/docs/images/logo.png", posix)
    ).toBe("./images/logo.png");
  });

  it("walks up to a sibling folder with ../", () => {
    expect(
      toMarkdownImageSource("/home/me/docs/guide/readme.md", "/home/me/docs/assets/logo.png", posix)
    ).toBe("../assets/logo.png");
  });
});

describe("toMarkdownImageSource (untitled document)", () => {
  it("returns an absolute file URL when there is no document path", () => {
    expect(toMarkdownImageSource("", "C:\\docs\\images\\logo.png", win)).toBe(
      "file://C:/docs/images/logo.png"
    );
    expect(toMarkdownImageSource(undefined, "/home/me/logo.png", posix)).toBe(
      "file:///home/me/logo.png"
    );
  });

  it("treats a whitespace-only document path as untitled", () => {
    expect(toMarkdownImageSource("   ", "/home/me/logo.png", posix)).toBe("file:///home/me/logo.png");
  });
});
