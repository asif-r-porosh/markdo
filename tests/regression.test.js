'use strict';
/* Fixed audit findings, kept as guards. Each test came out of
   known-bugs.test.js when its fix landed; the number is the audit finding. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const H = require('./helpers');

let env;
test.before(async function () { env = await H.setup(); });
test.after(async function () { await env.close(); });

async function app() { return (await H.openApp(env)).page; }

test('1a. raw HTML in a document must not execute script', async function () {
  const page = await app();
  await H.setDoc(page, 'hi\n\n<img src=x onerror="window.__xss=1">\n');
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(function () { return window.__xss || 0; }), 0);
});

test('1b. a stored hostile document must not fire again after reload', async function () {
  const page = await app();
  await H.setDoc(page, 'hi\n\n<img src=x onerror="window.__xss=1">\n');
  await page.reload();
  await H.waitBooted(page);
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(function () { return window.__xss || 0; }), 0);
});

test('1c. javascript: links must not survive into the preview', async function () {
  const page = await app();
  await H.setDoc(page, '[click](javascript:alert(1))\n');
  assert.equal(await page.locator('#pages a[href^="javascript:"]').count(), 0);
});

test('1d. hostile HTML of every common kind is neutralised, harmless HTML survives', async function () {
  const page = await app();
  await H.setDoc(page, [
    '<script>window.__xss=1</script>',
    '<iframe src="javascript:window.__xss=1"></iframe>',
    '<svg onload="window.__xss=1"><circle r="5"/></svg>',
    '<a href=" jav&#x61;script:window.__xss=1">entity link</a>',
    '<div onclick="window.__xss=1" id="keep-me">clickable</div>',
    '<form action="javascript:window.__xss=1"><button formaction="javascript:window.__xss=1">go</button></form>',
    '<style>body{display:none}</style>',
    '<details><summary>fine</summary>harmless <kbd>Ctrl</kbd></details>',
    '![inline](data:image/gif;base64,R0lGODlhAQABAAAAACw=)',
    ''
  ].join('\n\n'));
  await page.waitForTimeout(400);
  const r = await page.evaluate(function () {
    const all = document.querySelector('#pages');
    return {
      xss: window.__xss || 0,
      scripts: all.querySelectorAll('script, iframe').length,
      handlers: Array.from(all.querySelectorAll('*')).filter(function (n) { return Array.from(n.attributes).some(function (a) { return /^on/i.test(a.name); }); }).length,
      jsUrls: all.querySelectorAll('[href^="javascript:" i], [formaction^="javascript:" i], [action^="javascript:" i]').length,
      styleKept: !!all.querySelector('style'),
      bodyVisible: getComputedStyle(document.body).display !== 'none',
      kbd: all.querySelectorAll('details kbd').length,
      img: all.querySelectorAll('img[src^="data:image/gif"]').length
    };
  });
  assert.deepEqual(r, { xss: 0, scripts: 0, handlers: 0, jsUrls: 0, styleKept: false, bodyVisible: true, kbd: 1, img: 1 });
});

test('1e. page-break and line-break comments still work after sanitising', async function () {
  const page = await app();
  await H.setDoc(page, 'first\n\n<!--pagebreak-->\n\nsecond\n');
  assert.equal(await H.previewPageCount(page), 2);
});

test('1f. DOCX export carries no javascript: hyperlink', async function () {
  const page = await app();
  await H.setDoc(page, '[bad](javascript:alert(1)) and [good](https://example.com/x)\n');
  await page.click('#mbExportBtn');
  const dl = await H.pressAndDownload(page, function () { return page.click('#docxBtn'); });
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(fs.readFileSync(await dl.path()));
  const rels = await zip.file('word/_rels/document.xml.rels').async('string');
  assert.equal(/javascript:/i.test(rels), false);
  assert.match(rels, /https:\/\/example\.com\/x/);
});

async function typeIn(page, text, from, to) {
  await H.setDoc(page, text);
  await page.focus('#editor');
  await page.evaluate(function (a) { document.querySelector('#editor').setSelectionRange(a[0], a[1]); }, [from, to]);
}
const sel = function (page) {
  return page.evaluate(function () { const e = document.querySelector('#editor'); return [e.selectionStart, e.selectionEnd]; });
};

test('2a. Tab with a selection keeps the text and indents the touched lines', async function () {
  const page = await app();
  await typeIn(page, 'line one\nline two\nline three', 0, 17);
  await page.keyboard.press('Tab');
  assert.equal(await page.inputValue('#editor'), '  line one\n  line two\nline three');
  assert.deepEqual(await sel(page), [2, 21]);
});

test('2b. Tab without a selection inserts two spaces at the caret', async function () {
  const page = await app();
  await typeIn(page, 'ab', 1, 1);
  await page.keyboard.press('Tab');
  assert.equal(await page.inputValue('#editor'), 'a  b');
  assert.deepEqual(await sel(page), [3, 3]);
});

test('2c. Shift+Tab outdents the line, and does not insert text', async function () {
  const page = await app();
  await typeIn(page, '    deep\n  mid\nnone', 0, 17);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.inputValue('#editor'), '  deep\nmid\nnone');
  await typeIn(page, 'x\n  y', 4, 4);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.inputValue('#editor'), 'x\ny');
});

test('2d. one Undo takes a Tab edit back, selection or not', async function () {
  const page = await app();
  await typeIn(page, 'line one\nline two', 0, 17);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Control+z');
  assert.equal(await page.inputValue('#editor'), 'line one\nline two');
});

test('2e. the preview follows a Tab edit', async function () {
  const page = await app();
  await typeIn(page, 'para', 0, 0);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.type('x');
  await page.waitForFunction(function () { return document.querySelector('#statLeft').textContent.indexOf('9 characters') >= 0; });
});

test('2f. Esc then Tab leaves the editor (keyboard is never trapped)', async function () {
  const page = await app();
  await typeIn(page, 'abc', 3, 3);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');
  assert.equal(await page.inputValue('#editor'), 'abc');
  assert.equal(await page.evaluate(function () { return document.activeElement.id !== 'editor'; }), true);
});

const reloaded = async function (page) { await page.reload(); await H.waitBooted(page); };
const dirtyFlag = function (page) { return page.evaluate(function () { return /unsaved changes/.test(document.querySelector('#statLeft').textContent); }); };

test('5a. a cleared document stays empty after reload', async function () {
  const page = await app();
  await H.setDoc(page, '');
  await reloaded(page);
  assert.equal(await page.inputValue('#editor'), '');
});

test('5b. a first visit still gets the sample document', async function () {
  const page = await app();
  assert.ok((await page.inputValue('#editor')).length > 200);
  assert.equal(await dirtyFlag(page), false);
});

test('5c. New document, then reload: empty and clean', async function () {
  const page = await app();
  await H.setDoc(page, 'something to throw away\n');
  await page.click('#mbFileBtn');
  await page.locator('#mbFileMenu').getByText('New', { exact: true }).click();
  await page.click('#closeDiscard');
  await reloaded(page);
  assert.equal(await page.inputValue('#editor'), '');
  assert.equal(await dirtyFlag(page), false);
});

test('6a. unsaved edits are still flagged as unsaved after a reload', async function () {
  const page = await app();
  await H.setDoc(page, 'edited but never saved\n');
  await reloaded(page);
  assert.match(await page.textContent('#statLeft'), /unsaved changes/);
});

test('6b. a saved document stays clean after a reload, and edits after that are flagged', async function () {
  const page = await app();
  await H.setDoc(page, '# Saved\n\nbody\n');
  await H.pressAndDownload(page, function () { return page.keyboard.press('Control+s'); });
  await page.waitForFunction(function () { return !/unsaved changes/.test(document.querySelector('#statLeft').textContent); });
  await reloaded(page);
  assert.equal(await dirtyFlag(page), false, 'saved then reloaded must be clean');
  await H.setDoc(page, '# Saved\n\nbody changed\n');
  assert.equal(await dirtyFlag(page), true);
  await reloaded(page);
  assert.equal(await dirtyFlag(page), true, 'still flagged after another reload');
});

test('6c. an unsaved page-setup change survives a reload as unsaved', async function () {
  const page = await app();
  await page.evaluate(function () {
    const s = document.querySelector('#pageSize');
    s.value = 'Letter'; s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(function () { return /unsaved changes/.test(document.querySelector('#statLeft').textContent); });
  await reloaded(page);
  assert.equal(await dirtyFlag(page), true);
});

test('9a. a heading is never left alone at the bottom of a page', async function () {
  const page = await app();
  let md = '';
  for (let i = 0; i < 40; i++) { md += '## Heading ' + i + '\n\n' + H.LOREM.repeat(6) + '\n\n'; }
  await H.setDoc(page, md);
  const pages = await H.pagesInfo(page);
  assert.ok(pages.length > 5);
  const stranded = pages.filter(function (tags) { return /^H[1-6]$/.test(tags[tags.length - 1] || ''); }).length;
  assert.equal(stranded, 0, stranded + ' of ' + pages.length + ' pages end with a heading');
});

test('9b. stacked headings move together, and every heading still sits with its text', async function () {
  const page = await app();
  let md = '';
  for (let i = 0; i < 30; i++) { md += '# Part ' + i + '\n\n## Section ' + i + '\n\n' + H.LOREM.repeat(4) + '\n\n'; }
  await H.setDoc(page, md);
  const pages = await H.pagesInfo(page);
  const bad = pages.filter(function (tags) { return /^H[1-6]$/.test(tags[tags.length - 1] || ''); }).length;
  assert.equal(bad, 0);
  assert.equal(await page.locator('#pages h1').count(), 30);
  assert.equal(await page.locator('#pages h2').count(), 30);
});

test('9c. a heading before a manual page break stays where the author put it', async function () {
  const page = await app();
  await H.setDoc(page, 'intro\n\n## Alone on purpose\n\n<!--pagebreak-->\n\nnext page\n');
  const pages = await H.pagesInfo(page);
  assert.equal(pages.length, 2);
  assert.equal(pages[0][pages[0].length - 1], 'H2');
});

test('9d. headings and text are all still there and in order after the rescue', async function () {
  const page = await app();
  let md = '';
  for (let i = 0; i < 25; i++) { md += '## H' + i + '\n\n' + H.LOREM.repeat(5) + '\n\n'; }
  await H.setDoc(page, md);
  const order = await page.evaluate(function () {
    return Array.from(document.querySelectorAll('#pages h2')).map(function (h) { return h.textContent; }).join(',');
  });
  assert.equal(order, Array.from({ length: 25 }, function (_, i) { return 'H' + i; }).join(','));
});

test('3a. a table that fits on one page is never split', async function () {
  const page = await app();
  const rows = Array.from({ length: 10 }, function (_, i) { return '| r' + i + ' | v' + i + ' |'; }).join('\n');
  for (let n = 3; n <= 14; n++) {
    const md = (H.LOREM.repeat(6) + '\n\n').repeat(n) + '| a | b |\n|---|---|\n' + rows + '\n';
    await H.setDoc(page, md);
    const pieces = await page.locator('#pages table').count();
    assert.equal(pieces, 1, 'table split into ' + pieces + ' pieces after ' + n + ' paragraphs');
  }
});

test('3b. a table taller than a page still flows, header repeated, no row lost', async function () {
  const page = await app();
  const rows = Array.from({ length: 120 }, function (_, i) { return '| row' + i + ' | v' + i + ' |'; }).join('\n');
  await H.setDoc(page, '| head a | head b |\n|---|---|\n' + rows + '\n');
  const info = await page.evaluate(function () {
    const tables = Array.from(document.querySelectorAll('#pages table'));
    return {
      pieces: tables.length,
      heads: tables.map(function (t) { return t.querySelectorAll('thead th').length; }),
      body: tables.reduce(function (n, t) { return n + t.querySelectorAll('tbody tr').length; }, 0)
    };
  });
  assert.ok(info.pieces >= 2);
  assert.ok(info.heads.every(function (n) { return n === 2; }), 'header repeated on every piece');
  assert.equal(info.body, 120);
});

test('4a. an ordered list keeps its start number', async function () {
  const page = await app();
  await H.setDoc(page, '5. five\n6. six\n7. seven\n');
  assert.equal(await page.locator('#pages ol').first().getAttribute('start'), '5');
});

test('4b. a long numbered list continues its numbers on the next page, start offset included', async function () {
  const page = await app();
  for (const first of [1, 5]) {
    let md = '';
    for (let i = 0; i < 60; i++) { md += (first + i) + '. item number ' + i + ' with some words to fill the line a little\n'; }
    await H.setDoc(page, md);
    const info = await page.evaluate(function () {
      return Array.from(document.querySelectorAll('#pages ol')).map(function (o) { return [o.getAttribute('start'), o.querySelectorAll(':scope > li').length]; });
    });
    assert.ok(info.length >= 2, 'list should span pages');
    let expect = first;
    info.forEach(function (p) {
      assert.equal(parseInt(p[0], 10), expect, 'piece starts at ' + expect + ' (first=' + first + ')');
      expect += p[1];
    });
    assert.equal(expect, first + 60);
  }
});

test('8a. the save filename drops Markdown marks from the heading', async function () {
  const page = await app();
  await H.setDoc(page, '# **Bold** Title\n\nbody\n');
  const dl = await H.pressAndDownload(page, function () { return page.keyboard.press('Control+s'); });
  assert.equal(dl.suggestedFilename(), 'Bold Title.md');
});

test('8b. titles from headings: marks removed, real characters kept, file-name safe', async function () {
  const page = await app();
  const out = await page.evaluate(async function () {
    const u = await import('/js/util.js');
    return [
      '# `code` and *em* and _it_ and ~~gone~~',
      '# [Link text](http://example.com/x) ![alt text](a.png)',
      '# snake_case_name and 2_000',
      '# Title ##',
      '# A/B: "test"?',
      '# \\*literal\\* stars',
      'no heading here',
      '#',
      '# <b>html</b> title'
    ].map(function (md) { return u.docTitle(md, 'markdown-document'); });
  });
  assert.deepEqual(out, [
    'code and em and it and gone',
    'Link text alt text',
    'snake_case_name and 2_000',
    'Title',
    'A-B- -test-',
    '-literal- stars',
    'markdown-document',
    'markdown-document',
    'html title'
  ]);
});

test('8c. the window title (PDF name) and the DOCX name use the same plain title', async function () {
  const page = await app();
  await H.setDoc(page, '# **Bold** Title\n\nbody\n');
  assert.equal(await page.title(), 'Bold Title');
  await page.click('#mbExportBtn');
  const dl = await H.pressAndDownload(page, function () { return page.click('#docxBtn'); });
  assert.equal(dl.suggestedFilename(), 'Bold Title.docx');
});

/* ---- backlog 010: view preferences belong to the reader, not to the file ---- */
async function setView(page) {
  await page.click('#themeBtn');                       /* light -> dark */
  await page.click('#splitBtn');                       /* side by side -> stacked */
  await page.click('#syncBtn');                        /* linked scrolling off */
  await page.evaluate(function () { const z = document.querySelector('#zoom'); z.value = '1.25'; z.dispatchEvent(new Event('change', { bubbles: true })); });
}
const viewState = function (page) {
  return page.evaluate(function () {
    return [document.documentElement.getAttribute('data-theme'), document.body.getAttribute('data-split'),
      document.querySelector('#syncBtn').getAttribute('aria-pressed'), document.querySelector('#zoom').value];
  });
};
const VIEW = ['dark', 'h', 'false', '1.25'];

