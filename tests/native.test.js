'use strict';
/* Desktop app shim (js/native.js): with a fake window.__TAURI__ the browser file pickers are replaced by
   native dialogs. The fake records every dialog call and every file write. */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');

let env;
test.before(async function () { env = await H.setup(); });
test.after(async function () { await env.close(); });

async function openNative(files) {
  const ctx = await env.browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', function (e) { page.errors.push(String(e)); });
  await page.addInitScript(function (seed) {
    window.__calls = []; window.__written = {}; window.__files = seed;
    window.__openPath = null; window.__savePath = null;
    window.__TAURI__ = {
      dialog: {
        open: function (o) { window.__calls.push(['open', o]); return Promise.resolve(window.__openPath); },
        save: function (o) { window.__calls.push(['save', o]); return Promise.resolve(window.__savePath); }
      },
      fs: {
        readFile: function (p) { return Promise.resolve(new TextEncoder().encode(window.__files[p])); },
        writeFile: function (p, bytes) { window.__written[p] = { text: new TextDecoder('latin1').decode(bytes), size: bytes.length }; return Promise.resolve(); }
      }
    };
  }, files || {});
  await page.goto(env.url);
  await H.waitBooted(page);
  return page;
}

test('n1. native shim: Open reads the chosen path, filters come from the accept types', async function () {
  const page = await openNative({ '/tmp/a.md': '# Native Hello\n\nbody text' });
  await page.evaluate(function () { window.__openPath = '/tmp/a.md'; });
  await page.keyboard.press('Control+o');
  await page.waitForFunction(function () { return document.querySelector('#editor').value.indexOf('Native Hello') >= 0; });
  const call = await page.evaluate(function () { return window.__calls[0]; });
  assert.equal(call[0], 'open');
  assert.deepEqual(call[1].filters, [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }]);
  assert.deepEqual(page.errors, []);
});

test('n2. native shim: Save writes back to the opened path with no download and no second dialog', async function () {
  const page = await openNative({ '/tmp/a.md': '# Native Hello\n\nbody text' });
  await page.evaluate(function () { window.__openPath = '/tmp/a.md'; });
  await page.keyboard.press('Control+o');
  await page.waitForFunction(function () { return document.querySelector('#editor').value.indexOf('Native Hello') >= 0; });
  await page.fill('#editor', '# Native Hello\n\nedited line');
  await page.click('#saveBtn');
  await page.waitForFunction(function () { return !!window.__written['/tmp/a.md']; });
  const w = await page.evaluate(function () { return { text: window.__written['/tmp/a.md'].text, saves: window.__calls.filter(function (c) { return c[0] === 'save'; }).length }; });
  assert.match(w.text, /edited line/);
  assert.equal(w.saves, 0);
});

test('n3. native shim: Save of an unsaved document asks for a path (suggested .md name) and writes it', async function () {
  const page = await openNative();
  await page.fill('#editor', '# Fresh Doc\n\ntext');
  await page.evaluate(function () { window.__savePath = '/tmp/fresh.md'; });
  await page.click('#saveBtn');
  await page.waitForFunction(function () { return !!window.__written['/tmp/fresh.md']; });
  const r = await page.evaluate(function () { return { call: window.__calls.filter(function (c) { return c[0] === 'save'; })[0], text: window.__written['/tmp/fresh.md'].text }; });
  assert.match(r.call[1].defaultPath, /\.md$/);
  assert.deepEqual(r.call[1].filters[0].extensions, ['md', 'markdown', 'txt']);
  assert.match(r.text, /# Fresh Doc/);
});

test('n4. native shim: cancelling a dialog changes nothing and raises no error', async function () {
  const page = await openNative();
  const before = await page.inputValue('#editor');
  await page.keyboard.press('Control+o');          /* __openPath stays null: the user cancelled */
  await page.waitForFunction(function () { return window.__calls.length === 1; });
  await page.waitForTimeout(200);
  assert.equal(await page.inputValue('#editor'), before);
  await page.fill('#editor', '# Cancel Save');
  await page.click('#saveBtn');                    /* __savePath is null: cancelled save */
  await page.waitForFunction(function () { return window.__calls.length === 2; });
  assert.equal(await page.evaluate(function () { return Object.keys(window.__written).length; }), 0);
  assert.deepEqual(page.errors, []);
});

test('n5. native shim: DOCX export goes through the save dialog and writes a zip file', async function () {
  const page = await openNative();
  await page.fill('#editor', '# Docx Title\n\nsome text');
  await page.evaluate(function () { window.__savePath = '/tmp/out.docx'; });
  await page.click('#mbExportBtn');
  await page.click('#docxBtn');
  await page.waitForFunction(function () { return !!window.__written['/tmp/out.docx']; }, null, { timeout: 15000 });
  const r = await page.evaluate(function () { return { call: window.__calls.filter(function (c) { return c[0] === 'save'; })[0], w: window.__written['/tmp/out.docx'] }; });
  assert.match(r.call[1].defaultPath, /\.docx$/);
  assert.equal(r.call[1].filters[0].extensions[0], 'docx');
  assert.equal(r.w.text.slice(0, 2), 'PK');
  assert.ok(r.w.size > 1000);
});

test('n6. in a normal browser the pickers are left alone', async function () {
  const { page } = await H.openApp(env);
  assert.equal(await page.evaluate(function () { return typeof window.__TAURI__; }), 'undefined');
});
