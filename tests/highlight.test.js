'use strict';
/* Editor font and the minimal Markdown colouring (js/highlight.js). */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');

let env;
test.before(async function () { env = await H.setup(); });
test.after(async function () { await env.close(); });

const SAMPLE = [
  '# Title <b>&',
  '',
  'Plain **bold** and *it* with `code` and [a link](http://x.y).',
  '- item',
  '> quote',
  '| a | b |',
  '|---|---|',
  '```',
  '# not a heading',
  '```',
  '<!--pagebreak-->',
  '<!-- note -->',
  'বাংলা লেখা',
  ''
].join('\n');

const overlayText = function (page) {
  return page.evaluate(function () { return document.querySelector('#editorHl').textContent; });
};
const cls = function (page, c) {
  return page.evaluate(function (c) {
    return Array.from(document.querySelectorAll('#editorHl .hl-' + c)).map(function (e) { return e.textContent; });
  }, c);
};

test('hi1. the editor uses bundled Geist Mono', async function () {
  const { page } = await H.openApp(env);
  const r = await page.evaluate(async function () {
    await document.fonts.load('13.5px "Geist Mono"', 'abc');
    const ed = document.querySelector('#editor');
    return { fam: getComputedStyle(ed).fontFamily, ok: document.fonts.check('13.5px "Geist Mono"', 'abc') };
  });
  assert.match(r.fam, /Geist Mono/);
  assert.ok(r.ok, 'face loaded');
});

test('hi2. overlay text equals the editor value, HTML stays inert', async function () {
  const { page } = await H.openApp(env);
  await H.setDoc(page, SAMPLE);
  const t = await overlayText(page);
  assert.equal(t.replace(/ $/, ''), SAMPLE);
  const n = await page.evaluate(function () { return document.querySelectorAll('#editorHl b, #editorHl script').length; });
  assert.equal(n, 0, 'no live elements from document text');
});

test('hi3. token classes', async function () {
  const { page } = await H.openApp(env);
  await H.setDoc(page, SAMPLE);
  assert.deepEqual(await cls(page, 'head'), ['# Title <b>&']);
  assert.ok((await cls(page, 'code')).includes('`code`'));
  assert.ok((await cls(page, 'code')).includes('# not a heading'), 'fenced line is code, not a heading');
  assert.ok((await cls(page, 'link')).includes('[a link](http://x.y)'));
  assert.deepEqual(await cls(page, 'pb'), ['<!--pagebreak-->']);
  assert.deepEqual(await cls(page, 'cm'), ['<!-- note -->']);
  const mk = await cls(page, 'mk');
  assert.ok(mk.includes('- ') && mk.includes('> ') && mk.includes('|') && mk.includes('**'), 'markers dim: ' + JSON.stringify(mk));
});

test('hi4. typing updates the colouring immediately', async function () {
  const { page } = await H.openApp(env);
  await H.setDoc(page, 'hello');
  await page.click('#editor');
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\n## x');
  assert.deepEqual(await cls(page, 'head'), ['## x']);
});

test('hi5. line tops match the textarea, wrapped lines and Bangla included', async function () {
  const { page } = await H.openApp(env);
  const long = 'word '.repeat(80);
  const doc = '# ' + long + '\n\n' + long + ' বাংলা লেখা ' + long + '\n\n- ' + long + '\n';
  await H.setDoc(page, doc);
  const r = await page.evaluate(function () {
    const ed = document.querySelector('#editor');
    const hl = document.querySelector('#editorHl');
    return { eh: ed.scrollHeight, hh: hl.scrollHeight, on: document.querySelector('#editorPane').classList.contains('hl') };
  });
  assert.ok(r.on, 'overlay active');
  assert.ok(Math.abs(r.eh - r.hh) <= 2, 'heights ' + r.eh + ' vs ' + r.hh);
});

test('hi6. overlay follows the editor scroll', async function () {
  const { page } = await H.openApp(env);
  await H.setDoc(page, Array.from({ length: 300 }, function (_, i) { return 'line ' + i; }).join('\n'));
  await page.evaluate(function () { document.querySelector('#editor').scrollTop = 1234; });
  await page.waitForTimeout(80);
  const s = await page.evaluate(function () {
    return [document.querySelector('#editor').scrollTop, document.querySelector('#editorHl').scrollTop];
  });
  assert.equal(s[0], s[1]);
  assert.ok(s[0] > 0);
});

test('hi7. a huge document turns the overlay off and plain text shows', async function () {
  const { page } = await H.openApp(env);
  const errs = [];
  page.on('pageerror', function (e) { errs.push(String(e)); });
  await page.evaluate(function () {
    const ed = document.querySelector('#editor');
    ed.value = 'line of text\n'.repeat(31000);
    ed.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(100);
  const r = await page.evaluate(function () {
    return { on: document.querySelector('#editorPane').classList.contains('hl'), col: getComputedStyle(document.querySelector('#editor')).color };
  });
  assert.equal(r.on, false);
  assert.notEqual(r.col, 'rgba(0, 0, 0, 0)');
  assert.deepEqual(errs, []);
});

test('hi8. a height mismatch switches the overlay off by itself', async function () {
  const { page } = await H.openApp(env);
  await H.setDoc(page, Array.from({ length: 80 }, function (_, i) { return 'row ' + i; }).join('\n'));
  await page.addStyleTag({ content: '#editorHl{ padding-bottom: 80px !important; }' });
  await page.click('#editor');
  await page.keyboard.type('d');
  const on = await page.evaluate(function () { return document.querySelector('#editorPane').classList.contains('hl'); });
  assert.equal(on, false);
});

test('hi9. dark theme uses its own colours', async function () {
  const { page } = await H.openApp(env);
  await H.setDoc(page, '# T');
  const light = await page.evaluate(function () { return getComputedStyle(document.querySelector('#editorHl .hl-head')).color; });
  await page.evaluate(function () { document.documentElement.setAttribute('data-theme', 'dark'); });
  const dark = await page.evaluate(function () { return getComputedStyle(document.querySelector('#editorHl .hl-head')).color; });
  assert.notEqual(light, dark);
});
