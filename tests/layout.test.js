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
    const bar = document.querySelector('.menubar').getBoundingClientRect();
    return { gl: g.left, gr: g.right, gtop: g.top, btop: b.top, bl: b.left, br: b.right, mr: bar.right, ml: bar.left, mtop: bar.top, vw: document.documentElement.clientWidth };
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
    assert.ok(g.mr <= g.vw, w + ': the menus stay inside the window, right edge ' + g.mr + ' of ' + g.vw);
    if (Math.abs(g.mtop - g.btop) < 12) {      /* brand and menus share one row */
      const rowCentre = (g.bl + g.mr) / 2;
      assert.ok(Math.abs(rowCentre - g.vw / 2) < 3, w + ': menu row centred, centre ' + rowCentre);
    } else {                                    /* on a narrow window they stack, each row centred */
      assert.ok(Math.abs((g.ml + g.mr) / 2 - g.vw / 2) < 3, w + ': stacked menu row centred, centre ' + (g.ml + g.mr) / 2);
      assert.ok(Math.abs((g.bl + g.br + 6) / 2 - g.vw / 2) < 3, w + ': stacked brand centred (6px right margin), centre ' + (g.bl + g.br + 6) / 2);
    }
  }
});
