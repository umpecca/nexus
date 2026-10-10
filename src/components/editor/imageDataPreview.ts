import type { EditorView } from "@codemirror/view";

const activePreviews = new WeakMap<EditorView, () => void>();

export function dismissImagePreview(view: EditorView) {
  activePreviews.get(view)?.();
}

/** Create image elements only on demand. Native popovers escape editor/dialog clipping while
 * remaining inside the widget's DOM, so modal focus and outside-click handling still work. */
export function attachImagePreview(wrapper: HTMLElement, view: EditorView, urlFrom: number, to: number) {
  const doc = wrapper.ownerDocument;
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "nexus-image-preview-button";
  button.textContent = "Preview";
  button.title = "Preview image (hover or click)";
  button.setAttribute("aria-label", "Preview embedded image");
  button.setAttribute("aria-expanded", "false");
  wrapper.prepend(button);
  let popup: HTMLDivElement | null = null;
  let pinned = false;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;

  function dismiss() {
    clearTimeout(closeTimer);
    popup?.remove();
    popup = null;
    pinned = false;
    button.setAttribute("aria-expanded", "false");
    doc.removeEventListener("pointerdown", outsideClick, true);
    doc.defaultView?.removeEventListener("keydown", escape, true);
    doc.removeEventListener("scroll", dismiss, true);
    doc.defaultView?.removeEventListener("resize", dismiss);
    if (activePreviews.get(view) === dismiss) activePreviews.delete(view);
  }
  function outsideClick(event: Event) {
    if (!wrapper.contains(event.target as Node)) dismiss();
  }
  function escape(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    dismiss();
    view.focus();
  }
  function position() {
    if (!popup) return;
    const anchor = button.getBoundingClientRect();
    const viewport = doc.defaultView!;
    const width = popup.offsetWidth || 288;
    const height = popup.offsetHeight || 240;
    popup.style.left = `${Math.max(8, Math.min(anchor.left, viewport.innerWidth - width - 8))}px`;
    const below = anchor.bottom + 8;
    popup.style.top = `${Math.max(8, below + height <= viewport.innerHeight - 8
      ? below : anchor.top - height - 8)}px`;
  }
  function show() {
    clearTimeout(closeTimer);
    if (popup) return;
    dismissImagePreview(view);
    const preview = doc.createElement("div");
    preview.className = "nexus-image-preview";
    preview.setAttribute("role", "region");
    preview.setAttribute("aria-label", "Embedded image preview");
    // Electron supports popovers. The plain element fallback also lets DOM-only tests exercise
    // preview contents and lifecycle without emulating the browser's top layer.
    if (typeof preview.showPopover === "function") preview.setAttribute("popover", "manual");
    const header = doc.createElement("div");
    header.className = "nexus-image-preview-header";
    const label = doc.createElement("span");
    label.textContent = "Image preview";
    const close = doc.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.setAttribute("aria-label", "Close image preview");
    close.addEventListener("click", () => { dismiss(); view.focus(); });
    header.append(label, close);
    const image = doc.createElement("img");
    image.alt = "Embedded image thumbnail";
    const status = doc.createElement("div");
    status.className = "nexus-image-preview-status";
    status.setAttribute("role", "status");
    status.textContent = "Loading image…";
    image.addEventListener("load", () => {
      if (popup !== preview) return;
      status.textContent = `${image.naturalWidth} × ${image.naturalHeight}`;
      position();
    });
    image.addEventListener("error", () => {
      if (popup !== preview) return;
      image.hidden = true;
      status.textContent = "Preview unavailable";
      position();
    });
    preview.append(header, image, status);
    wrapper.append(preview);
    popup = preview;
    preview.showPopover?.();
    position();
    image.src = view.state.sliceDoc(urlFrom, to).replace(/^data\\:/i, "data:");
    button.setAttribute("aria-expanded", "true");
    activePreviews.set(view, dismiss);
    doc.addEventListener("pointerdown", outsideClick, true);
    // Run before dialog libraries' document-level Escape handlers, so dismissing a thumbnail
    // cannot reject the proposal that owns it.
    doc.defaultView?.addEventListener("keydown", escape, true);
    doc.addEventListener("scroll", dismiss, true);
    doc.defaultView?.addEventListener("resize", dismiss);
  }
  function leave() {
    if (!pinned) closeTimer = setTimeout(dismiss, 150);
  }
  wrapper.addEventListener("mouseenter", show);
  wrapper.addEventListener("mouseleave", leave);
  wrapper.addEventListener("focusin", show);
  wrapper.addEventListener("focusout", (event) => {
    if (!wrapper.contains(event.relatedTarget as Node)) leave();
  });
  wrapper.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => {
    if (pinned) dismiss();
    else { show(); pinned = true; }
  });
  return dismiss;
}