test('10a. a saved file carries only the document settings, no view preferences', async function () {
  const page = await app();
  await setView(page);
  await H.setDoc(page, '# View\n\nbody\n');
  const dl = await H.pressAndDownload(page, function () { return page.keyboard.press('Control+s'); });
  const cfg = JSON.parse(fs.readFileSync(await dl.path(), 'utf8').match(/^<!--settings:(\{.*?\})-->/s)[1]);
  ['zoom', 'split', 'theme', 'scrollsync'].forEach(function (k) { assert.equal(k in cfg, false, k + ' must not be saved in the file'); });
  assert.equal(cfg.size, 'A4');
  assert.ok(cfg.hf && cfg.bodyFont);
});

test('10b. opening a file applies its document settings but leaves the reader view alone', async function () {
  const page = await app();
  await setView(page);
  const md = '<!--settings:{"size":"Letter","theme":"light","split":"v","scrollsync":true,"zoom":"0.5"}-->\n\n# From a file\n\nbody\n';
  await page.setInputFiles('#fileInput', { name: 'f.md', mimeType: 'text/markdown', buffer: Buffer.from(md) });
  await page.waitForFunction(function () { return document.querySelector('#pageSize').value === 'Letter'; });
  assert.deepEqual(await viewState(page), VIEW);
});

