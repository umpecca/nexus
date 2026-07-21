import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $isImageNode,
  openEditImageDialog$,
  type ImageNode
} from "@mdxeditor/editor";
import { usePublisher } from "@mdxeditor/gurx";
import { $getNodeByKey, type NodeKey } from "lexical";
import { Crop, Settings, Trash2 } from "lucide-react";
import { useRef, useState, type FC, type PointerEvent as ReactPointerEvent } from "react";
import {
  cropRasterImage,
  EMPTY_IMAGE_CROP,
  isCroppableRasterSource,
  setImageCropEdge,
  type ImageCropInsets
} from "../../lib/imageCrop";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../ui/dialog";

type RasterImageToolbarProps = {
  nodeKey: NodeKey;
  imageSource: string;
  initialImagePath: string | null;
  title: string;
  alt: string;
  width: number | "inherit";
  height: number | "inherit";
};

type CropEdge = keyof ImageCropInsets;

// Keep the first raster for each live editor node so repeated adjustments always start from the
// automatic import crop instead of progressively degrading/re-cropping an already cropped PNG.
const originalCropSources = new Map<NodeKey, string>();

function RasterImageToolbar({
  nodeKey,
  imageSource,
  initialImagePath,
  title,
  alt,
  width,
  height
}: RasterImageToolbarProps) {
  const [editor] = useLexicalComposerContext();
  const openEditImageDialog = usePublisher(openEditImageDialog$);
  const [open, setOpen] = useState(false);
  const [crop, setCrop] = useState<ImageCropInsets>(EMPTY_IMAGE_CROP);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const previewRef = useRef<HTMLDivElement>(null);
  const canCrop = isCroppableRasterSource(imageSource);
  const cropSource = originalCropSources.get(nodeKey) ?? imageSource;

  function deleteImage() {
    originalCropSources.delete(nodeKey);
    editor.update(() => $getNodeByKey(nodeKey)?.remove());
  }

  function editImageSettings() {
    originalCropSources.delete(nodeKey);
    openEditImageDialog({
      nodeKey,
      initialValues: {
        src: initialImagePath ?? imageSource,
        title,
        altText: alt,
        width: typeof width === "number" ? width : undefined,
        height: typeof height === "number" ? height : undefined
      }
    });
  }

  function openCropDialog() {
    setCrop(EMPTY_IMAGE_CROP);
    setError("");
    setOpen(true);
  }

  function dragCropEdge(edge: CropEdge, event: ReactPointerEvent<HTMLButtonElement>) {
    const bounds = previewRef.current?.getBoundingClientRect();
    if (!bounds) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const horizontal = edge === "left" || edge === "right";
    const pointerPercent = horizontal
      ? ((event.clientX - bounds.left) / bounds.width) * 100
      : ((event.clientY - bounds.top) / bounds.height) * 100;
    setCrop((current) => setImageCropEdge(current, edge, pointerPercent));
  }

  async function applyCrop() {
    setBusy(true);
    setError("");
    try {
      const croppedSource = await cropRasterImage(cropSource, crop);
      originalCropSources.set(nodeKey, cropSource);
      editor.update(() => {
        const node = $getNodeByKey(nodeKey) as ImageNode | null;
        if ($isImageNode(node)) node.setSrc(croppedSource);
      });
      setOpen(false);
    } catch (cropError) {
      setError(cropError instanceof Error ? cropError.message : "The image could not be cropped.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="nexus-raster-image-toolbar" contentEditable={false}>
        <button type="button" title="Delete image" onClick={deleteImage}>
          <Trash2 aria-hidden="true" />
        </button>
        <button type="button" title="Image settings" onClick={editImageSettings}>
          <Settings aria-hidden="true" />
        </button>
        {canCrop ? (
          <button type="button" title="Adjust crop" onClick={openCropDialog}>
            <Crop aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <Dialog open={open} onOpenChange={(nextOpen) => !busy && setOpen(nextOpen)}>
        <DialogContent className="nexus-image-crop-dialog">
          <DialogHeader>
            <DialogTitle>Adjust Image Crop</DialogTitle>
            <DialogDescription>
              Drag any edge inward to remove unwanted page content. Apply creates a new portable PNG;
              the editor&apos;s Undo command restores the previous image.
            </DialogDescription>
          </DialogHeader>

          <div className="nexus-image-crop-workspace">
            <div className="nexus-image-crop-stage" ref={previewRef}>
              <img src={cropSource} alt={alt} draggable={false} />
              <div
                className="nexus-image-crop-selection"
                style={{ left: `${crop.left}%`, top: `${crop.top}%`, right: `${crop.right}%`, bottom: `${crop.bottom}%` }}
              >
                {(["left", "top", "right", "bottom"] as CropEdge[]).map((edge) => (
                  <button
                    aria-label={`Drag ${edge} crop edge`}
                    className={`nexus-image-crop-handle nexus-image-crop-handle-${edge}`}
                    key={edge}
                    onPointerDown={(event) => dragCropEdge(edge, event)}
                    onPointerMove={(event) => event.currentTarget.hasPointerCapture(event.pointerId) && dragCropEdge(edge, event)}
                    type="button"
                  />
                ))}
              </div>
            </div>
          </div>

          {error ? <p className="nexus-image-import-error">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCrop(EMPTY_IMAGE_CROP)} disabled={busy}>
              Reset
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void applyCrop()} disabled={busy}>
              {busy ? "Applyingâ€¦" : "Apply crop"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// MDXEditor types this extension point as FC<{}>, although ImageEditor passes the documented runtime
// image props above. Keep the cast at this single library boundary instead of weakening local types.
export default RasterImageToolbar as FC;
