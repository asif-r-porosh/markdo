'use strict';
/* Font pack guards: the lineup loads, old font keys migrate, the files obey
   the size contract and nothing is orphaned or missing. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('./helpers');

const ROOT = path.join(__dirname, '..');
let env;
test.before(async function () { env = await H.setup(); });
test.after(async function () { await env.close(); });

test('every bundled family in the menus loads regular, bold and italic', async function () {
  const { page } = await H.openApp(env);
  const rows = await page.evaluate(async function () {
    const m = await import('/js/fonts.js');
    const out = [];
    for (const o of m.FONT_OPTIONS) {
      if (o.group === 'system' || o.group === 'bangla') { continue; }
      const fam = o.stack.match(/^"([^"]+)"/)[1];
      for (const spec of ['400 16px', '700 16px', 'italic 400 16px']) {
        if (fam === 'Geist Serif' && spec.indexOf('italic') === 0) { continue; }   /* roman only */
        const faces = await document.fonts.load(spec + ' "' + fam + '"', 'Aa');
        out.push({ fam: fam, spec: spec, n: faces.length, st: faces.map(function (f) { return f.status; }).join() });
      }
    }
    return out;
  });
  assert.equal(rows.length, 44, 'expected the whole lineup, got ' + rows.length + ' checks');
  const bad = rows.filter(function (r) { return r.n < 1 || r.st.indexOf('error') >= 0; });
  assert.deepEqual(bad, [], 'families that did not load');
});

test('removed font keys in a saved document map to a bundled replacement', async function () {
  const { page } = await H.openApp(env);
  const md = '<!--settings:{"headFont":"manrope","bodyFont":"gelasio","codeFont":"firanf"}-->\n# Old fonts\n\ntext\n';
  await page.setInputFiles('#fileInput', { name: 'old.md', mimeType: 'text/markdown', buffer: Buffer.from(md) });
  await page.waitForFunction(function () { return document.querySelector('#editor').value.indexOf('# Old fonts') === 0; });
  const v = await page.evaluate(function () {
    return [document.querySelector('#headFont').value, document.querySelector('#bodyFont').value, document.querySelector('#codeFont').value];
  });
  assert.deepEqual(v, ['dmsans', 'geistserif', 'jbm']);
});

test('size contract: every new static font file is at most 50 KB, no Nerd fonts', function () {
  const files = fs.readdirSync(path.join(ROOT, 'fonts'));
  const statics = files.filter(function (f) { return /-latin-(400|700)\.woff2$/.test(f) && !/^hind-siliguri/.test(f); });
  assert.ok(statics.length >= 48);
  statics.forEach(function (f) {
    assert.ok(fs.statSync(path.join(ROOT, 'fonts', f)).size <= 50 * 1024, f + ' is over 50 KB');
  });
  assert.deepEqual(files.filter(function (f) { return /nerd/i.test(f); }), []);
});

