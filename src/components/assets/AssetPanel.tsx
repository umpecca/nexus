import { useEffect, useMemo, useState } from "react";
import { Images, RefreshCw, X } from "lucide-react";
import { byteSize, formatAssetSize, listDocumentAssets, type DocumentAsset } from "../../lib/documentAssets";

export type AssetAction = "embed" | "extract" | "replace" | "locate";
export type AssetInfo = { kind: "embedded" | "local" | "remote" | "missing" | "unresolved" | "unavailable"; bytes?: number; preview?: string; filePath?: string; error?: string };

function AssetRow({ asset, documentPath, revision, busy, onAction }: {
  asset: DocumentAsset; documentPath?: string; revision: number; busy: boolean;
  onAction: (asset: DocumentAsset, action: AssetAction) => void;
}) {
  const [info, setInfo] = useState<AssetInfo | null>(null);
  const [dimensions, setDimensions] = useState("");
  const [previewError, setPreviewError] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    setInfo(null); setDimensions(""); setPreviewError(false);
    // A refresh may resolve to the same cached URL before React removes the old image.
    // Remount it so its load event restores natural dimensions even in that case.
    setPreviewVersion(current => current + 1);
    const inspect = window.nexus?.inspectDocumentAsset(documentPath, asset.source);
    if (!inspect) setInfo({ kind: "unavailable", error: "Asset inspection is unavailable in this window." });
    else void inspect.then(result => { if (alive) setInfo(result); })
      .catch(error => { if (alive) setInfo({ kind: "unavailable", error: String(error) }); });
    return () => { alive = false; };
  }, [asset.source, documentPath, revision]);
  return <li className="nexus-asset-row">
    <div className="nexus-asset-thumbnail">
      {info?.preview && !previewError ? <img key={previewVersion} src={info.preview} alt={asset.name} loading="lazy"
        onLoad={event => setDimensions(`${event.currentTarget.naturalWidth} × ${event.currentTarget.naturalHeight} px`)}
        onError={() => { setPreviewError(true); setDimensions(""); }} /> : <Images aria-hidden="true" />}
    </div>
    <strong>{asset.name}</strong>
    <span className="nexus-asset-source" title={asset.embedded ? "Image data is stored inside the document" : asset.source}>
      {asset.embedded ? "Embedded image" : asset.source}
    </span>
    <div className="nexus-asset-meta">
      <span>{dimensions || (previewError ? "Preview unavailable" : info ? "Dimensions unavailable" : "Inspecting…")}</span>
      <span>{info?.bytes === undefined ? "Size unknown" : formatAssetSize(info.bytes)}</span>
      {asset.occurrences.length > 1 ? <span>{asset.occurrences.length} destinations</span> : null}
      {asset.embedded ? <span>{formatAssetSize(asset.sourceBytes)} in Markdown</span> : null}
    </div>
    {info?.error ? <p className="nexus-asset-warning">{info.error}</p> : null}
    <div className="nexus-asset-actions">
      {asset.embedded ? <button type="button" disabled={busy || !documentPath || !info?.preview} title={!documentPath ? "Save the document first" : "Write a new image file and use its relative path"}
        onClick={() => onAction(asset, "extract")}>Extract to file…</button>
        : <button type="button" disabled={busy || !info?.preview} onClick={() => onAction(asset, "embed")}>Embed image</button>}
      <button type="button" disabled={busy} onClick={() => onAction(asset, "replace")}>Replace…</button>
      {info?.kind === "missing" || info?.kind === "unresolved" || previewError ? <button type="button" disabled={busy}
        onClick={() => onAction(asset, "locate")}>Locate file…</button> : null}
    </div>
  </li>;
}

export default function AssetPanel({ markdown, documentPath, onClose, onAction }: {
  markdown: string; documentPath?: string; onClose: () => void;
  onAction: (snapshot: string, asset: DocumentAsset, action: AssetAction) => Promise<void>;
}) {
  const [snapshot, setSnapshot] = useState(markdown);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { const timer = setTimeout(() => setSnapshot(markdown), 200); return () => clearTimeout(timer); }, [markdown]);
  const assets = useMemo(() => listDocumentAssets(snapshot), [snapshot]);
  const documentBytes = useMemo(() => byteSize(snapshot), [snapshot]);
  const embeddedBytes = assets.reduce((sum, asset) => sum + (asset.embedded ? asset.sourceBytes : 0), 0);
  async function act(asset: DocumentAsset, action: AssetAction) {
    setBusy(true); setError("");
    try { await onAction(snapshot, asset, action); setRevision(current => current + 1); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  return <aside className="nexus-asset-panel" aria-label="Document images and assets">
    <header><strong><Images aria-hidden="true" /> Images & assets</strong><div>
      <button type="button" aria-label="Refresh assets" disabled={busy} onClick={() => { setSnapshot(markdown); setRevision(current => current + 1); setError(""); }}><RefreshCw /></button>
      <button type="button" aria-label="Close assets" onClick={onClose}><X /></button>
    </div></header>
    <div className="nexus-asset-summary">
      <strong>{assets.length} {assets.length === 1 ? "image" : "images"} · {formatAssetSize(documentBytes)} document</strong>
      <span>{formatAssetSize(embeddedBytes)} embedded image source ({documentBytes ? Math.round(embeddedBytes / documentBytes * 100) : 0}%)</span>
      <p>Actions update the document. Save to keep changes. Shared image destinations are updated together.</p>
    </div>
    {error ? <p className="nexus-asset-error" role="alert">{error}</p> : null}
    <div className="nexus-asset-scroll">
      {assets.length ? <ul>{assets.map((asset, index) => <AssetRow key={index} asset={asset} documentPath={documentPath} revision={revision}
        busy={busy || snapshot !== markdown} onAction={(asset, action) => void act(asset, action)} />)}</ul>
        : <p className="nexus-asset-empty">This document has no images. Insert an image to see its preview, dimensions, and size here.</p>}
    </div>
  </aside>;
}
