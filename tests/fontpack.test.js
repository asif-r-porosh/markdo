'use strict';
/* Offline font pack: the page downloads every bundled font once into its own
   cache, shows a chip while doing so, repairs an evicted cache and drops
   fonts that are no longer shipped. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('./helpers');

const ROOT = path.join(__dirname, '..');
const NFILES = new Set(Array.from(fs.readFileSync(path.join(ROOT, 'css/fonts.css'), 'utf8')
  .matchAll(/url\('\.\.\/fonts\/([^']+)'\)/g)).map(function (m) { return m[1]; })).size;
let env;
test.before(async function () { env = await H.setup(); });
test.after(async function () { await env.close(); });

const packDone = function (page) {
  return page.waitForFunction(function () { return window.__fontPack === 'complete'; }, null, { timeout: 60000 });
};
const cached = function (page) {
  return page.evaluate(async function () {
    const c = await caches.open('mdpdf-fonts-v1');
    return (await c.keys()).map(function (r) { return new URL(r.url).pathname; });
  });
};

test('first visit: chip shows progress, every font lands in the font cache, chip hides', async function () {
  const { page } = await H.openApp(env);
  await packDone(page);
  assert.equal(await page.evaluate(function () { return window.__fontPackShown === true; }), true, 'chip should have been shown');
  assert.equal(await page.isHidden('#fontChip'), true, 'chip hides when done');
  const keys = await cached(page);
  assert.equal(keys.length, NFILES);
  assert.ok(keys.every(function (k) { return k.indexOf('/fonts/') === 0 && /\.woff2$/.test(k); }));
  assert.deepEqual(page.errors, []);
});

test('second visit with a full cache: no chip, no downloads', async function () {
  const { page } = await H.openApp(env);
  await packDone(page);
  await page.evaluate(function () { window.__fontPackShown = false; });
  await page.reload();
  await H.waitBooted(page);
  await packDone(page);
  assert.equal(await page.evaluate(function () { return window.__fontPackShown === true; }), false, 'nothing to download, chip stays hidden');
});

test('evicted or stale cache entries are repaired / removed', async function () {
  const { page } = await H.openApp(env);
  await packDone(page);
  const gone = await page.evaluate(async function () {
    const c = await caches.open('mdpdf-fonts-v1');
    const keys = await c.keys();
    await c.delete(keys[0]); await c.delete(keys[1]);
    await c.put('/fonts/not-shipped-any-more.woff2', new Response('x'));
    return 2;
  });
  assert.equal(gone, 2);
  await page.reload();
  await H.waitBooted(page);
  await packDone(page);
  const keys = await cached(page);
  assert.equal(keys.length, NFILES, 'missing files re-downloaded, stale entry dropped');
  assert.equal(keys.indexOf('/fonts/not-shipped-any-more.woff2'), -1);
  assert.equal(await page.evaluate(function () { return window.__fontPackShown === true; }), true, 'chip reappears when files had to be fetched again');
});

test('service worker and font pack use the same cache name; sw keeps the font cache on activate', function () {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const pack = fs.readFileSync(path.join(ROOT, 'js/fontpack.js'), 'utf8');
  const a = sw.match(/var FONT_CACHE = '([^']+)'/)[1];
  const b = pack.match(/export var FONT_CACHE = '([^']+)'/)[1];
  assert.equal(a, b);
  assert.match(sw, /k !== CACHE && k !== FONT_CACHE/);
});

test('sw.js shell list: every file exists and every js module is listed (install is all-or-nothing)', function () {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const shell = Array.from(sw.matchAll(/^  '\.\/([^']+)',/gm)).map(function (m) { return m[1]; });
  assert.deepEqual(shell.filter(function (f) { return !fs.existsSync(path.join(ROOT, f)); }), [], 'listed but missing');
  const js = fs.readdirSync(path.join(ROOT, 'js')).map(function (f) { return 'js/' + f; });
  assert.deepEqual(js.filter(function (f) { return shell.indexOf(f) < 0; }), [], 'js modules missing from the shell list');
});
