'use strict';
/* Shared test plumbing: a tiny static server over the repo root, a headless
   Chromium, and a few page helpers. No build step, no framework. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2',
  '.md': 'text/markdown', '.txt': 'text/plain'
};

/* opts.root: folder to serve (default: the repo root).
   opts.pagesLike: behave like Cloudflare Pages: /index.html answers with a
   308 redirect to / (pretty URLs), and / serves index.html. */
function startServer(opts) {
  opts = opts || {};
  const root = opts.root || ROOT;
  return new Promise(function (resolve) {
    const srv = http.createServer(function (req, res) {
      const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (opts.pagesLike && rel === '/index.html') { res.writeHead(308, { location: '/' }).end(); return; }
      const file = path.join(root, rel === '/' ? 'index.html' : rel);
      if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      fs.readFile(file, function (err, buf) {
        if (err) { res.writeHead(404).end(); return; }
        res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(buf);
      });
    });
    srv.listen(0, '127.0.0.1', function () {
      resolve({ srv: srv, url: 'http://127.0.0.1:' + srv.address().port + (opts.pagesLike ? '/' : '/index.html') });
    });
  });
}

/* one server + one browser per test file */
async function setup(opts) {
  const s = await startServer(opts);
  /* BROWSER=firefox|webkit runs the same tests on another engine */
  const which = process.env.BROWSER || 'chromium';
  const browser = which === 'chromium'
    ? await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
    : await require('playwright-core')[which].launch();
  return {
    url: s.url,
    browser: browser,
    close: async function () { await browser.close(); s.srv.close(); }
  };
}

/* fresh browser context (clean localStorage) with the app booted.
   File pickers are removed so Save / Export take the download path. */
async function openApp(env) {
  const ctx = await env.browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', function (e) { page.errors.push(String(e)); });
  await page.addInitScript(function () { window.showSaveFilePicker = undefined; window.showOpenFilePicker = undefined; });
  await page.goto(env.url);
  await waitBooted(page);
  return { ctx: ctx, page: page };
}

async function waitBooted(page) {
  await page.waitForFunction(function () { return window.__fontsRerendered === true; });
  await page.evaluate(function () { return new Promise(function (r) { setTimeout(r, 350); }); });
}

/* replace the document and wait until the render has finished: the status
   bar is the last thing render() updates, and it shows the character count */
async function setDoc(page, md) {
  await page.fill('#editor', md);
  await page.waitForFunction(function (len) {
    return document.querySelector('#statLeft').textContent.indexOf(len + ' characters') >= 0;
  }, md.length);
  await page.evaluate(function () {
    return new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
  });
}

/* per page: the tag names of the top-level blocks (TABLE:n carries its row count) */
function pagesInfo(page) {
  return page.evaluate(function () {
    return Array.prototype.map.call(document.querySelectorAll('#pages .page'), function (p) {
      var c = p.querySelector('.page-content');
      return Array.prototype.map.call(c.querySelectorAll(':scope > .blk > *'), function (e) {
        return e.tagName + (e.tagName === 'TABLE' ? ':' + e.querySelectorAll('tr').length : '');
      });
    });
  });
}

const previewPageCount = function (page) {
  return page.evaluate(function () { return document.querySelectorAll('#pages .page').length; });
};

async function pdfPageCount(page) {
  await page.emulateMedia({ media: 'print' });
  const buf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  await page.emulateMedia({ media: 'screen' });
  return (buf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length;
}

async function pressAndDownload(page, action) {
  const pair = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), action()]);
  return pair[0];
}

const LOREM = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ';

/* Native editing keys differ by platform: Chromium on macOS undoes on Cmd+Z and redoes on
   Cmd+Shift+Z (Ctrl+Y is not a redo there); on Windows and Linux Ctrl+Z, Ctrl+Y and
   Ctrl+Shift+Z all work. REDO_ALT is the second redo spelling, or null where there is none. */
const MAC = process.platform === 'darwin';
const UNDO = MAC ? 'Meta+z' : 'Control+z';
const REDO = MAC ? 'Meta+Shift+z' : 'Control+y';
const REDO_ALT = MAC ? null : 'Control+Shift+z';

module.exports = {
  setup, openApp, waitBooted, setDoc, pagesInfo, previewPageCount, pdfPageCount,
  pressAndDownload, LOREM, UNDO, REDO, REDO_ALT
};