test('10c. New document and opening a header-less file keep the reader view', async function () {
  const page = await app();
  await setView(page);
  await H.setDoc(page, 'x\n');
  await page.click('#mbFileBtn');
  await page.locator('#mbFileMenu').getByText('New', { exact: true }).click();
  await page.click('#closeDiscard');
  assert.deepEqual(await viewState(page), VIEW);
  await page.setInputFiles('#fileInput', { name: 'plain.md', mimeType: 'text/markdown', buffer: Buffer.from('# plain\n') });
  await page.waitForFunction(function () { return document.querySelector('#editor').value === '# plain\n'; });
  assert.deepEqual(await viewState(page), VIEW);
});

test('10d. the reader view survives a reload', async function () {
  const page = await app();
  await setView(page);
  await H.setDoc(page, 'y\n');
  await page.reload();
  await H.waitBooted(page);
  assert.deepEqual(await viewState(page), VIEW);
});

test('11. Ctrl+S / Ctrl+O / Ctrl+P do nothing while a dialog is open, and work again after', async function () {
  const page = await app();
  await H.setDoc(page, 'dirty text\n');
  await page.evaluate(function () { window.__printed = 0; window.print = function () { window.__printed++; }; });
  await page.click('#mbFileBtn');
  await page.locator('#mbFileMenu').getByText('New', { exact: true }).click();
  assert.equal(await page.isHidden('#closeDialog'), false);
  let downloads = 0, choosers = 0;
  page.on('download', function () { downloads++; });
  page.on('filechooser', function () { choosers++; });
  for (const k of ['Control+s', 'Control+o', 'Control+p']) { await page.keyboard.press(k); }
  await page.waitForTimeout(900);
  assert.deepEqual([downloads, choosers, await page.evaluate(function () { return window.__printed; })], [0, 0, 0]);
  assert.equal(await page.isHidden('#closeDialog'), false, 'dialog stays open');
  await page.click('#closeCancel');
  await page.evaluate(function () { document.activeElement && document.activeElement.blur && document.activeElement.blur(); });
  await H.pressAndDownload(page, function () { return page.keyboard.press('Control+s'); });
});

