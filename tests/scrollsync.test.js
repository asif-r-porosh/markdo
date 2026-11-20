'use strict';
/* Scroll sync accuracy: scroll one side, measure where the other lands. */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');

let env;
test.before(async function () { env = await H.setup(); });
test.after(async function () { await env.close(); });

function buildDoc() {
  let s = '# Sync probe\n\n';
  for (let n = 1; n <= 40; n++) {
    s += '## Section ' + n + '\n\n' + H.LOREM + ' ' + H.LOREM.slice(0, 90 + (n % 5) * 40) + '\n\n';
    if (n % 6 === 0) { s += '- item one of ' + n + '\n- item two of ' + n + '\n- item three of ' + n + '\n\n'; }
    if (n % 9 === 0) { s += '| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n\n'; }
  }
  return s + 'THE END marker line\n';
}

async function ready() {
  const { page } = await H.openApp(env);
  await H.setDoc(page, buildDoc());
  await page.waitForTimeout(500);
  /* test-side copy of the editor line measurement: top y of every logical line */
  await page.evaluate(function () {
    window.__lineTops = function () {
      const ed = document.getElementById('editor');
      const cs = getComputedStyle(ed);
      const m = document.createElement('div');
      m.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre-wrap;overflow-wrap:break-word;box-sizing:content-box';
      ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'tabSize'].forEach(function (k) { m.style[k] = cs[k]; });
      m.style.width = (ed.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) + 'px';
      m.style.padding = cs.padding;
      ed.value.split('\n').forEach(function (l) { const d = document.createElement('div'); if (l) { d.textContent = l; } else { d.innerHTML = '<br>'; } m.appendChild(d); });
      document.body.appendChild(m);
      const tops = Array.from(m.children).map(function (c) { return c.offsetTop - parseFloat(cs.paddingTop); });
      document.body.removeChild(m);
      return tops;
    };
    window.__lineOf = function (needle) { return document.getElementById('editor').value.split('\n').indexOf(needle); };
    window.__topLine = function () { const t = window.__lineTops(); const st = document.getElementById('editor').scrollTop; let r = 0; for (let i = 0; i < t.length; i++) { if (t[i] <= st + 0.5) { r = i; } } return r; };
    window.__headTop = function (txt) {
      const h = Array.from(document.querySelectorAll('#pages h2')).find(function (x) { return x.textContent.trim() === txt; });
      return h ? h.getBoundingClientRect().top - document.getElementById('viewport').getBoundingClientRect().top : null;
    };
  });
  return page;
}

/* sections the editor can still scroll to its top (the last screenful is covered by s3/s4) */
const SECTIONS = [3, 12, 21, 30];

test('s1. editor -> preview: a heading at the top of the editor shows near the top of the preview', async function () {
  const page = await ready();
  for (const n of SECTIONS) {
    await page.evaluate(function (n) {
      const L = window.__lineOf('## Section ' + n);
      document.getElementById('editor').scrollTop = window.__lineTops()[L];
    }, n);
    await page.waitForTimeout(350);
    const top = await page.evaluate(function (n) { return window.__headTop('Section ' + n); }, n);
    assert.ok(top !== null && Math.abs(top - 18) < 90, 'Section ' + n + ' sits ' + top + 'px from the preview top, wanted about 18');
  }
});

test('s2. preview -> editor: a heading at the top of the preview puts its line at the top of the editor', async function () {
  const page = await ready();
  for (const n of SECTIONS) {
    await page.evaluate(function (n) {
      const vp = document.getElementById('viewport');
      vp.scrollTop += window.__headTop('Section ' + n) - 8;  /* a few px inside the viewport, not on the 2px edge */
    }, n);
    await page.waitForTimeout(450);
    const got = await page.evaluate(function () { return window.__topLine(); });
    const want = await page.evaluate(function (n) { return window.__lineOf('## Section ' + n); }, n);
    assert.ok(Math.abs(got - want) <= 1, 'Section ' + n + ': editor top line ' + got + ', wanted ' + want);
  }
});

test('s3. both ends: editor at the very top shows the preview top; editor at the very end shows the last line in the preview', async function () {
  const page = await ready();
  await page.evaluate(function () { document.getElementById('editor').scrollTop = 0; });
  await page.waitForTimeout(350);
  assert.ok((await page.evaluate(function () { return document.getElementById('viewport').scrollTop; })) < 2, 'preview not at the very top');
  await page.evaluate(function () { const e = document.getElementById('editor'); e.scrollTop = e.scrollHeight; });
  await page.waitForTimeout(450);
  const vis = await page.evaluate(function () {
    const vp = document.getElementById('viewport').getBoundingClientRect();
    const ps = Array.from(document.querySelectorAll('#pages p')).filter(function (p) { return /THE END marker/.test(p.textContent); });
    if (!ps.length) { return 'no-last-paragraph'; }
    const r = ps[ps.length - 1].getBoundingClientRect();
    return r.bottom > vp.top && r.top < vp.bottom ? 'visible' : 'off-screen by ' + Math.round(r.top - vp.bottom) + 'px';
  });
  assert.equal(vis, 'visible', 'last line of the document: ' + vis);
});

test('s4. both ends the other way: preview at the very end shows the last editor lines', async function () {
  const page = await ready();
  await page.evaluate(function () { const v = document.getElementById('viewport'); v.scrollTop = v.scrollHeight; });
  await page.waitForTimeout(450);
  const r = await page.evaluate(function () {
    const e = document.getElementById('editor');
    const last = window.__lineTops().length - 1;
    const tops = window.__lineTops();
    return { lastTop: tops[last], st: e.scrollTop, h: e.clientHeight };
  });
  assert.ok(r.lastTop < r.st + r.h, 'last editor line (y ' + Math.round(r.lastTop) + ') is below the editor window (' + Math.round(r.st) + '..' + Math.round(r.st + r.h) + ')');
});

test('s5. with linked scrolling off, neither side follows the other', async function () {
  const page = await ready();
  await page.click('#syncBtn');
  assert.equal(await page.getAttribute('#syncBtn', 'aria-pressed'), 'false');
  const before = await page.evaluate(function () { return document.getElementById('viewport').scrollTop; });
  await page.evaluate(function () { document.getElementById('editor').scrollTop = 4000; });
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(function () { return document.getElementById('viewport').scrollTop; }), before);
  const e0 = await page.evaluate(function () { return document.getElementById('editor').scrollTop; });
  await page.evaluate(function () { document.getElementById('viewport').scrollTop = 0; });
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(function () { return document.getElementById('editor').scrollTop; }), e0);
});

test('s6. sweeping the editor from top to end never moves the preview backwards', async function () {
  const page = await ready();
  const seq = await page.evaluate(async function () {
    const ed = document.getElementById('editor'), vp = document.getElementById('viewport');
    const max = ed.scrollHeight - ed.clientHeight, out = [];
    for (let i = 0; i <= 60; i++) {
      ed.scrollTop = Math.round(max * i / 60);
      await new Promise(function (r) { setTimeout(r, 170); });
      out.push(Math.round(vp.scrollTop));
    }
    return out;
  });
  for (let i = 1; i < seq.length; i++) { assert.ok(seq[i] >= seq[i - 1] - 1, 'preview went back at step ' + i + ': ' + seq[i - 1] + ' -> ' + seq[i]); }
  assert.ok(seq[seq.length - 1] > seq[0] + 3000, 'preview must travel the document');
});
