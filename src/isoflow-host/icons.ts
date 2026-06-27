// The icon palette and default colours offered in the isoflow editor window. Mirrors isoflow's own
// `examples/initialData.ts`: flatten the bundled isopacks (the core set plus the cloud-vendor packs)
// into the flat `icons` array isoflow's `initialData.icons` expects. These are bundled into the
// isoflow-host Vite entry only, so they never weigh on the main editor chunk. The icon definitions
// are NOT persisted with a saved diagram (see IsoflowHostApp's "lean model"); they are re-injected
// here on every open, and item→icon references resolve by stable isopack id.
import { flattenCollections } from "@isoflow/isopacks/dist/utils";
import isoflowIsopack from "@isoflow/isopacks/dist/isoflow";
import awsIsopack from "@isoflow/isopacks/dist/aws";
import azureIsopack from "@isoflow/isopacks/dist/azure";
import gcpIsopack from "@isoflow/isopacks/dist/gcp";
import kubernetesIsopack from "@isoflow/isopacks/dist/kubernetes";

export const icons = flattenCollections([
  isoflowIsopack,
  awsIsopack,
  azureIsopack,
  gcpIsopack,
  kubernetesIsopack
]);

// A small default colour palette (isoflow's example set) so a brand-new diagram has colours to pick
// for connectors and rectangles. A saved diagram carries its own colours; this is only the fallback.
export const defaultColors = [
  { id: "color1", value: "#a5b8f3" },
  { id: "color2", value: "#bbadfb" },
  { id: "color3", value: "#f4eb8e" },
  { id: "color4", value: "#f0aca9" },
  { id: "color5", value: "#fad6ac" },
  { id: "color6", value: "#a8dc9d" },
  { id: "color7", value: "#b3e5e3" }
];
