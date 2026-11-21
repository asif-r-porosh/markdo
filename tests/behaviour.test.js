'use strict';
/* Characterization tests: what MarkDo does correctly today. These must stay
   green through the refactor (file split, font redesign, fixes). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const JSZip = require('jszip');
const H = require('./helpers');

let env;
test.before(async function () { env = await H.setup(); });
test.after(async function () { await env.close(); });

async function app() { return (await H.openApp(env)).page; }

test('boots with no script errors and renders the sample document', async function () {
  const page = await app();
  assert.ok((await H.previewPageCount(page)) >= 1);
  assert.match(await page.textContent('#statLeft'), /pages? · \d+ words?/);
  assert.deepEqual(page.errors, []);
});

test('PDF page count equals preview page count (sample and long mixed document)',
  { skip: process.env.BROWSER && process.env.BROWSER !== 'chromium' ? 'page.pdf exists only in Chromium' : false },
  async function () {
  const page = await app();
  assert.equal(await H.pdfPageCount(page), await H.previewPageCount(page));
  let md = '';
  for (let i = 0; i < 30; i++) {
    md += '## Section ' + i + '\n\n' + H.LOREM.repeat(5) + '\n\n- a\n- b\n  - nested\n- c\n\n' +
      '```js\nconst x' + i + ' = ' + i + ';\nconsole.log(x' + i + ');\n```\n\n' +
      '| k | v |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n\n> quote ' + i + '\n\n';
  }
  await H.setDoc(page, md);
  const preview = await H.previewPageCount(page);
  assert.ok(preview > 5, 'long document should span many pages');
  assert.equal(await H.pdfPageCount(page), preview);
});

test('PDF has no blank trailing page when the editor text is taller than the preview',
  { skip: process.env.BROWSER && process.env.BROWSER !== 'chromium' ? 'page.pdf exists only in Chromium' : false },
  async function () {
  /* The off-screen scroll-sync mirror holds every editor line, wrapped at the editor width.
     When it is taller than the printed pages it must not add pages of its own. */
  const page = await app();
  let md = '<!--settings:{"size":"A4","margin":"Normal","fontSize":"10pt","lineHeight":"1.25"}-->\n\n';
  for (let i = 0; i < 40; i++) { md += 'Paragraph ' + i + '. ' + H.LOREM.repeat(2) + '\n\n'; }
  await page.setInputFiles('#fileInput', { name: 'tall-editor.md', mimeType: 'text/markdown', buffer: Buffer.from(md) });
  await page.waitForFunction(function () { return window.__fontsRerendered === true && document.querySelectorAll('#pages .page').length > 0; });
  await page.evaluate(function () { return document.fonts.ready; });
  await page.waitForTimeout(500);
  const probe = await page.evaluate(function () {
    const m = document.querySelector('body > div[aria-hidden="true"][style*="-9999px"]');
    const pages = document.querySelectorAll('#pages .page');
    return { mirrorH: m ? m.getBoundingClientRect().height : 0, pagesH: pages.length * pages[0].offsetHeight, n: pages.length };
  });
  assert.ok(probe.mirrorH > probe.pagesH, 'scenario: the mirror (' + probe.mirrorH + 'px) must be taller than the pages (' + probe.pagesH + 'px)');
  assert.equal(await H.pdfPageCount(page), probe.n);
  /* the mirror must keep its layout in print media, or a measure during printing would break scroll sync */
  await page.emulateMedia({ media: 'print' });
  const laidOut = await page.evaluate(function () {
    const m = document.querySelector('body > div[aria-hidden="true"][style*="-9999px"]');
    return m.getClientRects().length > 0 && m.children[0].offsetHeight > 0;
  });
  await page.emulateMedia({ media: 'screen' });
  assert.equal(laidOut, true);
});

test('a pagebreak marker starts a new page', async function () {
  const page = await app();
  await H.setDoc(page, 'first\n\n<!--pagebreak-->\n\nsecond\n');
  assert.equal(await H.previewPageCount(page), 2);
  const second = await page.textContent('#pages .page:nth-child(2)');
  assert.match(second, /second/);
});

test('a long document renders within a generous time budget', async function () {
  const page = await app();
  const md = (H.LOREM.repeat(5) + '\n\n').repeat(300);
  const t0 = Date.now();
  await H.setDoc(page, md);
  assert.ok(Date.now() - t0 < 8000, 'render took ' + (Date.now() - t0) + ' ms');
  assert.ok((await H.previewPageCount(page)) > 40);
});

