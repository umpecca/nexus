import { createRoot } from "react-dom/client";
import { SqlSchemaHostApp } from "./SqlSchemaHostApp";
import "./host.css";

const root = document.getElementById("root");
if (root) createRoot(root).render(<SqlSchemaHostApp />);