test('12. the word count counts words, not Markdown symbols', async function () {
  const page = await app();
  const counts = await page.evaluate(async function () {
    const u = await import('/js/util.js');
    return [
      '# Title\n\n- one\n- two three\n\n1. a\n2. b',
      '| a | b |\n|---|:-:|\n| c | d |',
      '```js\ncode here\n```',
      '<!--pagebreak-->\n\nword',
      '> quote text\n\n---\n\nend',
      '- [x] done task',
      'বাংলা টেক্সট mixed',
      'a — b & c',
      '   \n\n',
      '**bold** and *it* and `code`'
    ].map(function (m) { return u.mdWordCount(m); });
  });
  assert.deepEqual(counts, [6, 4, 2, 1, 3, 2, 3, 3, 0, 5]);
  await H.setDoc(page, '# Heading\n\n- item one\n- item two\n');
  assert.match(await page.textContent('#statLeft'), /5 words/);
});

test('13. DOCX: task-list boxes are real check marks, Bangla runs name a Bengali-capable font', async function () {
  const page = await app();
  await H.setDoc(page, '- [x] done item\n- [ ] open item\n\nবাংলা টেক্সট এখানে\n\nplain **bold** text\n');
  await page.click('#mbExportBtn');
  const dl = await H.pressAndDownload(page, function () { return page.click('#docxBtn'); });
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(fs.readFileSync(await dl.path()));
  const xml = await zip.file('word/document.xml').async('string');
  assert.equal(/\[x\]|\[ \]/.test(xml), false, 'no literal [x] / [ ]');
  assert.ok(xml.indexOf('☑') >= 0 && xml.indexOf('☐') >= 0, 'check marks present');
  const bn = xml.match(/<w:r>(?:(?!<\/w:r>).)*বাংলা(?:(?!<\/w:r>).)*<\/w:r>/s)[0];
  assert.match(bn, /w:cs="Nirmala UI"/);
  const styles = await zip.file('word/styles.xml').async('string');
  assert.match(styles, /w:cs="Nirmala UI"/);
});
