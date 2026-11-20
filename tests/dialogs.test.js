'use strict';
/* Header/footer dialog and menu keyboard use: probes written against what a
   user expects; failures found here became fixes. */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');

let env;
test.before(async function () { env = await H.setup(); });
test.after(async function () { await env.close(); });
async function app() { return (await H.openApp(env)).page; }

async function openHf(page) {
  await page.click('#mbSetupBtn');
  await page.locator('#mbSetupMenu').getByText('Header/Footer', { exact: true }).click();
  await page.waitForFunction(function () { return !document.querySelector('#hfDialog').hidden; });
}
const rowOn = function (page, k) { return page.locator('#hfRows .hf-row[data-k="' + k + '"] .hf-on'); };
const running = function (page) {
  return page.evaluate(function () {
    return Array.from(document.querySelectorAll('#pages .page')).map(function (p) {
      return Array.from(p.querySelectorAll('.rhf')).map(function (d) { return d.className.replace('rhf rhf-', '') + '=' + d.textContent; });
    });
  });
};
const threePages = function () { return ('para ' + H.LOREM.repeat(8) + '\n\n').repeat(6) + '<!--pagebreak-->\n\nlast page\n'; };

test('hf1. the dialog lists the six rows and Ok applies running text to every page', async function () {
  const page = await app();
  await H.setDoc(page, threePages());
  await openHf(page);
  assert.equal(await page.locator('#hfRows .hf-row').count(), 6);
  await rowOn(page, 't1').check();
  await page.fill('#hfRows .hf-row[data-k="t1"] .hf-text', 'Quarterly report');
  await page.click('#hfOk');
  assert.equal(await page.isHidden('#hfDialog'), true);
  const r = await running(page);
  assert.ok(r.length >= 2);
  r.forEach(function (p) { assert.ok(p.some(function (x) { return /=Quarterly report$/.test(x); }), JSON.stringify(p)); });
  assert.match(await page.textContent('#statLeft'), /unsaved changes/);
});

test('hf2. Cancel and Esc discard every edit', async function () {
  const page = await app();
  await H.setDoc(page, threePages());
  await openHf(page);
  await rowOn(page, 't1').check();
  await page.fill('#hfRows .hf-row[data-k="t1"] .hf-text', 'discard me');
  await page.click('#hfCancel');
  await openHf(page);
  assert.equal(await rowOn(page, 't1').isChecked(), false);
  await rowOn(page, 't1').check();
  await page.keyboard.press('Escape');
  assert.equal(await page.isHidden('#hfDialog'), true);
  await openHf(page);
  assert.equal(await rowOn(page, 't1').isChecked(), false);
  assert.deepEqual((await running(page)).filter(function (p) { return p.length; }), []);
});

test('hf3. at most four options run: when all corners are taken the next row cannot be enabled', async function () {
  const page = await app();
  await openHf(page);
  await rowOn(page, 'pg').check();
  for (const k of ['t1', 't2', 't3']) { await rowOn(page, k).check(); }
  assert.equal(await rowOn(page, 't4').isDisabled(), true, 'fifth option must be blocked');
  const pos = await page.evaluate(function () {
    return Array.from(document.querySelectorAll('#hfRows .hf-row')).filter(function (r) { const c = r.querySelector('.hf-on'); return c && c.checked; })
      .map(function (r) { return r.querySelector('.hf-side').value + r.querySelector('.hf-al').value; }).sort();
  });
  assert.deepEqual(pos, ['FL', 'FR', 'HL', 'HR'], 'each enabled row owns a different corner');
});

test('hf4. focus stays inside the open dialog when Tab is pressed, and returns to the page after closing', async function () {
  const page = await app();
  await openHf(page);
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press(i % 2 ? 'Tab' : 'Shift+Tab');
    const inside = await page.evaluate(function () { return !!document.activeElement.closest('#hfDialog'); });
    assert.equal(inside, true, 'focus escaped the dialog after ' + (i + 1) + ' key presses');
  }
  await page.keyboard.press('Escape');
  const where = await page.evaluate(function () { const a = document.activeElement; return a ? (a.id || a.tagName) : 'none'; });
  assert.notEqual(where, 'BODY', 'focus must not be lost to the page body after closing');
});

test('hf5. running text is plain text: HTML in it never executes and shows literally', async function () {
  const page = await app();
  await openHf(page);
  await rowOn(page, 't1').check();
  await page.fill('#hfRows .hf-row[data-k="t1"] .hf-text', '<img src=x onerror="window.__xss=1"><b>x</b>');
  await page.click('#hfOk');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(function () { return window.__xss || 0; }), 0);
  assert.match((await running(page))[0].join('|'), /<b>x<\/b>/);
});

test('hf6. page-number offset: earlier pages unnumbered; an offset beyond the last page numbers nothing', async function () {
  const page = await app();
  await H.setDoc(page, threePages());
  const n = await H.previewPageCount(page);
  assert.ok(n >= 3);
  await openHf(page);
  await rowOn(page, 'pg').check();
  await page.fill('#hfRows .hf-row[data-k="pg"] .hf-off', '2');
  await page.click('#hfOk');
  let r = await running(page);
  assert.deepEqual(r[0], [], 'page 1 unnumbered');
  assert.match(r[1][0], new RegExp('=1/' + (n - 1) + '$'));
  await openHf(page);
  await page.fill('#hfRows .hf-row[data-k="pg"] .hf-off', '99');
  await page.click('#hfOk');
  r = await running(page);
  assert.deepEqual(r.filter(function (p) { return p.length; }), [], 'offset past the end: no numbers at all');
});

test('hf7. header/footer settings survive save and reopen', async function () {
  const page = await app();
  await H.setDoc(page, 'one page\n');
  await openHf(page);
  await rowOn(page, 't2').check();
  await page.fill('#hfRows .hf-row[data-k="t2"] .hf-text', 'Footer note');
  await page.click('#hfOk');
  const dl = await H.pressAndDownload(page, function () { return page.keyboard.press('Control+s'); });
  const text = require('node:fs').readFileSync(await dl.path(), 'utf8');
  await H.setDoc(page, 'other\n');
  await page.setInputFiles('#fileInput', { name: 'hf.md', mimeType: 'text/markdown', buffer: Buffer.from(text) });
  await page.waitForFunction(function () { return document.querySelector('#editor').value.indexOf('one page') === 0; });
  assert.match((await running(page))[0].join('|'), /=Footer note/);
});

test('hf8. the offset tooltip is honest about DOCX', async function () {
  const page = await app();
  await openHf(page);
  const tip = await page.getAttribute('#hfRows .hf-off', 'title');
  assert.match(tip, /DOCX/);
  assert.match(tip, /preview and PDF/);
});
