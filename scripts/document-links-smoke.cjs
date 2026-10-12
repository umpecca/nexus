// Exercise the real editor and preload with isolated documents and native IPC validation.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { createRendererIpc } = require('../electron/rendererIpc.cjs');
const { resolveDocumentLink } = require('../electron/documentLinks.cjs');
const { readDocumentText } = require('../electron/documentFiles.cjs');
let window, fixture, state, openResult, choice = 'cancel', prompts = 0, saves = 0, reads = 0, resolvePendingRead;
const external = [];
const deadline = setTimeout(() => { console.error('Document link smoke timed out.'); app.exit(1); }, 60000);
app.on('window-all-closed', () => {});
const evaluate = code => window.webContents.executeJavaScript(code);
async function until(condition) {
  const end = Date.now() + 6000;
  while (!await condition()) {
    if (Date.now() > end) throw new Error(`Timed out: ${condition}; state=${JSON.stringify(state)}`);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}
const wait = code => until(() => evaluate(code));
async function follow(href, modifier = 'ctrlKey') {
  const renderedHref = /^file:/i.test(href) ? 'about:blank' : /^[^/.#][^:]*$/.test(href) ? `https://${href}` : href;
  await wait(`[...document.querySelectorAll('.mdxeditor-rich-text-editor a')].some(a => a.getAttribute('href') === ${JSON.stringify(renderedHref)})`);
  await evaluate(`(() => {
    const anchor = [...document.querySelectorAll('.mdxeditor-rich-text-editor a')].find(a => a.getAttribute('href') === ${JSON.stringify(renderedHref)});
    if (!anchor) throw new Error('Missing link: ' + ${JSON.stringify(href)});
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ${modifier}: true }));
  })()`);
}
async function dirtyTitle(title) {
  window.webContents.send('menu:action', 'documentProperties');
  await wait("!!document.querySelector('#document-properties')");
  await evaluate(`(() => {
    const input = [...document.querySelectorAll('#document-properties label')].find(label => label.firstChild.textContent === 'Title').querySelector('input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(title)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await evaluate("[...document.querySelectorAll('.nexus-document-properties-dialog button')].find(b => b.textContent === 'Apply').click()");
  await until(() => state.dirty && state.markdown.includes(title));
}
async function openHome() {
  choice = 'discard'; window.webContents.send('menu:action', 'open');
  await until(() => state.filePath === openResult.filePath && !state.dirty);
}
async function headingVisible(text) {
  return evaluate(`(() => {
    const heading = [...document.querySelectorAll('.mdxeditor-rich-text-editor h2')].find(h => h.textContent === ${JSON.stringify(text)});
    const rect = heading?.getBoundingClientRect(); return !!rect && rect.top >= 0 && rect.top < innerHeight;
  })()`);
}
app.whenReady().then(async () => {
  fixture = await fs.mkdtemp(path.join(app.getPath('temp'), 'nexus-links-smoke-'));
  const root = path.join(fixture, 'docs'); await fs.mkdir(root);
  const home = path.join(root, 'index.md'), guide = path.join(root, 'My Guide.md'), outside = path.join(fixture, 'outside.md');
  const filler = Array.from({ length: 60 }, (_, i) => `Paragraph ${i} with content.\n`).join('\n');
  const markdown = '# Home\n\n[Guide](My%20Guide.md#setup)\n\n[Self](index.md#end)\n\n[End](#end)\n\n[Web](https://example.com/guide.md)\n\n[Missing](missing.md)\n\n[Outside](../outside.md)\n\n[File URL](' + pathToFileURL(guide).href + ')\n\n' + filler + '\n## End\n\nEnd content.\n';
  await fs.writeFile(home, markdown);
  await fs.writeFile(guide, '---\n# Setup\ntitle: Guide\n---\n\n# Guide\n\n[Home](index.md)\n\n' + filler + '\n## Setup\n\nInstructions.\n');
  await fs.writeFile(outside, '# Outside workspace\n');
  openResult = { canceled: false, filePath: home, markdown };
  const trusted = new Map(), ipc = createRendererIpc(ipcMain, trusted);
  const responses = {
    'app:get-version': 'smoke', 'app:get-profile-name': 'links-smoke', 'file:get-initial-open-file': openResult,
    'recent:list': [], 'quickconnect:get-token': '', 'mcp:get-bearer-token': '', 'mcp:configure': {}, 'window:is-maximized': false,
    'file:watch': {}, 'file:unwatch': {}, 'diagram:read-svg': null, 'ai:release-conversation': {}, 'ai:load-chat-history': { ok: true },
    'ai:delete-chat-history': { ok: true }, 'ai:save-chat-history': { ok: true },
    'folder:open': { id: 'root', path: root, name: 'docs' },
    'folder:list': [{ name: 'index.md', path: 'index.md', kind: 'file', openable: true }, { name: 'My Guide.md', path: 'My Guide.md', kind: 'file', openable: true }],
    'folder:close': undefined
  };
  for (const [channel, result] of Object.entries(responses)) ipc.handle(channel, () => result);
  ipc.handle('file:open', () => openResult);
  ipc.handle('folder:read', () => openResult);
  ipc.handle('dialog:confirmSaveChanges', () => { prompts++; return choice; });
  ipc.handle('file:save', async (_event, payload) => { saves++; await fs.writeFile(payload.filePath, payload.markdown); return { filePath: payload.filePath }; });
  ipc.handle('link:resolve', (_event, payload) => {
    const target = resolveDocumentLink(payload.documentPath, payload.href);
    if (target.kind === 'external') external.push(target.url);
    return target;
  });
  ipc.handle('file:read', async (_event, filePath) => {
    reads++;
    if (resolvePendingRead) await new Promise(resolve => { resolvePendingRead = resolve; });
    return { canceled: false, filePath, markdown: await readDocumentText(filePath) };
  });
  ipc.on('mcp:update-window-state', (_event, next) => { state = next; });
  window = new BrowserWindow({ show: false, width: 1100, height: 750, webPreferences: {
    preload: path.join(__dirname, '..', 'electron', 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false,
    backgroundThrottling: false, partition: `links-smoke-${Date.now()}`
  } });
  const url = pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href;
  trusted.set(window.webContents, url);
  window.webContents.on('console-message', event => { if (event.level === 'error') console.error(event.message); });
  await window.loadURL(url); await until(() => state?.filePath === home && !state.dirty);
  await wait("!!document.querySelector('.mdxeditor-rich-text-editor a')");
  // Select a link as a normal editing click would, then use the actual preview Open anchor.
  await evaluate(`(() => {
    const anchor = [...document.querySelectorAll('.mdxeditor-rich-text-editor a')].find(a => a.textContent === 'Guide');
    anchor.closest('[contenteditable]').focus();
    const range = document.createRange(); range.setStart(anchor.firstChild, 1); range.collapse(true);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  })()`);
  await wait("!!document.querySelector('a[class*=linkDialogPreviewAnchor]')");
  await evaluate("document.querySelector('a[class*=linkDialogPreviewAnchor]').click()");
  await until(() => state.filePath === guide && !state.dirty); await until(() => headingVisible('Setup'));
  assert.equal(window.webContents.getURL(), url); assert.equal(prompts, 0);
  await follow('index.md'); await until(() => state.filePath === home && !state.dirty);
  window.webContents.send('menu:action', 'openFolder'); await wait("!!document.querySelector('.nexus-files')");
  await dirtyTitle('Unsaved home'); const dirty = state.markdown, priorReads = reads;
  await follow('index.md#end'); await until(() => headingVisible('End'));
  assert.equal(state.markdown, dirty); assert(state.dirty); assert.equal(prompts, 0); assert.equal(reads, priorReads);
  await follow('My%20Guide.md#setup'); await until(() => prompts === 1); assert.equal(state.filePath, home); assert.equal(state.markdown, dirty);
  choice = 'discard'; await follow('My%20Guide.md#setup', 'metaKey'); await until(() => state.filePath === guide && !state.dirty);
  assert(await evaluate("!!document.querySelector('.nexus-files')"));
  await openHome(); await dirtyTitle('Saved home'); choice = 'save';
  await follow('My%20Guide.md#setup'); await until(() => state.filePath === guide && saves === 1);
  assert((await fs.readFile(home, 'utf8')).includes('Saved home'));
  await openHome(); const clean = state.markdown;
  await follow('missing.md'); await wait("[...document.querySelectorAll('[role=dialog]')].some(d => d.textContent.includes('Could not open link'))");
  assert.equal(state.filePath, home); assert.equal(state.markdown, clean);
  await evaluate("document.querySelector('[role=dialog] button').click()");
  await follow('https://example.com/guide.md'); await until(() => external.length === 1); assert.equal(state.filePath, home);
  await follow('../outside.md'); await until(() => state.filePath === outside); assert(await evaluate("!!document.querySelector('.nexus-files')"));
  await openHome(); await follow(pathToFileURL(guide).href); await until(() => state.filePath === guide);
  await openHome(); await follow('#end'); await until(() => headingVisible('End'));
  // A read that completes after a different document is opened must not replace that document.
  resolvePendingRead = true; const beforeRead = reads; await follow('My%20Guide.md#setup'); await until(() => reads > beforeRead && typeof resolvePendingRead === 'function');
  window.webContents.send('menu:action', 'new'); await until(() => !state.filePath && !state.markdown.trim());
  resolvePendingRead(); resolvePendingRead = null;
  await new Promise(resolve => setTimeout(resolve, 150)); assert(!state.filePath && !state.markdown.trim());
  console.log('Document link smoke passed: popover, Ctrl/Cmd-click, paths, anchors, folder retention, Save/Discard/Cancel, missing/external links, stale reads.');
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  clearTimeout(deadline); window?.destroy();
  if (fixture) await fs.rm(fixture, { recursive: true, force: true });
  app.exit(process.exitCode ?? 0);
});
