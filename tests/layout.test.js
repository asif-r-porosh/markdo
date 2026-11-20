'use strict';
/* Layout checks at different window widths. */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');

let env;
test.before(async function () { env = await H.setup(); });
test.after(async function () { await env.close(); });

const geometry = function (page) {
  return page.evaluate(function () {
    const g = document.querySelector('.tb-group').getBoundingClientRect();
    const b = document.querySelector('.brand').getBoundingClientRect();
    const menus = document.querySelector('#mbExportBtn').getBoundingClientRect();
    return { gl: g.left, gr: g.right, gtop: g.top, btop: b.top, bl: b.left, mr: menus.right, vw: document.documentElement.clientWidth };
  });
};

test('l1. wide window: Save group sits at the right edge on the same row', async function () {
  const { page } = await H.openApp(env);
  await page.setViewportSize({ width: 1300, height: 800 });
  await page.waitForTimeout(150);
  const g = await geometry(page);
  assert.ok(Math.abs(g.gtop - g.btop) < 12, 'same row');
  assert.ok(g.vw - g.gr < 30, 'right-aligned, gap ' + (g.vw - g.gr));
});

test('l2. narrow window: the wrapped toolbar rows are centred', async function () {
  const { page } = await H.openApp(env);
  for (const w of [520, 420, 375]) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.waitForTimeout(150);
    const g = await geometry(page);
    assert.ok(g.gtop - g.btop > 10, w + ': the group wraps to a second row');
    assert.ok(Math.abs((g.gl + g.gr) / 2 - g.vw / 2) < 3, w + ': Save group centred, centre ' + (g.gl + g.gr) / 2 + ' of ' + g.vw / 2);
    if (w >= 500) {            /* brand and menus still share one row here; on a phone they stack */
      const rowCentre = (g.bl + g.mr) / 2;
      assert.ok(Math.abs(rowCentre - g.vw / 2) < 3, w + ': menu row centred, centre ' + rowCentre);
    }
  }
});
