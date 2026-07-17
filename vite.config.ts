import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  // Some isoflow transitive deps (e.g. react-quill) reference the Node-style `global`; alias it to
  // the browser global so the bundle evaluates in the renderer/host windows.
  define: {
    global: "globalThis"
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      // Multi-page build: the main editor plus the isoflow editor window. The isoflow host is its own
      // entry/chunk so isoflow's heavy bundle (MUI/paper/gsap) never weighs on the main editor.
      input: {
        main: resolve(__dirname, "index.html"),
        isoflowHost: resolve(__dirname, "isoflow-host.html"),
        openapiHost: resolve(__dirname, "openapi-host.html"),
        sqlschemaHost: resolve(__dirname, "sqlschema-host.html")
      }
    }
  }
});
