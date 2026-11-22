'use strict';
/* Hosting readiness (Cloudflare Pages): what the staging script publishes,
   what the _headers file says, and that the service worker survives a host
   that redirects /index.html to / (Pages does). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const H = require('./helpers');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
test.before(function () { execFileSync('sh', [path.join(ROOT, 'scripts', 'stage.sh')], { cwd: ROOT }); });

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(function (e) {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(p) : [path.relative(DIST, p).split(path.sep).join('/')];
  });
}

test('h1. dist holds the whole app shell and nothing else', function () {
  const files = listFiles(DIST);
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const shell = Array.from(sw.matchAll(/^  '\.\/([^']+)',/gm)).map(function (m) { return m[1]; });
  shell.forEach(function (f) { assert.ok(files.indexOf(f) >= 0, 'sw.js lists ' + f + ' but dist lacks it'); });
  assert.ok(files.indexOf('sw.js') >= 0 && files.indexOf('_headers') >= 0);
  const tops = Array.from(new Set(files.map(function (f) { return f.split('/')[0]; }))).sort();
  assert.deepEqual(tops, ['LICENSE', '_headers', 'apple-touch-icon.png', 'css', 'favicon-16x16.png', 'favicon-32x32.png', 'favicon-96x96.png', 'favicon.ico', 'fonts', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'index.html', 'js', 'manifest.json', 'sw.js', 'vendor']);
  const litter = files.filter(function (f) { return /\.md$|\.DS_Store$|(^|\/)\._|node_modules|tests\//.test(f); });
  assert.deepEqual(litter, [], 'must not publish notes or litter');
});

/* a minimal reader for the Cloudflare _headers format */
function readHeaders() {
  const rules = [];
  fs.readFileSync(path.join(DIST, '_headers'), 'utf8').split('\n').forEach(function (line) {
    if (!line.trim() || /^\s*#/.test(line)) { return; }
    if (/^\S/.test(line)) { rules.push({ pat: line.trim(), h: {} }); return; }
    const m = line.trim().match(/^([A-Za-z-]+):\s*(.+)$/);
    assert.ok(m && rules.length, 'unreadable _headers line: ' + line);
    assert.equal(rules[rules.length - 1].h[m[1].toLowerCase()], undefined, 'header repeated in one rule: ' + m[1]);
    rules[rules.length - 1].h[m[1].toLowerCase()] = m[2];
  });
  return rules;
}
const matches = function (pat, p) { return new RegExp('^' + pat.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$').test(p); };

test('h2. _headers: every path gets at most one Cache-Control; shell revalidates, fonts cache long', function () {
  const rules = readHeaders();
  assert.ok(rules.every(function (r) { return r.pat.charAt(0) === '/'; }), 'every rule starts with a path');
  const cc = function (p) {
    const hit = rules.filter(function (r) { return matches(r.pat, p) && r.h['cache-control']; });
    assert.ok(hit.length <= 1, p + ' matches several Cache-Control rules (Cloudflare would merge them)');
    return hit.length ? hit[0].h['cache-control'] : null;
  };
  ['/', '/index.html', '/sw.js', '/manifest.json', '/css/app.css', '/js/main.js', '/vendor/marked.min.js'].forEach(function (p) {
    assert.equal(cc(p), 'no-cache', p);
  });
  assert.match(cc('/fonts/geist-roman-latin-400.woff2') || '', /max-age=\d{6,}/);
  assert.ok(rules.some(function (r) { return r.pat === '/*' && r.h['x-content-type-options'] === 'nosniff'; }));
});

test('h3. on a host that redirects /index.html to /, the app still starts offline from any address', async function () {
  const env = await H.setup({ pagesLike: true, root: DIST });
  try {
    const { ctx, page } = await H.openApp(env);
    await page.evaluate(function () { return navigator.serviceWorker.ready; });
    await page.waitForFunction(function () { return window.__fontPack === 'complete'; }, null, { timeout: 60000 });
    await page.reload();
    await H.waitBooted(page);
    await page.waitForFunction(function () { return !!navigator.serviceWorker.controller; });
    const base = env.url.replace(/\/$/, '');
    await ctx.setOffline(true);
    for (const u of [base + '/', base + '/index.html', base + '/?never-seen-before=1']) {
      const p2 = await ctx.newPage();
      p2.errors = [];
      p2.on('pageerror', function (e) { p2.errors.push(String(e)); });
      await p2.goto(u);
      await H.waitBooted(p2);
      assert.ok((await p2.locator('#pages .page').count()) >= 1, 'app did not render at ' + u);
      assert.deepEqual(p2.errors, [], u);
      await p2.close();
    }
  } finally { await env.close(); }
});
