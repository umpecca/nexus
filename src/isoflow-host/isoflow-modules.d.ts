// Ambient declarations for the isoflow editor host window.
//
// `@isoflow/isopacks` ships no type definitions and is consumed via deep `dist/*` subpath imports
// (matching isoflow's own example usage); `dom-to-image-more` is declared minimally for the single
// `toPng` call we make. These keep `tsc --noEmit` happy without pulling in untyped internals.

declare module "@isoflow/isopacks/dist/utils" {
  export function flattenCollections(collections: unknown[]): unknown[];
}
declare module "@isoflow/isopacks/dist/isoflow" {
  const pack: unknown;
  export default pack;
}
declare module "@isoflow/isopacks/dist/aws" {
  const pack: unknown;
  export default pack;
}
declare module "@isoflow/isopacks/dist/azure" {
  const pack: unknown;
  export default pack;
}
declare module "@isoflow/isopacks/dist/gcp" {
  const pack: unknown;
  export default pack;
}
declare module "@isoflow/isopacks/dist/kubernetes" {
  const pack: unknown;
  export default pack;
}

declare module "dom-to-image-more" {
  const domtoimage: {
    toPng(node: Node, options?: Record<string, unknown>): Promise<string>;
  };
  export default domtoimage;
}

// Bridge exposed by electron/isoflowPreload.cjs into the host window.
interface NexusIsoflowHostBridge {
  /** Tell main the host is mounted and ready to receive the initial model. */
  ready(): void;
  /** Subscribe to the initial diagram model (or null for a brand-new diagram). */
  onInit(callback: (model: unknown | null) => void): void;
  /** Resolve the edit session with the produced image + source model. */
  save(result: { dataUrl: string; model: unknown }): void;
  /** Abandon the edit session. */
  cancel(): void;
}

interface Window {
  nexusIsoflowHost?: NexusIsoflowHostBridge;
}
