import { nord } from "@uiw/codemirror-theme-nord";
import { createTheme } from "@uiw/codemirror-themes";
import { tags as t } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

/**
 * CodeMirror 6 port of the classic "idea" (IntelliJ IDEA light) theme. There is no packaged CM6
 * build of it, so the palette is ported from the original CodeMirror 5 `idea.css`: navy bold
 * keywords, green strings, gray italic comments, blue numbers, on a white background with the
 * signature pale-yellow active line and lavender selection.
 */
export const idea: Extension = createTheme({
  theme: "light",
  settings: {
    background: "#ffffff",
    foreground: "#000000",
    caret: "#000000",
    selection: "#d7d4f0",
    selectionMatch: "#d7d4f0",
    lineHighlight: "#fffae3",
    gutterBackground: "#ffffff",
    gutterForeground: "#999999",
    gutterBorder: "transparent"
  },
  styles: [
    { tag: t.keyword, color: "#000080", fontWeight: "bold" },
    { tag: [t.atom, t.bool], color: "#201f1f" },
    { tag: t.number, color: "#0000ff" },
    { tag: [t.string, t.special(t.string), t.regexp], color: "#008000" },
    { tag: [t.comment, t.lineComment, t.blockComment], color: "#808080", fontStyle: "italic" },
    { tag: [t.meta, t.annotation], color: "#808000" },
    { tag: t.operator, color: "#000000" },
    { tag: [t.variableName, t.propertyName, t.definition(t.variableName)], color: "#000000" },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#000000" },
    { tag: [t.typeName, t.className, t.namespace], color: "#000000" },
    { tag: t.tagName, color: "#000080" },
    { tag: t.attributeName, color: "#0000ff" },
    { tag: [t.link, t.url], color: "#0000ff", textDecoration: "underline" },
    { tag: t.heading, color: "#000080", fontWeight: "bold" },
    { tag: t.quote, color: "#009900" },
    { tag: t.strong, fontWeight: "bold" },
    { tag: t.emphasis, fontStyle: "italic" },
    { tag: [t.processingInstruction, t.inserted], color: "#808000" },
    { tag: t.invalid, color: "#ff0000" }
  ]
});

export { nord };

/**
 * The CodeMirror theme extension(s) for a resolved app theme: `nord` for the dark theme, the `idea`
 * light theme for the sky and light themes. Spread into a plugin's `codeMirrorExtensions`.
 */
export function codeMirrorThemeExtensions(resolvedTheme: "light" | "sky" | "dark"): Extension[] {
  return resolvedTheme === "dark" ? [nord] : [idea];
}
