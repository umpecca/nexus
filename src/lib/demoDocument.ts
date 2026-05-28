const DEMO_IMAGE_BASE64 =
  "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MjAiIGhlaWdodD0iMTYwIiB2aWV3Qm94PSIwIDAgNDIwIDE2MCI+PHJlY3Qgd2lkdGg9IjQyMCIgaGVpZ2h0PSIxNjAiIHJ4PSIxOCIgZmlsbD0iI2VlZjJmZiIvPjxjaXJjbGUgY3g9IjgwIiBjeT0iODAiIHI9IjQyIiBmaWxsPSIjMmY2M2I3Ii8+PHRleHQgeD0iMTQwIiB5PSI3NCIgZm9udC1mYW1pbHk9IlNlZ29lIFVJLCBBcmlhbCIgZm9udC1zaXplPSIyNCIgZmlsbD0iIzExMTgyNyI+TmV4dXMgZGVtbyBpbWFnZTwvdGV4dD48dGV4dCB4PSIxNDAiIHk9IjEwNCIgZm9udC1mYW1pbHk9IlNlZ29lIFVJLCBBcmlhbCIgZm9udC1zaXplPSIxNSIgZmlsbD0iIzRiNTU2MyI+RW1iZWRkZWQgYXMgYSBiYXNlNjQgU1ZHIGRhdGEgVVJMPC90ZXh0Pjwvc3ZnPg==";

export const DEMO_DOCUMENT_MARKDOWN = `---
title: Nexus Feature Demo
description: A built-in document for smoke testing editor and export features.
tags:
  - demo
  - markdown
  - nexus
---

# Nexus Feature Demo

This built-in demo document exercises the editor features Nexus currently supports. Use it for quick visual checks, export smoke tests, and toolbar experiments.

## Heading Levels

# Heading One

Lorem ipsum dolor sit amet, consectetur adipiscing elit.

## Heading Two

Lorem ipsum dolor sit amet, consectetur adipiscing elit.

### Heading Three

Lorem ipsum dolor sit amet, consectetur adipiscing elit.

#### Heading Four

Lorem ipsum dolor sit amet, consectetur adipiscing elit.

##### Heading Five

Lorem ipsum dolor sit amet, consectetur adipiscing elit.

###### Heading Six

Lorem ipsum dolor sit amet, consectetur adipiscing elit.

## Text Formatting

Nexus supports **bold**, *italic*, <u>underline</u>, ~~strikethrough~~, \`inline code\`, ==highlighted text==, H<sub>2</sub>O, and E = mc<sup>2</sup>.

> A block quote helps verify quote styling, indentation, and export spacing.

## Lists

- Bullet item one
- Bullet item two with **bold text**
  - Nested bullet item

1. First numbered step
2. Second numbered step
3. Third numbered step

- [x] Completed checklist item
- [ ] Open checklist item
- [ ] Another open checklist item

## Links and Media

[Open the Electron website](https://www.electronjs.org/) to verify standard links.

![Embedded base64 SVG demo image](data:image/svg+xml;base64,${DEMO_IMAGE_BASE64})

## Table

| Feature | Demo Coverage | Export Expectation |
| --- | --- | --- |
| Text formatting | Bold, italic, underline, strike, code, highlight, subscript, superscript | Inline styling is preserved where supported |
| Lists | Bullets, ordered items, and tasks | List structure remains readable |
| Images | Embedded base64 SVG | Image appears without local files |
| Diagrams | Mermaid code fence | Diagram renders as SVG in rich text, HTML, and PDF |

## Thematic Break

The next line is a thematic break.

---

## Mermaid Diagram

\`\`\`mermaid
flowchart LR
    Draft["Draft Markdown"] --> Edit["Edit in Nexus"]
    Edit --> Preview["Rich Text Preview"]
    Preview --> Export["HTML / PDF Export"]
    Export --> Share["Shareable Output"]
\`\`\`

## Runnable JavaScript Block

\`\`\`js nexus-run
const features = ["markdown", "tables", "mermaid", "base64 images"];
console.log("Nexus demo feature count:", features.length);
features.forEach((feature, index) => {
  console.info(index + 1, feature);
});
\`\`\`

## Standard Code Block

\`\`\`ts
type ExportFormat = "html" | "pdf";

function describeExport(format: ExportFormat) {
  return \`Exporting demo document as \${format.toUpperCase()}\`;
}
\`\`\`

## Admonition

:::note
This admonition checks directive rendering and editing. It should remain editable in rich text mode and readable in source mode.
:::

:::tip
Export this document to HTML and PDF to verify Mermaid diagrams, tables, code blocks, and embedded images together.
:::
`;
