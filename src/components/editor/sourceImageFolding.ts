import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import { fromMarkdown } from "mdast-util-from-markdown";
import { attachImagePreview, dismissImagePreview } from "./imageDataPreview";

type ImageDataRange = { urlFrom: number; from: number; to: number; expanded: boolean };
type ImageFoldingState = {
  images: ImageDataRange[];
  decorations: DecorationSet;
  collapsed: DecorationSet;
};

const toggleImageData = StateEffect.define<ImageDataRange>({
  map: (range, changes) => ({
    ...range,
    urlFrom: changes.mapPos(range.urlFrom, 1),
    from: changes.mapPos(range.from, 1),
    to: changes.mapPos(range.to, -1)
  })
});
const toggleAllImageData = StateEffect.define<boolean>();

export function hasFoldableImageData(view: EditorView) {
  return Boolean(view.state.field(imageFoldingState, false)?.images.length);
}

/** Display-only command; read-only review panes use the same effect as source editing. */
export function setAllImageDataExpanded(view: EditorView, expanded: boolean) {
  if (view.state.field(imageFoldingState, false)) {
    view.dispatch({ effects: toggleAllImageData.of(expanded) });
  }
}

/** Use Markdown nodes so examples in code and ordinary links stay literal. */
function findImageData(markdown: string): ImageDataRange[] {
  if (!/data\\?:image\//i.test(markdown)) return [];
  // Parse a short stand-in for each payload. Base64 contains no Markdown delimiters, so this
  // preserves the syntax while avoiding a character-by-character parse of multi-megabyte images.
  // Keep original offsets separately; decorations always address the untouched editor document.
  const candidates = new Map<number, { url: string; range: ImageDataRange }>();
  const chunks: string[] = [];
  let cursor = 0;
  let compactLength = 0;
  for (const match of markdown.matchAll(/data\\?:image\/[a-z0-9.+-]+(?:;[^,\s]*)?;base64,[a-z0-9+/]+={0,2}/gi)) {
    const prefixLength = match[0].indexOf(",") + 1;
    const url = match[0].slice(0, prefixLength) + "A";
    const before = markdown.slice(cursor, match.index);
    compactLength += before.length;
    candidates.set(compactLength, {
      url,
      range: { urlFrom: match.index!, from: match.index! + prefixLength, to: match.index! + match[0].length, expanded: false }
    });
    chunks.push(before, url);
    compactLength += url.length;
    cursor = match.index! + match[0].length;
  }
  if (candidates.size === 0) return [];
  chunks.push(markdown.slice(cursor));
  const compact = chunks.join("");
  const tree = fromMarkdown(compact);
  const referencedImages = new Set<string>();
  const images: ImageDataRange[] = [];

  function addUrl(url: string, start: number, end: number) {
    // MDXEditor's serializer escapes the data URL's colon in Markdown destinations.
    const escapedUrl = url.replace(/^data:/i, "data\\:");
    let offset = compact.indexOf(url, start);
    if (!candidates.has(offset) || offset + url.length > end) {
      offset = compact.indexOf(escapedUrl, start);
    }
    const candidate = candidates.get(offset);
    if (candidate && offset + candidate.url.length <= end &&
      (candidate.url === url || candidate.url === escapedUrl)) images.push(candidate.range);
  }

  type Node = typeof tree | (typeof tree.children)[number];
  function visit(node: Node, referencesOnly: boolean) {
    if (node.type === "imageReference") referencedImages.add(node.identifier);
    if (!referencesOnly) {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start !== undefined && end !== undefined) {
        if (node.type === "image" || (node.type === "definition" && referencedImages.has(node.identifier))) {
          const span = compact.slice(start, end);
          const destination = node.type === "image" ? span.indexOf("](") : span.indexOf("]:");
          if (destination !== -1) addUrl(node.url, start + destination + 2, end);
        } else if (node.type === "html") {
          const html = compact.slice(start, end);
          // Match src as an attribute, rather than data-src or a URL elsewhere in the tag.
          for (const tag of html.matchAll(/<img\b[^>]*>/gi)) {
            const src = /\s+src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag[0]);
            const url = src?.[1] ?? src?.[2] ?? src?.[3];
            if (url && src) {
              const end = start + tag.index! + src.index + src[0].length - (src[3] ? 0 : 1);
              addUrl(url, end - url.length, end);
            }
          }
        }
      }
    }
    if ("children" in node) {
      for (const child of node.children) visit(child, referencesOnly);
    }
  }
  visit(tree, true);
  visit(tree, false);
  return images.sort((a, b) => a.from - b.from);
}

