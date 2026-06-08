import { FormEvent, useMemo, useState } from "react";
import { TooltipWrap, insertImage$ } from "@mdxeditor/editor";
import { usePublisher } from "@mdxeditor/gurx";
import { ImagePlus } from "lucide-react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../ui/dialog";

type ImageImportMode = "local" | "remote" | "base64";

const base64MimeFallback = "image/png";

function normalizeBase64ImageSource(value: string, mimeType: string) {
  const trimmedValue = value.trim();
  if (trimmedValue.startsWith("data:image/")) {
    return trimmedValue;
  }

  const compactValue = trimmedValue.replace(/\s/g, "");
  if (!compactValue) {
    return "";
  }

  return `data:${mimeType.trim() || base64MimeFallback};base64,${compactValue}`;
}

function isRemoteImageUrl(value: string) {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

function InsertImageImport({ documentPath }: { documentPath?: string }) {
  const insertImage = usePublisher(insertImage$);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ImageImportMode>("local");
  const [localFilePath, setLocalFilePath] = useState("");
  const [localSrc, setLocalSrc] = useState("");
  const [remoteSrc, setRemoteSrc] = useState("");
  const [base64Src, setBase64Src] = useState("");
  const [base64MimeType, setBase64MimeType] = useState(base64MimeFallback);
  const [altText, setAltText] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  const currentSource = useMemo(() => {
    if (mode === "local") {
      return localSrc;
    }

    if (mode === "remote") {
      return remoteSrc.trim();
    }

    return normalizeBase64ImageSource(base64Src, base64MimeType);
  }, [base64MimeType, base64Src, localSrc, mode, remoteSrc]);

  function resetTransientState() {
    setError("");
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetTransientState();
    }
  }

  async function chooseLocalImage() {
    resetTransientState();
    // Pass the document path so a saved document gets a relative `src`; untitled docs send undefined
    // and the main process keeps the absolute file:// URL.
    const result = await window.nexus?.selectLocalImage(documentPath);
    if (!result || result.canceled) {
      return;
    }

    setLocalFilePath(result.filePath);
    setLocalSrc(result.src);
    if (!altText) {
      setAltText(result.filePath.split(/[\\/]/).pop() ?? "");
    }
  }

  async function chooseBase64Image() {
    resetTransientState();
    const result = await window.nexus?.selectBase64Image();
    if (!result || result.canceled) {
      return;
    }

    setBase64MimeType(result.mimeType);
    setBase64Src(result.dataUrl);
    if (!altText) {
      setAltText(result.filePath.split(/[\\/]/).pop() ?? "");
    }
  }

  function insertSelectedImage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetTransientState();

    if (!currentSource) {
      setError("Choose an image file or enter an image source.");
      return;
    }

    if (mode === "remote" && !isRemoteImageUrl(currentSource)) {
      setError("Remote images must use an http or https URL.");
      return;
    }

    insertImage({
      src: currentSource,
      altText,
      title
    });
    setOpen(false);
  }

  return (
    <>
      <TooltipWrap title="Import image">
        <Button
          aria-label="Import image"
          onClick={() => setOpen(true)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ImagePlus aria-hidden="true" />
        </Button>
      </TooltipWrap>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Image</DialogTitle>
            <DialogDescription>
              Insert a local image, remote image URL, or embedded base64 image.
            </DialogDescription>
          </DialogHeader>

          <form className="nexus-image-import-form" onSubmit={insertSelectedImage}>
            <div className="nexus-image-import-modes" role="group" aria-label="Image source type">
              <Button
                aria-pressed={mode === "local"}
                onClick={() => setMode("local")}
                size="sm"
                type="button"
                variant={mode === "local" ? "default" : "outline"}
              >
                Local
              </Button>
              <Button
                aria-pressed={mode === "remote"}
                onClick={() => setMode("remote")}
                size="sm"
                type="button"
                variant={mode === "remote" ? "default" : "outline"}
              >
                Remote URL
              </Button>
              <Button
                aria-pressed={mode === "base64"}
                onClick={() => setMode("base64")}
                size="sm"
                type="button"
                variant={mode === "base64" ? "default" : "outline"}
              >
                Base64
              </Button>
            </div>

            {mode === "local" ? (
              <div className="nexus-image-import-source">
                <Button onClick={() => void chooseLocalImage()} type="button" variant="outline">
                  Choose Image
                </Button>
                <p className="nexus-dialog-path">
                  {localFilePath || "No local image selected."}
                </p>
              </div>
            ) : null}

            {mode === "remote" ? (
              <label className="nexus-image-import-field">
                <span className="nexus-image-import-label">Image URL</span>
                <input
                  className="nexus-image-import-input"
                  onChange={(event) => setRemoteSrc(event.target.value)}
                  placeholder="https://example.com/image.png"
                  type="url"
                  value={remoteSrc}
                />
              </label>
            ) : null}

            {mode === "base64" ? (
              <div className="nexus-image-import-source">
                <Button onClick={() => void chooseBase64Image()} type="button" variant="outline">
                  Choose Image to Embed
                </Button>
                <label className="nexus-image-import-field">
                  <span className="nexus-image-import-label">MIME type</span>
                  <input
                    className="nexus-image-import-input"
                    onChange={(event) => setBase64MimeType(event.target.value)}
                    placeholder={base64MimeFallback}
                    type="text"
                    value={base64MimeType}
                  />
                </label>
                <label className="nexus-image-import-field">
                  <span className="nexus-image-import-label">Base64 or data URL</span>
                  <textarea
                    className="nexus-image-import-textarea"
                    onChange={(event) => setBase64Src(event.target.value)}
                    placeholder="data:image/png;base64,..."
                    value={base64Src}
                  />
                </label>
              </div>
            ) : null}

            <label className="nexus-image-import-field">
              <span className="nexus-image-import-label">Alt text</span>
              <input
                className="nexus-image-import-input"
                onChange={(event) => setAltText(event.target.value)}
                type="text"
                value={altText}
              />
            </label>

            <label className="nexus-image-import-field">
              <span className="nexus-image-import-label">Title</span>
              <input
                className="nexus-image-import-input"
                onChange={(event) => setTitle(event.target.value)}
                type="text"
                value={title}
              />
            </label>

            {error ? <p className="nexus-image-import-error">{error}</p> : null}

            <DialogFooter>
              <Button onClick={() => setOpen(false)} type="button" variant="outline">
                Cancel
              </Button>
              <Button type="submit">Insert</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default InsertImageImport;
