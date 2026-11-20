/* fontpack.js - offline font pack.
   After first paint the page downloads every bundled font once (the list
   comes from css/fonts.css, so there is no second list to keep in sync),
   shows a small progress chip while it works, and stores the files in the
   font cache, which the service worker serves from. When everything is
   cached the chip stays hidden; it only comes back if the browser evicted
   part of the cache. Needs http(s) and the Cache API; elsewhere it does
   nothing and the fonts load on demand as before. */
import { $ } from './dom.js';

export var FONT_CACHE = 'mdpdf-fonts-v1';   /* sw.js uses the same name */
var CSS_URL = 'css/fonts.css';
var PARALLEL = 4;
var RETRIES = 3;

function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* every font file named in fonts.css, as absolute URLs */
function listFiles() {
  var base = new URL(CSS_URL, location.href);
  return fetch(CSS_URL).then(function (r) {
    if (!r.ok) { throw new Error('fonts.css ' + r.status); }
    return r.text();
  }).then(function (css) {
    var seen = {}, out = [], m, re = /url\(\s*['"]?([^'")]+\.woff2)['"]?\s*\)/g;
    while ((m = re.exec(css))) {
      var u = new URL(m[1], base).href;
      if (!seen[u]) { seen[u] = true; out.push(u); }
    }
    return out;
  });
}

function fetchRetry(url, attempt) {
  attempt = attempt || 0;
  return fetch(url, { cache: 'reload' }).then(function (r) {
    if (!r.ok) { throw new Error(url + ' ' + r.status); }
    return r;
  }).catch(function (err) {
    if (attempt + 1 >= RETRIES) { throw err; }
    return wait(400 * Math.pow(2, attempt)).then(function () { return fetchRetry(url, attempt + 1); });
  });
}

function showChip(done, total, note) {
  var chip = $('#fontChip');
  if (!chip) { return; }
  chip.hidden = false;
  window.__fontPackShown = true;
  chip.style.setProperty('--p', total ? String(done / total) : '0');
  $('#fontChipText').textContent = note || ('Fonts ' + done + '/' + total);
  chip.title = note ? note : 'Downloading fonts once, so they work offline';
}
function hideChip() { var chip = $('#fontChip'); if (chip) { chip.hidden = true; } }

/* Resolves to 'complete', 'partial' or 'skipped'; also left in
   window.__fontPack (observable by tests). */
export function startFontPack() {
  function finish(state) { window.__fontPack = state; return state; }
  if (!('caches' in window) || !/^https?:$/.test(location.protocol)) { return Promise.resolve(finish('skipped')); }
  return Promise.all([caches.open(FONT_CACHE), listFiles()]).then(function (r) {
    var cache = r[0], urls = r[1], want = {};
    urls.forEach(function (u) { want[u] = true; });
    return cache.keys().then(function (keys) {
      var have = {};
      var drops = [];
      keys.forEach(function (k) {
        if (want[k.url]) { have[k.url] = true; } else { drops.push(cache.delete(k)); }   /* font no longer shipped */
      });
      var todo = urls.filter(function (u) { return !have[u]; });
      return Promise.all(drops).then(function () {
        if (!todo.length) { return finish('complete'); }
        if (navigator.storage && navigator.storage.persist) { navigator.storage.persist().catch(function () {}); }
        var total = urls.length, done = total - todo.length, failed = 0, next = 0;
        showChip(done, total);
        function worker() {
          if (next >= todo.length) { return Promise.resolve(); }
          var u = todo[next++];
          return fetchRetry(u).then(function (resp) { return cache.put(u, resp); })
            .then(function () { done++; showChip(done, total); })
            .catch(function () { failed++; })
            .then(worker);
        }
        var workers = [];
        for (var i = 0; i < PARALLEL; i++) { workers.push(worker()); }
        return Promise.all(workers).then(function () {
          if (!failed) { hideChip(); return finish('complete'); }
          showChip(done, total, 'Offline fonts incomplete, retrying on next start');
          setTimeout(hideChip, 8000);
          return finish('partial');
        });
      });
    });
  }).catch(function () { hideChip(); return finish('partial'); });
}
