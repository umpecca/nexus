const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow } = require("electron");

const userDataPath = path.join(os.tmpdir(), `nexus-export-html-smoke-${process.pid}`);

app.disableHardwareAcceleration();
app.setPath("userData", userDataPath);

async function main() {
  const mermaidScriptUrl = pathToFileURL(require.resolve("mermaid/dist/mermaid.min.js")).href;
  const exportWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: false
    }
  });

  try {
    const html = `<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body>
  <figure class="nexus-export-mermaid">
    <pre class="nexus-export-mermaid-source">graph TD
  A[Start] --> B[Done]</pre>
  </figure>
</body>
</html>`;

    await exportWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await exportWindow.webContents.executeJavaScript(
      `
        (async () => {
          const textToBase64 = (text) => {
            const bytes = new TextEncoder().encode(text);
            let binary = "";
            const chunkSize = 0x8000;
            for (let index = 0; index < bytes.length; index += chunkSize) {
              binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
            }
            return btoa(binary);
          };

          await new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = ${JSON.stringify(mermaidScriptUrl)};
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Mermaid export renderer could not be loaded."));
            document.head.appendChild(script);
          });

          window.mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            theme: "default"
          });

          const diagram = document.querySelector(".nexus-export-mermaid");
          const source = diagram.querySelector(".nexus-export-mermaid-source").textContent;
          const result = await window.mermaid.render("nexus-export-mermaid-smoke", source);
          const image = document.createElement("img");
          image.src = \`data:image/svg+xml;base64,\${textToBase64(result.svg)}\`;
          image.alt = "Mermaid diagram";
          diagram.replaceChildren(image);
        })();
      `,
      true
    );

    const renderedHtml = await exportWindow.webContents.executeJavaScript(
      "document.documentElement.outerHTML",
      true
    );

    if (!renderedHtml.includes('<img src="data:image/svg+xml;base64,')) {
      throw new Error("Expected rendered Mermaid SVG image data URL in export HTML.");
    }

    await fs.mkdir(userDataPath, { recursive: true });
    const outputPath = path.join(userDataPath, "export.html");
    await fs.writeFile(outputPath, `<!doctype html>\n${renderedHtml}`, "utf8");
    const writtenHtml = await fs.readFile(outputPath, "utf8");

    if (!writtenHtml.includes('<img src="data:image/svg+xml;base64,')) {
      throw new Error("Expected written export HTML to contain the rendered Mermaid image data URL.");
    }

    console.log("HTML export Mermaid data URL write smoke passed");
  } finally {
    if (!exportWindow.isDestroyed()) {
      exportWindow.destroy();
    }
    await fs.rm(userDataPath, { recursive: true, force: true });
  }
}

app.whenReady()
  .then(main)
  .then(() => app.quit())
  .catch((error) => {
    console.error(error);
    app.quit();
    process.exitCode = 1;
  });