class ImageDataWidget extends WidgetType {
  private dismissPreview?: () => void;
  constructor(private readonly range: ImageDataRange) {
    super();
  }

  eq(other: ImageDataWidget) {
    return this.range.urlFrom === other.range.urlFrom &&
      this.range.from === other.range.from && this.range.to === other.range.to &&
      this.range.expanded === other.range.expanded;
  }

  toDOM(view: EditorView) {
    const wrapper = document.createElement("span");
    wrapper.className = "nexus-image-data-widget";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "nexus-image-data-toggle";
    button.setAttribute("aria-expanded", String(this.range.expanded));
    const size = this.range.to - this.range.from;
    const label = size < 1024 ? `${size} characters` : `${(size / 1024).toFixed(1)}K characters`;
    button.textContent = this.range.expanded
      ? "▾ Collapse image data"
      : `▸ Expand image data (${label})`;
    button.title = this.range.expanded ? "Hide the base64 image payload" : "Show the base64 image payload";
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      // The button works in read-only diff panes too: this changes only display state.
      view.dispatch({ effects: toggleImageData.of({ ...this.range, expanded: !this.range.expanded }) });
      view.focus();
    });
    wrapper.append(button);
    this.dismissPreview = attachImagePreview(wrapper, view, this.range.urlFrom, this.range.to);
    return wrapper;
  }

  destroy() {
    this.dismissPreview?.();
  }
}

function decorate(images: ImageDataRange[]): ImageFoldingState {
  const collapsed = Decoration.set(images.filter((image) => !image.expanded).map((image) =>
    Decoration.replace({ widget: new ImageDataWidget(image) }).range(image.from, image.to)
  ));
  const decorations = Decoration.set(images.map((image) => image.expanded
    ? Decoration.widget({ widget: new ImageDataWidget(image), side: -1 }).range(image.from)
    : Decoration.replace({ widget: new ImageDataWidget(image) }).range(image.from, image.to)
  ));
  return { images, decorations, collapsed };
}

const imageFoldingState = StateField.define<ImageFoldingState>({
  create: (state) => decorate(findImageData(state.doc.toString())),
  update(value, transaction) {
    let images = value.images;
    if (transaction.docChanged) {
      const expanded = value.images.filter((image) => image.expanded).map((image) => ({
        from: transaction.changes.mapPos(image.from, 1),
        to: transaction.changes.mapPos(image.to, -1)
      }));
      images = findImageData(transaction.state.doc.toString()).map((image) => ({
        ...image,
        expanded: expanded.some((previous) => previous.from === image.from && previous.to === image.to)
      }));
    }
    for (const effect of transaction.effects) {
      if (effect.is(toggleImageData)) {
        images = images.map((image) => image.from === effect.value.from && image.to === effect.value.to
          ? { ...image, expanded: effect.value.expanded }
          : image);
      } else if (effect.is(toggleAllImageData)) {
        images = images.map((image) => ({ ...image, expanded: effect.value }));
      }
    }
    // Search and programmatic caret placement must reveal the selected source. Explicit collapse
    // wins for that transaction so a caret inside the payload doesn't immediately reopen it.
    if (transaction.selection && !transaction.effects.some((effect) =>
      effect.is(toggleImageData) || effect.is(toggleAllImageData))) {
      images = images.map((image) => ({
        ...image,
        expanded: image.expanded || transaction.state.selection.ranges.some((selection) =>
          selection.empty
            ? selection.from > image.from && selection.from < image.to
            : selection.from >= image.from && selection.to <= image.to
        )
      }));
    }
    return images === value.images ? value : decorate(images);
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations)
});

/** Hide only the payload; Markdown, clipboard contents, history, and diff inputs remain exact. */
export function sourceImageFoldingExtension() {
  return [
    imageFoldingState,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) dismissImagePreview(update.view);
    }),
    EditorView.atomicRanges.of((view) => view.state.field(imageFoldingState).collapsed)
  ];
}
