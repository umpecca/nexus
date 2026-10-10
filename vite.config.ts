import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => {
  const nonce = command === "serve" ? randomBytes(24).toString("base64") : undefined;
  return {
    base: "./",
    html: { cspNonce: nonce },
    plugins: [react(), {
      name: "nexus-development-csp",
      apply: "serve",
      transformIndexHtml: {
        order: "post",
        handler(html) {
          // Vite adds this nonce to its React refresh preamble and script tags. Production uses
          // only external scripts; neither environment needs inline-script or eval permission.
          return html.replace("script-src 'self';", `script-src 'self' 'nonce-${nonce}';`)
            .replace("connect-src 'self' data: blob: http: https:;", "connect-src 'self' data: blob: http: https: ws: wss:;");
        }
      }
    }],
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
  };
});
