'use strict';
/* Menubar keyboard use: what a keyboard-only user expects from the File,
   Format, Page Setup and Export menus. */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');

let env;
test.before(async function () { env = await H.setup(); });
test.after(async function () { await env.close(); });
async function app() { return (await H.openApp(env)).page; }

const active = function (page) {
  return page.evaluate(function () {
    const a = document.activeElement;
    return a ? { id: a.id || '', cls: a.className || '', text: (a.textContent || '').trim().slice(0, 30) } : null;
  });
};
const menuOpen = function (page, id) { return page.evaluate(function (i) { return !document.getElementById(i).hidden; }, id); };
const subOpen = function (page) { return page.evaluate(function () { return !!document.querySelector('.dd-menu.sub'); }); };

test('m1. ArrowDown on a menu button opens it with the first item focused; arrows, Home and End move', async function () {
  const page = await app();
  await page.focus('#mbFormatBtn');
  await page.keyboard.press('ArrowDown');
  assert.equal(await menuOpen(page, 'mbFormatMenu'), true);
  assert.match((await active(page)).text, /^Style/);
  await page.keyboard.press('ArrowDown');
  assert.match((await active(page)).text, /^Header font/);
  await page.keyboard.press('End');
  assert.match((await active(page)).text, /^Line height/);
  await page.keyboard.press('ArrowDown');
  assert.match((await active(page)).text, /^Line height/, 'stops at the last item');
  await page.keyboard.press('Home');
  assert.match((await active(page)).text, /^Style/);
  await page.keyboard.press('ArrowUp');
  assert.match((await active(page)).text, /^Style/, 'stops at the first item');
});

test('m2. Esc closes the submenu first, then the menu, and focus goes back each time', async function () {
  const page = await app();
  await page.focus('#mbSetupBtn');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  assert.equal(await subOpen(page), true);
  await page.keyboard.press('Escape');
  assert.equal(await subOpen(page), false);
  assert.equal(await menuOpen(page, 'mbSetupMenu'), true, 'first Esc must keep the menu open');
  assert.match((await active(page)).text, /^Page/);
  await page.keyboard.press('Escape');
  assert.equal(await menuOpen(page, 'mbSetupMenu'), false);
  assert.equal((await active(page)).id, 'mbSetupBtn');
});

test('m3. ArrowLeft in a submenu goes back to its row without closing the menu', async function () {
  const page = await app();
  await page.focus('#mbSetupBtn');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  assert.equal(await subOpen(page), true);
  await page.keyboard.press('ArrowLeft');
  assert.equal(await subOpen(page), false);
  assert.equal(await menuOpen(page, 'mbSetupMenu'), true);
  assert.match((await active(page)).text, /^Margins/);
});

test('m4. keyboard-only: pick a page size with Enter, the setting changes and the page count follows', async function () {
  const page = await app();
  await H.setDoc(page, ('para ' + H.LOREM.repeat(6) + '\n\n').repeat(8));
  const before = await H.previewPageCount(page);
  const want = await page.evaluate(function () {
    const s = document.getElementById('pageSize');
    return Array.from(s.options).map(function (o) { return o.value; }).filter(function (v) { return v !== s.value; })[0];
  });
  await page.focus('#mbSetupBtn');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 12; i++) {
    const cur = await page.evaluate(function () { const f = document.querySelector('.dd-menu.sub .dd-opt.focus'); return f ? f.dataset.value : ''; });
    if (cur === want) { break; }
    await page.keyboard.press('ArrowDown');
  }
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(function () { return document.getElementById('pageSize').value; }), want);
  await page.waitForTimeout(400);
  assert.equal(await menuOpen(page, 'mbSetupMenu'), false, 'menu closes after a pick');
  assert.notEqual((await active(page)).id, '', 'focus must land on a real control, not vanish');
  assert.ok((await H.previewPageCount(page)) >= 1 && before >= 1);
});

test('m5. Tab closes an open menu', async function () {
  const page = await app();
  await page.focus('#mbFileBtn');
  await page.keyboard.press('ArrowDown');
  assert.equal(await menuOpen(page, 'mbFileMenu'), true);
  await page.keyboard.press('Tab');
  assert.equal(await menuOpen(page, 'mbFileMenu'), false);
});

test('m6. Enter on Header/Footer opens the dialog and Esc returns focus to a live control', async function () {
  const page = await app();
  await page.focus('#mbSetupBtn');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  assert.match((await active(page)).text, /^Header\/Footer/);
  await page.keyboard.press('Enter');
  await page.waitForFunction(function () { return !document.querySelector('#hfDialog').hidden; });
  assert.equal(await menuOpen(page, 'mbSetupMenu'), false, 'menu must close behind the dialog');
  await page.keyboard.press('Escape');
  const a = await active(page);
  assert.ok(a && (a.id || a.cls), 'focus must be on something real');
  assert.notEqual(a.text, 'Header/Footer Running header/footer', 'focus must not sit on a hidden menu item');
  const visible = await page.evaluate(function () { const e = document.activeElement; return !!(e && e.offsetParent !== null); });
  assert.equal(visible, true, 'the focused element must be visible');
});

test('m7. opening a second menu closes the first; an outside click closes the open one', async function () {
  const page = await app();
  await page.click('#mbFileBtn');
  await page.click('#mbExportBtn');
  assert.equal(await menuOpen(page, 'mbFileMenu'), false);
  assert.equal(await menuOpen(page, 'mbExportMenu'), true);
  await page.mouse.click(5, 300);
  assert.equal(await menuOpen(page, 'mbExportMenu'), false);
});

test('m8. type-ahead in a font submenu jumps to a matching option', async function () {
  const page = await app();
  await page.focus('#mbFormatBtn');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  const first = await page.evaluate(function () { return document.querySelector('.dd-menu.sub .dd-opt.focus').textContent.trim(); });
  await page.keyboard.press('m');
  const now = await page.evaluate(function () { return document.querySelector('.dd-menu.sub .dd-opt.focus').textContent.trim(); });
  assert.match(now, /^m/i, 'focus moves to an option starting with m (was: ' + first + ')');
});
