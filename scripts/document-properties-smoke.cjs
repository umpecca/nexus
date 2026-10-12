// Real renderer/preload with fixture-only saves and isolated storage.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { parse } = require('yaml');
const { createRendererIpc } = require('../electron/rendererIpc.cjs');
let window, fixture, state, openResult;
let exitCode = 0, saves = 0;
app.on('window-all-closed', () => {});
const deadline = setTimeout(() => { console.error('Document properties smoke timed out.'); app.exit(1); }, 60000);
const evaluate = code => window.webContents.executeJavaScript(code);
async function until(condition) {
  const end = Date.now() + 6000;
  while (!await condition()) {
    if (Date.now() > end) throw new Error(`Timed out: ${condition}; state=${JSON.stringify(state)}`);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}
const wait = code => until(() => evaluate(code));
const dialog = "document.querySelector('.nexus-document-properties-dialog')";
async function click(label) {
  await evaluate(`(() => {
    const scope = document.querySelector('.nexus-document-properties-dialog') ?? document;
    const button = [...scope.querySelectorAll('button')].find(button => button.textContent === ${JSON.stringify(label)} || button.getAttribute('aria-label') === ${JSON.stringify(label)});
    if (!button || button.disabled) throw new Error('Unavailable button: ' + ${JSON.stringify(label)});
    button.click();
  })()`);
}
async function properties() { await click('Document properties'); await wait(`${dialog} !== null`); }
async function fill(label, value) {
  await evaluate(`(() => {
    const label = [...document.querySelectorAll('#document-properties label')].find(node => node.firstChild.textContent === ${JSON.stringify(label)});
    const input = label.querySelector('input,textarea');
    Object.getOwnPropertyDescriptor(input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
}
async function undoRedo(keyCode, source = false) {
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  await evaluate(`document.querySelector(${JSON.stringify(source ? '.mdxeditor-source-editor .cm-content' : '.mdxeditor-root-contenteditable [contenteditable="true"]')}).focus()`);
  if (!source) await evaluate(`(() => {
    const heading = document.querySelector('.mdxeditor-root-contenteditable h1');
    const range = document.createRange(); range.selectNodeContents(heading); range.collapse(true);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  })()`);
  window.webContents.focus();
  await evaluate('new Promise(resolve => requestAnimationFrame(resolve))');
  if (source) {
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers: ['control'] });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers: ['control'] });
  } else {
    // beforeinput is the rich editor's history route; hidden windows cannot dispatch native edit commands reliably.
    await evaluate(`document.querySelector('.mdxeditor-root-contenteditable [contenteditable="true"]').dispatchEvent(new InputEvent('beforeinput', { inputType: ${JSON.stringify(keyCode === 'Z' ? 'historyUndo' : 'historyRedo')}, bubbles: true, cancelable: true }))`);
  }
}
const body = markdown => markdown.replace(/^---[^\n]*\n[\s\S]*?\n---[^\n]*(?:\n|$)/, '');
const metadata = markdown => parse(markdown.split(/^---\s*$/m)[1]);
async function screenshot(name) {
  if (!process.env.NEXUS_PROPERTIES_SCREENSHOTS) return;
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const directory = path.resolve(process.env.NEXUS_PROPERTIES_SCREENSHOTS);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, `${name}.png`), (await window.webContents.capturePage()).toPNG());
}
app.whenReady().then(async () => {
  fixture = await fs.mkdtemp(path.join(app.getPath('temp'), 'nexus-properties-smoke-'));
  const filePath = path.join(fixture, 'systems.md');
  const original = '---\n# Workspace metadata\ntitle: Original\ntype: System\ntags: [existing]\nstatus: Draft\nowner: Operations\nreview_date: 2026-12-31\ncustom: { nested: [true, 17] } # Preserve this\n---\n\n# Finance system\n\nA reference document with **formatting**, [a related document](./runbook.md), and `literal code`.\n\n```yaml\nstatus: body content\n```\n';
  await fs.writeFile(filePath, original);
  openResult = { canceled: false, filePath, markdown: original };
  const trusted = new Map(), rendererIpc = createRendererIpc(ipcMain, trusted);
  const responses = {
    'app:get-version': 'smoke', 'app:get-profile-name': 'properties-smoke', 'file:get-initial-open-file': openResult,
    'recent:list': [], 'quickconnect:get-token': '', 'mcp:get-bearer-token': '', 'mcp:configure': {}, 'window:is-maximized': false,
    'file:watch': {}, 'file:unwatch': {}, 'diagram:read-svg': null, 'ai:release-conversation': {}, 'ai:load-chat-history': { ok: true },
    'ai:delete-chat-history': { ok: true }, 'ai:save-chat-history': { ok: true }, 'dialog:confirmSaveChanges': 'discard'
  };
  for (const [channel, result] of Object.entries(responses)) rendererIpc.handle(channel, () => result);
  rendererIpc.handle('file:open', () => openResult);
  rendererIpc.handle('file:save', async (_event, payload) => { saves++; await fs.writeFile(payload.filePath, payload.markdown); return { filePath: payload.filePath }; });
  rendererIpc.handle('image:resolve-preview', (_event, payload) => payload.imageSource);
  rendererIpc.on('mcp:update-window-state', (_event, next) => { state = next; });
  window = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: {
    preload: path.join(__dirname, '..', 'electron', 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false,
    backgroundThrottling: false, partition: `properties-smoke-${Date.now()}`
  } });
  const url = pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href;
  trusted.set(window.webContents, url);
  window.webContents.on('console-message', event => { if (event.level === 'error') console.error(event.message); });
  await window.loadURL(url);
  await until(() => state?.filePath === filePath && state.markdown.includes('Finance system') && !state.dirty);
  const baseline = state.markdown;
  await properties(); await fill('Title', 'Discard this draft'); await click('Cancel'); await wait(`${dialog} === null`);
  assert.equal(state.markdown, baseline); assert.equal(saves, 0);
  window.webContents.send('menu:action', 'documentProperties'); await wait(`${dialog} !== null`);
  await fill('Title', 'Finance: system # reference'); await fill('Type', 'Internal service'); await fill('Status', 'Approved');
  await fill('Owner', 'Finance operations'); await fill('Tags', 'finance\noperations, team'); await fill('Review date', '2026-02-29');
  await click('Apply'); await wait("document.querySelector('.nexus-document-properties-dialog [role=alert]')?.textContent.includes('calendar date')");
  window.setBounds({ width: 480, height: 580 });
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const smallLayout = await evaluate(`(() => {
    const dialog = document.querySelector('.nexus-document-properties-dialog').getBoundingClientRect();
    const footer = document.querySelector('.nexus-document-properties-dialog .nexus-dialog-footer').getBoundingClientRect();
    const form = document.querySelector('#document-properties');
    form.scrollTop = form.scrollHeight;
    return { dialogBottom: dialog.bottom, footerBottom: footer.bottom, viewport: innerHeight, scrolls: form.scrollHeight > form.clientHeight };
  })()`);
  assert(smallLayout.dialogBottom <= smallLayout.viewport && smallLayout.footerBottom <= smallLayout.viewport && smallLayout.scrolls, JSON.stringify(smallLayout));
  await screenshot('document-properties-small');
  window.setBounds({ width: 1280, height: 900 });
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  await evaluate("document.querySelector('#document-properties').scrollTop = 0");
  assert.equal(state.markdown, baseline); await fill('Review date', '2028-02-29'); await screenshot('document-properties-rich');
  await click('Apply'); await wait(`${dialog} === null`); await until(() => state.dirty && metadata(state.markdown).title === 'Finance: system # reference');
  const richApplied = state.markdown;
  assert.equal(body(richApplied), body(baseline));
  assert.deepEqual(metadata(richApplied), { title: 'Finance: system # reference', type: 'Internal service', status: 'Approved', owner: 'Finance operations', tags: ['finance', 'operations, team'], review_date: '2028-02-29', custom: { nested: [true, 17] } });
  assert(richApplied.includes('# Preserve this')); assert.equal(await fs.readFile(filePath, 'utf8'), original); assert.equal(saves, 0);
  await undoRedo('Z'); await until(() => state.markdown === baseline && !state.dirty);
  await undoRedo('Y'); await until(() => state.markdown === richApplied && state.dirty);
  window.webContents.send('menu:action', 'save'); await until(() => saves === 1 && !state.dirty);
  assert.equal(await fs.readFile(filePath, 'utf8'), richApplied);
  await click('Switch to Source'); await wait("!!document.querySelector('.mdxeditor-source-editor .cm-content')");
  const sourceBaseline = state.markdown;
  await properties(); await fill('Title', 'Source title'); await fill('Owner', ''); await fill('Tags', ''); await click('Apply');
  await until(() => metadata(state.markdown).title === 'Source title'); const sourceApplied = state.markdown;
  assert.equal(body(sourceApplied), body(sourceBaseline)); assert.equal(metadata(sourceApplied).owner, undefined); assert.equal(metadata(sourceApplied).tags, undefined);
  assert(sourceApplied.includes('custom: { nested: [true, 17] } # Preserve this'));
  await undoRedo('Z', true); await until(() => state.markdown === sourceBaseline && !state.dirty);
  await undoRedo('Y', true); await until(() => state.markdown === sourceApplied && state.dirty);
  await properties(); await click('Apply'); await wait(`${dialog} === null`); assert.equal(state.markdown, sourceApplied);
  await properties(); await fill('Title', 'Stale title');
  window.webContents.send('menu:action', 'new'); await until(() => !state.filePath && !state.markdown.trim());
  await click('Apply'); await wait("document.querySelector('.nexus-document-properties-dialog [role=alert]')?.textContent.includes('document changed')");
  assert.equal(state.markdown.trim(), ''); assert.equal(saves, 1); await click('Cancel');
  await properties(); await fill('Title', 'Untitled document'); await fill('Tags', 'new\nreference'); await click('Apply');
  await until(() => state.dirty && metadata(state.markdown).title === 'Untitled document'); assert.equal(saves, 1);
  openResult = { canceled: false, filePath, markdown: await fs.readFile(filePath, 'utf8') };
  window.webContents.send('menu:action', 'open'); await until(() => state.filePath === filePath && !state.dirty);
  await properties();
  assert(await evaluate("[...document.querySelectorAll('#document-properties label')].find(node => node.firstChild.textContent === 'Title').querySelector('input').value === 'Finance: system # reference'"));
  await screenshot('document-properties-source'); await click('Cancel');
  await click('Switch to Diff'); await wait("!!document.querySelector('.nexus-change-review')");
  assert(await evaluate("document.querySelector('[aria-label=\"Document properties\"]').disabled"));
  window.webContents.send('menu:action', 'documentProperties');
  await evaluate('new Promise(resolve => requestAnimationFrame(resolve))');
  assert(await evaluate(`${dialog} === null`));
  await click('Switch to Source'); await wait("!!document.querySelector('.mdxeditor-source-editor .cm-content')");
  openResult = { canceled: false, filePath: path.join(fixture, 'reference.ts'), markdown: "const title = 'Literal code';\n" };
  window.webContents.send('menu:action', 'open'); await until(() => state.filePath === openResult.filePath);
  assert(await evaluate("document.querySelector('[aria-label=\"Document properties\"]').disabled"));
  window.webContents.send('menu:action', 'documentProperties'); await evaluate('new Promise(resolve => requestAnimationFrame(resolve))');
  assert(await evaluate(`${dialog} === null`)); assert.equal(state.markdown, openResult.markdown);
  // Invalid YAML typed in source must be rejected by the form without touching the source buffer.
  openResult = { canceled: false, filePath, markdown: await fs.readFile(filePath, 'utf8') };
  window.webContents.send('menu:action', 'open'); await until(() => state.filePath === openResult.filePath);
  if (!await evaluate("!!document.querySelector('.mdxeditor-source-editor .cm-content')")) await click('Switch to Source');
  await wait("!!document.querySelector('.mdxeditor-source-editor .cm-content')");
  await evaluate("document.querySelector('.mdxeditor-source-editor .cm-content').focus()");
  window.webContents.selectAll();
  await evaluate('new Promise(resolve => requestAnimationFrame(resolve))');
  window.webContents.insertText('---\ntags: [broken\n---\n\n# Body\n');
  await until(() => state.markdown.includes('tags: [broken'));
  const broken = state.markdown;
  await properties(); await wait("document.querySelector('.nexus-document-properties-dialog [role=alert]')?.textContent.includes('Invalid YAML')");
  assert(await evaluate("document.querySelector('#document-properties') === null"));
  assert.equal(state.markdown, broken); assert.equal(saves, 1); await click('Close'); await wait(`${dialog} === null`);
  console.log('Document properties smoke passed: six fields, custom values, cancellation, calendar validation, small-window layout, body/metadata preservation, rich/source undo and redo, unsaved apply, normal save, stale form rejection, untitled creation, saved reopening, invalid YAML protection, and code/text/diff restrictions.');
}).catch(error => { console.error(error); exitCode = 1; }).finally(async () => {
  clearTimeout(deadline); if (window && !window.isDestroyed()) window.destroy();
  if (fixture) {
    assert.equal(path.dirname(fixture), path.resolve(app.getPath('temp'))); assert.match(path.basename(fixture), /^nexus-properties-smoke-/);
    await fs.rm(fixture, { recursive: true, force: true });
  }
  app.exit(exitCode);
});
