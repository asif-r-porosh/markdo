'use strict';
/* View menu: four layouts (vertical split, horizontal split, editor only, preview only),
   the Ctrl/Cmd+] and [ cycle keys, persistence, and printing from every layout. */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');

let env;
test.before(async function () { env = await H.setup(); });
test.after(async function () { await env.close(); });

const NAMES = { v: 'Vertical split', h: 'Horizontal split', e: 'Editor only', p: 'Preview only' };
const layoutOf = function (page) { return page.evaluate(function () { return document.body.getAttribute('data-split'); }); };
async function pick(page, k) { await page.click('#mbViewBtn'); await page.click('#layout-' + k); }
const panes = function (page) {
  return page.evaluate(function () {
    const box = function (sel) {
      const el = document.querySelector(sel);
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { shown: cs.visibility === 'visible' && cs.display !== 'none' && r.width > 0, w: Math.round(r.width) };
    };
    return { editor: box('#editorPane'), preview: box('#previewPane'), splitter: box('#splitter'), main: Math.round(document.querySelector('#main').getBoundingClientRect().width) };
  });
};
const PDF_SKIP = process.env.BROWSER && process.env.BROWSER !== 'chromium' ? 'page.pdf exists only in Chromium' : false;

test('v1. View menu lists the four layouts, ticks the current one, and the status bar has no split button', async function () {
  const { page } = await H.openApp(env);
  assert.equal(await page.locator('#splitBtn').count(), 0);
  assert.equal(await layoutOf(page), 'v');
  await page.click('#mbViewBtn');
  const rows = await page.evaluate(function () {
    return Array.from(document.querySelectorAll('#mbViewMenu .dd-opt')).map(function (b) {
      const hint = b.querySelector('.dd-hint');
      return { text: b.querySelector('.dd-face').textContent, hint: hint ? hint.textContent : '', checked: b.getAttribute('aria-checked') };
    });
  });
  assert.deepEqual(rows.map(function (r) { return r.text; }),
    ['Vertical split', 'Horizontal split', 'Editor only', 'Preview only', 'Next layout', 'Previous layout']);
  assert.deepEqual(rows.slice(4).map(function (r) { return r.hint; }), ['Ctrl/Cmd+]', 'Ctrl/Cmd+[']);
  assert.deepEqual(rows.slice(0, 4).map(function (r) { return r.checked; }), ['true', 'false', 'false', 'false']);
  assert.deepEqual(page.errors, []);
});

test('v2. each layout shows the right panes', async function () {
  const { page } = await H.openApp(env);
  let p = await panes(page);
  assert.ok(p.editor.shown && p.preview.shown && p.splitter.shown, 'vertical split shows both panes and the splitter');
  assert.ok(p.editor.w < p.main && p.preview.w < p.main, 'side by side');
  await pick(page, 'h');
  p = await panes(page);
  assert.equal(await layoutOf(page), 'h');
  assert.ok(p.editor.shown && p.preview.shown && p.splitter.shown);
  assert.ok(Math.abs(p.editor.w - p.main) < 2 && Math.abs(p.preview.w - p.main) < 2, 'stacked: each pane is full width');
  await pick(page, 'e');
  p = await panes(page);
  assert.ok(p.editor.shown && !p.preview.shown && !p.splitter.shown, 'editor only');
  assert.ok(Math.abs(p.editor.w - p.main) < 2, 'the editor takes the whole row');
  await pick(page, 'p');
  p = await panes(page);
  assert.ok(!p.editor.shown && p.preview.shown && !p.splitter.shown, 'preview only');
  assert.ok(Math.abs(p.preview.w - p.main) < 2, 'the preview takes the whole row');
  await pick(page, 'v');
  p = await panes(page);
  assert.ok(p.editor.shown && p.preview.shown && p.splitter.shown, 'back to the vertical split');
});

test('v3. a dragged splitter does not leave a single pane narrow', async function () {
  const { page } = await H.openApp(env);
  await page.evaluate(function () { document.querySelector('#editorPane').style.flexBasis = '20%'; document.querySelector('#previewPane').style.flexBasis = '80%'; });
  await pick(page, 'e');
  const p = await panes(page);
  assert.ok(Math.abs(p.editor.w - p.main) < 2, 'editor only fills the row after a splitter drag');
  await pick(page, 'p');
  assert.ok(Math.abs((await panes(page)).preview.w - p.main) < 2, 'preview only fills the row after a splitter drag');
});