test('settings round-trip: save writes a settings comment, reopening restores it', async function () {
  const page = await app();
  const setSize = function (v) {
    return page.evaluate(function (val) {
      const s = document.querySelector('#pageSize');
      s.value = val; s.dispatchEvent(new Event('change', { bubbles: true }));
    }, v);
  };
  await H.setDoc(page, '# Round trip\n\nbody text\n');
  await setSize('Letter');
  await page.waitForFunction(function () { return document.documentElement.style.getPropertyValue('--pw') === '215.9mm'; });
  const dl = await H.pressAndDownload(page, function () { return page.keyboard.press('Control+s'); });
  const text = fs.readFileSync(await dl.path(), 'utf8');
  assert.match(text, /^<!--settings:\{/);
  assert.equal(JSON.parse(text.match(/^<!--settings:(\{.*?\})-->/s)[1]).size, 'Letter');
  assert.equal(dl.suggestedFilename(), 'Round trip.md');

  await setSize('A4');
  await page.waitForFunction(function () { return document.documentElement.style.getPropertyValue('--pw') === '210mm'; });
  await page.setInputFiles('#fileInput', { name: 'round.md', mimeType: 'text/markdown', buffer: Buffer.from(text) });
  await page.waitForFunction(function () { return document.querySelector('#pageSize').value === 'Letter'; });
  assert.equal(await page.inputValue('#editor'), '# Round trip\n\nbody text\n', 'settings comment must stay out of the editor pane');
});

test('unsaved-changes dialog guards New, Cancel keeps the text, Discard clears it', async function () {
  const page = await app();
  await H.setDoc(page, 'draft text that is not saved\n');
  const clickNew = async function () {
    await page.click('#mbFileBtn');
    await page.locator('#mbFileMenu').getByText('New', { exact: true }).click();
  };
  await clickNew();
  assert.equal(await page.isHidden('#closeDialog'), false, 'dialog should open for a dirty document');
  await page.click('#closeCancel');
  assert.equal(await page.isHidden('#closeDialog'), true);
  assert.equal(await page.inputValue('#editor'), 'draft text that is not saved\n');
  await clickNew();
  await page.click('#closeDiscard');
  assert.equal(await page.inputValue('#editor'), '');
});

test('saving clears the unsaved flag', async function () {
  const page = await app();
  await H.setDoc(page, 'something new to save\n');
  assert.match(await page.textContent('#statLeft'), /unsaved changes/);
  await H.pressAndDownload(page, function () { return page.keyboard.press('Control+s'); });
  await page.waitForFunction(function () { return !/unsaved changes/.test(document.querySelector('#statLeft').textContent); });
});

test('DOCX export: valid package, well-formed XML, headings/lists/table/image/link/Bangla survive', async function () {
  const page = await app();
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  await H.setDoc(page, '# Title\n\nHello **bold** *it* `code` [link](https://example.com)\n\n1. one\n2. two\n   - sub\n\n' +
    '| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nlet a = 1;\n```\n\n> quote\n\nবাংলা টেক্সট\n\n![x](data:image/png;base64,' + png + ')\n');
  await page.click('#mbExportBtn');
  const dl = await H.pressAndDownload(page, function () { return page.click('#docxBtn'); });
  assert.equal(dl.suggestedFilename(), 'Title.docx');
  const zip = await JSZip.loadAsync(fs.readFileSync(await dl.path()));
  const names = Object.keys(zip.files);
  assert.ok(names.includes('[Content_Types].xml') && names.includes('word/document.xml'));
  for (const n of names.filter(function (x) { return /\.(xml|rels)$/.test(x); })) {
    const xml = await zip.file(n).async('string');
    const bad = await page.evaluate(function (x) {
      return !!new DOMParser().parseFromString(x, 'application/xml').querySelector('parsererror');
    }, xml);
    assert.equal(bad, false, n + ' is not well-formed XML');
  }
  const doc = await zip.file('word/document.xml').async('string');
  ['<w:tbl>', '<w:numPr>', '<w:drawing>', '<w:hyperlink', 'বাংলা টেক্সট', '<w:pgSz'].forEach(function (k) {
    assert.ok(doc.includes(k), 'document.xml is missing ' + k);
  });
  assert.deepEqual(page.errors, []);
});
