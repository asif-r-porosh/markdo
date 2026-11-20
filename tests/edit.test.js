'use strict';
/* Edit menu (Undo / Redo) and the insert-marker shortcuts. */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');

let env;
test.before(async function () { env = await H.setup(); });
test.after(async function () { await env.close(); });

const value = function (page) { return page.evaluate(function () { return document.querySelector('#editor').value; }); };
const type = async function (page, text) {
  await page.click('#editor');
  await page.keyboard.press('Control+End');
  await page.keyboard.type(text);
};
const menuItem = function (page, label) {
  return page.locator('#mbEditMenu .dd-opt', { hasText: label });
};

test('e1. Edit menu sits between File and Format and lists Undo and Redo with their keys', async function () {
  const { page } = await H.openApp(env);
  const names = await page.evaluate(function () {
    return Array.from(document.querySelectorAll('.menubar .menubtn')).map(function (b) { return b.textContent.trim(); });
  });
  assert.deepEqual(names, ['File', 'Edit', 'Format', 'Page Setup', 'Export']);
  await page.click('#mbEditBtn');
  const rows = await page.evaluate(function () {
    return Array.from(document.querySelectorAll('#mbEditMenu .dd-opt')).map(function (b) { return b.textContent.replace(/\s+/g, ' ').trim(); });
  });
  assert.equal(rows.length, 2);
  assert.match(rows[0], /^Undo.*Ctrl\/Cmd\+Z/);
  assert.match(rows[1], /^Redo.*Ctrl\+Y/);
});

test('e2. Undo and Redo from the menu act on the editor and give focus back', async function () {
  const { page } = await H.openApp(env);
  await H.setDoc(page, 'start');
  await type(page, ' one');
  await page.keyboard.press('Space');
  await page.keyboard.type('two');
  const typed = await value(page);
  assert.match(typed, /one two$/);
  await page.click('#mbEditBtn');
  await menuItem(page, 'Undo').click();
  const afterUndo = await value(page);
  assert.notEqual(afterUndo, typed);
  assert.ok(typed.startsWith(afterUndo.slice(0, 5)));
  const focus = await page.evaluate(function () { return document.activeElement && document.activeElement.id; });
  assert.equal(focus, 'editor');
  await page.click('#mbEditBtn');
  await menuItem(page, 'Redo').click();
  assert.equal(await value(page), typed);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(function () { return document.querySelector('#editorHl').textContent.replace(/ $/, ''); }), typed, 'colour layer follows');
});

test('e3. Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z still work natively', async function () {
  const { page } = await H.openApp(env);
  await H.setDoc(page, 'a');
  await type(page, 'bcd');
  const full = await value(page);
  await page.keyboard.press('Control+z');
  assert.notEqual(await value(page), full);
  await page.keyboard.press('Control+y');
  assert.equal(await value(page), full);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+Shift+z');
  assert.equal(await value(page), full);
});

test('e4. Undo also reverses an inserted page break marker', async function () {
  const { page } = await H.openApp(env);
  await H.setDoc(page, 'text');
  await type(page, '');
  await page.click('#pbBtn');
  assert.match(await value(page), /<!--pagebreak-->/);
  await page.click('#mbEditBtn');
  await menuItem(page, 'Undo').click();
  assert.doesNotMatch(await value(page), /pagebreak/);
});

test('e5. Ctrl/Cmd+Enter inserts a page break, with Shift a line break, in the editor only', async function () {
  const { page } = await H.openApp(env);
  await H.setDoc(page, 'alpha');
  await type(page, '');
  await page.keyboard.press('Control+Enter');
  assert.match(await value(page), /alpha\n\n<!--pagebreak-->$/);
  await page.keyboard.press('Control+Shift+Enter');
  assert.match(await value(page), /<!--pagebreak-->\n\n<!--linebreak-->$/);
  await page.keyboard.press('Meta+Enter');
  assert.equal((await value(page)).match(/<!--pagebreak-->/g).length, 2, 'Cmd works like Ctrl');
  /* focus outside the editor: nothing happens */
  const before = await value(page);
  await page.focus('#mbFileBtn');
  await page.keyboard.press('Control+Enter');
  assert.equal(await value(page), before);
});

test('e6. a plain Enter and Alt+Ctrl+Enter are left alone', async function () {
  const { page } = await H.openApp(env);
  await H.setDoc(page, 'x');
  await type(page, '');
  await page.keyboard.press('Enter');
  assert.equal(await value(page), 'x\n');
  await page.keyboard.press('Control+Alt+Enter');
  assert.doesNotMatch(await value(page), /<!--/);
});

test('e7. Edit menu keyboard: ArrowDown opens it, Enter runs Undo', async function () {
  const { page } = await H.openApp(env);
  await H.setDoc(page, 'k');
  await type(page, 'xyz');
  const typed = await value(page);
  await page.focus('#mbEditBtn');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(function () { return !document.getElementById('mbEditMenu').hidden; }), true);
  await page.keyboard.press('Enter');
  assert.notEqual(await value(page), typed);
  assert.equal(await page.evaluate(function () { return document.activeElement.id; }), 'editor');
});

test('e8. Export > DOCX says fonts are not kept; PDF has no such note', async function () {
  const { page } = await H.openApp(env);
  await page.click('#mbExportBtn');
  const t = await page.evaluate(function () {
    return { docx: document.getElementById('docxBtn').title, pdf: document.getElementById('exportBtn').title };
  });
  assert.match(t.docx, /Fonts are not kept in a DOCX/);
  assert.match(t.docx, /export a PDF/);
  assert.equal(t.pdf, '');
});
