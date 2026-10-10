// Run with Electron after `npm run build`; uses hidden windows and synthetic data only.
const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { pathToFileURL } = require("node:url");
const { createRendererIpc } = require("../electron/rendererIpc.cjs");
const ts = require("typescript");

let work;
let window;
let otherWindow;
let exitCode = 0;
const deadline = setTimeout(() => { console.error("Renderer security smoke test timed out."); app.exit(1); }, 30000);

app.whenReady().then(async () => {
  work = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-renderer-security-"));
  const preload = path.join(work, "preload.cjs");
  await fs.writeFile(preload, 'const {contextBridge,ipcRenderer}=require("electron");contextBridge.exposeInMainWorld("securitySmoke",{probe:()=>ipcRenderer.invoke("security:probe")});');
  const rendererPath = path.join(__dirname, "..", "dist", "index.html");
  const expectedUrl = pathToFileURL(rendererPath).href;
  const trusted = new Map();
  createRendererIpc(ipcMain, trusted).handle("security:probe", () => "allowed");
  const options = { show: false, webPreferences: {
    preload, sandbox: true, contextIsolation: true, nodeIntegration: false, plugins: true,
    // An in-memory partition keeps the test editor's draft/settings out of real user storage.
    partition: path.basename(work)
  } };
  window = new BrowserWindow(options);
  trusted.set(window.webContents, expectedUrl);
  await window.loadFile(rendererPath);
  if (await window.webContents.executeJavaScript('window.securitySmoke.probe()') !== "allowed") {
    throw new Error("The registered renderer was denied IPC.");
  }
  const source = await fs.readFile(path.join(__dirname, "..", "src", "lib", "localJavaScriptRunner.ts"), "utf8");
  const runnerJs = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  const checks = await window.webContents.executeJavaScript(`(async () => {
    const violations = [];
    document.addEventListener("securitypolicyviolation", event => violations.push(event.effectiveDirective));
    const script = document.createElement("script");
    script.textContent = "window.__inlineExecuted=true";
    document.body.append(script);
    const image = document.createElement("img");
    image.setAttribute("onerror", "window.__handlerExecuted=true");
    image.src = "data:image/png;base64,invalid";
    document.body.append(image);
    const link = document.createElement("a");
    link.href = "javascript:window.__linkExecuted=true";
    document.body.append(link);
    link.click();
    let evalBlocked = false;
    try { new Function("return 1")(); } catch { evalBlocked = true; }
    const exports = {};
    ${runnerJs}
    const worker = await exports.runLocalJavaScript('await Promise.resolve(); console.log("worker-ok");');
    const goodImage = document.createElement("img");
    const imageLoaded = await new Promise(resolve => {
      goodImage.onload = () => resolve(true);
      goodImage.onerror = () => resolve(false);
      goodImage.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');
      document.body.append(goodImage);
    });
    await new Promise(resolve => setTimeout(resolve, 100));
    return { inlineBlocked: !window.__inlineExecuted, handlerBlocked: !window.__handlerExecuted,
      javascriptLinkBlocked: !window.__linkExecuted, evalBlocked, worker, imageLoaded, violations,
      editorMounted: Boolean(document.querySelector(".mdxeditor")) };
  })()`);
  if (!checks.inlineBlocked || !checks.handlerBlocked || !checks.javascriptLinkBlocked || !checks.evalBlocked ||
      checks.worker.status !== "success" || checks.worker.console[0]?.args[0] !== "worker-ok" ||
      !checks.imageLoaded || !checks.editorMounted) {
    throw new Error(`Renderer checks failed: ${JSON.stringify(checks)}`);
  }

  // Exercise a real blob PDF navigation through the same iframe path as Print Preview.
  const pdf = await window.webContents.printToPDF({ pageSize: "A4" });
  const pdfFrameLoaded = await window.webContents.executeJavaScript(`new Promise(resolve => {
    const bytes = Uint8Array.from(atob(${JSON.stringify(pdf.toString("base64"))}), char => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], {type:"application/pdf"}));
    const frame = document.createElement("iframe");
    frame.onload = () => { URL.revokeObjectURL(url); resolve(true); };
    frame.onerror = () => resolve(false);
    frame.src = url;
    document.body.append(frame);
    setTimeout(() => resolve(false), 5000);
  })`);
  if (!pdfFrameLoaded) throw new Error("Blob PDF preview failed to load under the CSP.");

  otherWindow = new BrowserWindow(options);
  await otherWindow.loadFile(rendererPath);
  const unregisteredDenied = await otherWindow.webContents.executeJavaScript('window.securitySmoke.probe().then(()=>false,()=>true)');
  const otherPage = path.join(work, "other.html");
  await fs.writeFile(otherPage, "<!doctype html><title>Untrusted page</title>");
  await window.loadFile(otherPage);
  const navigationDenied = await window.webContents.executeJavaScript('window.securitySmoke.probe().then(()=>false,()=>true)');
  if (!unregisteredDenied || !navigationDenied) throw new Error("An untrusted window or navigation retained IPC access.");
  console.log(JSON.stringify({ ...checks, pdfFrameLoaded, unregisteredDenied, navigationDenied }));
}).catch(error => {
  console.error(error);
  exitCode = 1;
}).finally(async () => {
  clearTimeout(deadline);
  if (otherWindow && !otherWindow.isDestroyed()) otherWindow.destroy();
  if (window && !window.isDestroyed()) window.destroy();
  if (work && path.dirname(path.resolve(work)) === path.resolve(os.tmpdir()) &&
      path.basename(work).startsWith("nexus-renderer-security-")) {
    await fs.rm(work, { recursive: true, force: true });
  }
  app.exit(exitCode);
});