test('v4. Ctrl+] cycles forward and Ctrl+[ backward, wrapping, from the editor and from the page', async function () {
  const { page } = await H.openApp(env);
  await page.click('#editor');
  const seen = [];
  for (let i = 0; i < 4; i++) { await page.keyboard.press('Control+BracketRight'); seen.push(await layoutOf(page)); }
  assert.deepEqual(seen, ['h', 'e', 'p', 'v']);
  const back = [];
  for (let i = 0; i < 4; i++) { await page.keyboard.press('Control+BracketLeft'); back.push(await layoutOf(page)); }
  assert.deepEqual(back, ['p', 'e', 'h', 'v']);
  await page.keyboard.press('Meta+BracketRight');
  assert.equal(await layoutOf(page), 'h', 'Cmd works the same');
  await page.keyboard.press('Control+Shift+BracketRight');
  assert.equal(await layoutOf(page), 'h', 'with Shift it is left alone');
  await page.keyboard.press('Control+Alt+BracketRight');
  assert.equal(await layoutOf(page), 'h', 'with Alt (AltGr) it is left alone');
  assert.deepEqual(page.errors, []);
});

test('v5. the layout is remembered across a reload but never saved inside the file', async function () {
  const { page } = await H.openApp(env);
  await H.setDoc(page, '# Zen\n\nbody\n');         /* typing needs the editor, so before preview only */
  await pick(page, 'p');
  await page.reload();
  await H.waitBooted(page);
  assert.equal(await layoutOf(page), 'p');
  assert.ok((await panes(page)).preview.shown);
  const dl = await H.pressAndDownload(page, function () { return page.keyboard.press('Control+s'); });
  const text = require('node:fs').readFileSync(await dl.path(), 'utf8');
  assert.equal(/"split"/.test(text), false, 'split must not be in the saved file');
});

test('v6. File > New leaves the layout alone', async function () {
  const { page } = await H.openApp(env);
  await pick(page, 'e');
  await H.setDoc(page, 'x\n');
  await page.click('#mbFileBtn');
  await page.locator('#mbFileMenu').getByText('New', { exact: true }).click();
  await page.click('#closeDiscard');
  assert.equal(await layoutOf(page), 'e');
});

test('v7. pagination is the same while the preview is hidden', async function () {
  const { page } = await H.openApp(env);
  let md = '';
  for (let i = 0; i < 30; i++) { md += 'Paragraph ' + i + '. ' + H.LOREM.repeat(2) + '\n\n'; }
  await H.setDoc(page, md);
  const inSplit = await H.previewPageCount(page);
  assert.ok(inSplit > 2, 'scenario: more than two pages');
  await pick(page, 'e');
  await H.setDoc(page, md + 'tail\n');
  await H.setDoc(page, md);
  assert.equal(await H.previewPageCount(page), inSplit, 'editor only paginates like the split view');
  await pick(page, 'v');
  assert.equal(await H.previewPageCount(page), inSplit);
});

test('v8. every layout exports a PDF with the preview page count (editor only and preview only too)', { skip: PDF_SKIP }, async function () {
  const { page } = await H.openApp(env);
  let md = '';
  for (let i = 0; i < 30; i++) { md += 'Paragraph ' + i + '. ' + H.LOREM.repeat(2) + '\n\n'; }
  await H.setDoc(page, md);
  const n = await H.previewPageCount(page);
  for (const k of ['v', 'h', 'e', 'p']) {
    await pick(page, k);
    assert.equal(await H.pdfPageCount(page), n, NAMES[k] + ': PDF page count');
  }
});

test('v9. scrolling sync still lines up after a round trip through the single-pane layouts', async function () {
  const { page } = await H.openApp(env);
  let md = '';
  for (let i = 0; i < 40; i++) { md += '## Part ' + i + '\n\n' + H.LOREM.repeat(2) + '\n\n'; }
  await H.setDoc(page, md);
  await pick(page, 'p');
  await pick(page, 'e');
  await pick(page, 'v');
  await page.waitForTimeout(400);
  await page.evaluate(function () { const e = document.querySelector('#editor'); e.scrollTop = e.scrollHeight / 2; e.dispatchEvent(new Event('scroll')); });
  await page.waitForTimeout(400);
  const v = await page.evaluate(function () { return document.querySelector('#viewport').scrollTop; });
  assert.ok(v > 100, 'the preview followed the editor (scrollTop ' + v + ')');
  assert.deepEqual(page.errors, []);
});
