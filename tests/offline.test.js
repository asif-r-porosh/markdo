'use strict';
/* Service worker + offline: the app shell installs completely, the app boots
   with the network off (fonts included), and an update never reloads over a
   document with unsaved changes. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('./helpers');

const ROOT = path.join(__dirname, '..');
let env;
test.before(async function () { env = await H.setup(); });
test.after(async function () { await env.close(); });

/* open the app, let the service worker take control and the font pack finish */
async function controlled() {
  const t = await H.openApp(env);
  await t.page.evaluate(function () { return navigator.serviceWorker.ready; });
  await t.page.waitForFunction(function () { return window.__fontPack === 'complete'; }, null, { timeout: 60000 });
  await t.page.reload();
  await H.waitBooted(t.page);
  await t.page.waitForFunction(function () { return !!navigator.serviceWorker.controller; });
  return t;
}

test('shell cache holds every file listed in sw.js', async function () {
  const { page } = await controlled();
  const have = await page.evaluate(async function () {
    const names = (await caches.keys()).filter(function (k) { return /^mdpdf-v\d+$/.test(k); });
    const c = await caches.open(names[0]);
    return { names: names, keys: (await c.keys()).map(function (r) { return new URL(r.url).pathname; }) };
  });
  assert.equal(have.names.length, 1, 'one shell cache');
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const want = Array.from(sw.matchAll(/^  '\.\/([^']*)',/gm)).map(function (m) { return '/' + m[1]; });
  want.forEach(function (w) {
    const expect = w === '/' ? '/' : w;
    assert.ok(have.keys.indexOf(expect) >= 0, 'missing from cache: ' + w);
  });
});

test('boots offline with the network off, fonts come from the font cache', async function () {
  const { ctx, page } = await controlled();
  await ctx.setOffline(true);
  await page.reload();
  await H.waitBooted(page);
  const r = await page.evaluate(async function () {
    const faces = await document.fonts.load('italic 700 16px "Newsreader"', 'Aa');
    return { controlled: !!navigator.serviceWorker.controller, faces: faces.length, status: faces.map(function (f) { return f.status; }).join(), pages: document.querySelectorAll('#pages .page').length };
  });
  assert.equal(r.controlled, true);
  assert.ok(r.faces >= 1 && r.status.indexOf('error') < 0, 'font should load offline: ' + JSON.stringify(r));
  assert.ok(r.pages >= 1);
  assert.deepEqual(page.errors, []);
});

test('an update (controller change) does not reload over unsaved changes, but reloads a clean page', async function () {
  const { page } = await controlled();
  const fire = function () { return page.evaluate(function () { navigator.serviceWorker.dispatchEvent(new Event('controllerchange')); }); };
  await page.evaluate(function () { window.__marker = 1; });
  await H.setDoc(page, 'typed but not saved\n');
  await fire();
  await page.waitForTimeout(700);
  assert.equal(await page.evaluate(function () { return window.__marker; }), 1, 'dirty document: no reload');
  assert.equal(await page.inputValue('#editor'), 'typed but not saved\n');

  /* a clean page does reload */
  const { page: clean } = await controlled();
  await clean.evaluate(function () { window.__marker = 1; });
  await clean.evaluate(function () { navigator.serviceWorker.dispatchEvent(new Event('controllerchange')); });
  await clean.waitForFunction(function () { return window.__marker === undefined; }, null, { timeout: 10000 });
});