test('fonts/ and css/fonts.css agree on the file list, sw.js no longer precaches fonts', function () {
  const files = fs.readdirSync(path.join(ROOT, 'fonts')).filter(function (f) { return /\.woff2$/.test(f); }).sort();
  const css = fs.readFileSync(path.join(ROOT, 'css/fonts.css'), 'utf8');
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const inCss = Array.from(new Set(Array.from(css.matchAll(/url\('\.\.\/fonts\/([^']+)'\)/g)).map(function (m) { return m[1]; }))).sort();
  assert.deepEqual(inCss, files, 'css/fonts.css vs fonts/');
  assert.equal(/'\.\/fonts\/[^']+\.woff2'/.test(sw), false, 'fonts belong to the page-filled font cache, not the shell list');
});

test('defaults are the Geist family: headings Geist Serif, body Geist, code Geist Mono', async function () {
  const { page } = await H.openApp(env);
  const v = await page.evaluate(function () {
    return [document.querySelector('#headFont').value, document.querySelector('#bodyFont').value, document.querySelector('#codeFont').value,
      getComputedStyle(document.querySelector('.page-content')).fontFamily];
  });
  assert.deepEqual(v.slice(0, 3), ['geistserif', 'geist', 'geistmono']);
  assert.match(v[3], /^"?Geist"?,/);
});

test('Anek Bangla is bundled with its licence; SolaimanLipi is gone everywhere', async function () {
  const files = fs.readdirSync(path.join(ROOT, 'fonts'));
  ['anek-bangla-roman-bengali.woff2', 'anek-bangla-roman-latin.woff2', 'anek-bangla-roman-latin-ext.woff2', 'OFL-anek-bangla.txt']
    .forEach(function (f) { assert.ok(files.includes(f), f + ' missing'); });
  assert.match(fs.readFileSync(path.join(ROOT, 'fonts/OFL-anek-bangla.txt'), 'utf8'), /Anek Project Authors/);
  assert.deepEqual(files.filter(function (f) { return /solaiman/i.test(f); }), []);
  ['css/fonts.css', 'js/fonts.js'].forEach(function (f) {
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, f), 'utf8'), /solaiman/i, f);
  });
  const { page } = await H.openApp(env);
  const r = await page.evaluate(async function () {
    const m = await import('/js/fonts.js');
    const o = m.FONT_OPTIONS.find(function (x) { return x.v === 'anekbangla'; });
    const reg = await document.fonts.load('400 16px "Anek Bangla"', 'বাংলা');
    const bold = await document.fonts.load('700 16px "Anek Bangla"', 'বাংলা');
    return { group: o && o.group, bn: o && o.bn, reg: reg.map(function (f) { return f.status; }).join(), bold: bold.map(function (f) { return f.status; }).join() };
  });
  assert.equal(r.group, 'bangla');
  assert.equal(r.bn, true);
  assert.match(r.reg, /loaded/);
  assert.match(r.bold, /loaded/);
});

test('defaults: serif headings, sans body, mono code, 12pt, on a fresh start and after File > New', async function () {
  const { page } = await H.openApp(env);
  const read = async function () {
    return page.evaluate(function () {
      const h = document.querySelector('#preview h1, .page h1');
      const p = document.querySelector('#preview p, .page p');
      return {
        sel: [document.getElementById('headFont').value, document.getElementById('bodyFont').value, document.getElementById('codeFont').value, document.getElementById('baseSize').value],
        headFam: h ? getComputedStyle(h).fontFamily : '',
        bodyFam: p ? getComputedStyle(p).fontFamily : '',
        bodyPx: p ? getComputedStyle(p).fontSize : ''
      };
    });
  };
  const check = function (r, where) {
    assert.deepEqual(r.sel, ['geistserif', 'geist', 'geistmono', '12pt'], where + ': dropdowns');
    assert.match(r.headFam, /^"?Geist Serif"?/, where + ': heading font');
    assert.match(r.bodyFam, /^"?Geist"?,/, where + ': body font');
    assert.equal(r.bodyPx, '16px', where + ': 12pt body text');
  };
  check(await read(), 'fresh start');
  /* change everything, make the document dirty, then File > New: back to the defaults */
  await page.evaluate(function () {
    [['headFont', 'inter'], ['bodyFont', 'lora'], ['baseSize', '9pt']].forEach(function (kv) {
      const el = document.getElementById(kv[0]);
      el.value = kv[1];
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
  assert.deepEqual((await read()).sel, ['inter', 'lora', 'geistmono', '9pt'], 'the changes took effect before File > New');
  await H.setDoc(page, '# Title\n\nSome body text.\n');
  await page.click('#mbFileBtn');
  await page.locator('#mbFileMenu').getByText('New', { exact: true }).click();
  await page.click('#closeDiscard');
  await H.setDoc(page, '# Title\n\nSome body text.\n');
  check(await read(), 'after File > New');
});
