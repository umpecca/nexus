import { createRoot } from "react-dom/client";
import { IsoflowHostApp } from "./IsoflowHostApp";
import "./host.css";

// Entry point for the isoflow editor window. Note: no React.StrictMode — isoflow (MUI + paper.js +
// gsap) is not strict-mode-safe, and the double-invoked effects would fire the preload `ready()`
// handshake and mount isoflow twice.
const container = document.getElementById("root");
if (container) {
  createRoot(container).render(<IsoflowHostApp />);
}
