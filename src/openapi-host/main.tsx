import { createRoot } from "react-dom/client";
import { OpenApiHostApp } from "./OpenApiHostApp";
import "./host.css";

const root = document.getElementById("root");
if (root) createRoot(root).render(<OpenApiHostApp />);
