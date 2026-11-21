/* Markdown PDF Editor - offline service worker.
   Precaches the app shell; cache-first for same-origin GETs, network
   fallback, navigation falls back to the cached index.html. Bump CACHE
   on every release of the shell files. Updates apply immediately:
   install calls skipWaiting() and activate claims clients, and the page
   reloads itself once when the controller changes. */
var CACHE = 'mdpdf-v25';
/* fonts live in their own cache, filled by the page (js/fontpack.js), so a
   release of the shell never throws the downloaded fonts away */
var FONT_CACHE = 'mdpdf-fonts-v1';
var SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon.ico',
  './favicon-32x32.png',
  './favicon-16x16.png',
  /* stylesheets, vendored libraries and ES modules of the app shell.
     docx UMD bundle for Export DOCX (MIT, see vendor/docx.LICENSE.txt):
     lazy-loaded by the app on first export, precached so it works offline */
  './css/app.css',
  './css/fonts.css',
  './vendor/marked.min.js',
  './vendor/dompurify.min.js',
  './vendor/docx.umd.min.js',
  './js/constants.js',
  './js/docstyle.js',
  './js/document.js',
  './js/dom.js',
  './js/dropdowns.js',
  './js/events.js',
  './js/export.js',
  './js/extract.js',
  './js/fontpack.js',
  './js/fonts.js',
  './js/hf.js',
  './js/hfdialog.js',
  './js/highlight.js',
  './js/layout.js',
  './js/linemap.js',
  './js/main.js',
  './js/markers.js',
  './js/menubar.js',
  './js/paginate.js',
  './js/render.js',
  './js/sanitize.js',
  './js/sample.js',
  './js/scrollsync.js',
  './js/settings.js',
  './js/shortcuts.js',
  './js/theme.js',
  './js/util.js',
  './js/zoom.js',
];

/* A response that came through a redirect (Cloudflare Pages answers
   /index.html with a redirect to /) may not be used to answer a page load.
   Cache a plain copy instead. */
function plain(r) {
  if (!r.redirected) { return r; }
  return r.blob().then(function (b) {
    return new Response(b, { status: 200, statusText: 'OK', headers: r.headers });
  });
}

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      /* every file straight from the network (cache: 'reload'), never from
         the browser's HTTP cache, so a release can not install as a mix of
         old and new files; any failure aborts the whole install */
      return Promise.all(SHELL.map(function (u) {
        return fetch(new Request(u, { cache: 'reload' })).then(function (r) {
          if (!r.ok) { throw new Error(u + ' ' + r.status); }
          return Promise.resolve(plain(r)).then(function (p) { return c.put(u, p); });
        });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE && k !== FONT_CACHE; })
            .map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') { return; }
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) { return; }
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      if (hit) { return hit; }
      return fetch(e.request).then(function (resp) {
        /* fonts are cached by the page (FONT_CACHE), not here */
        if (resp && resp.ok && resp.type === 'basic' && !resp.redirected && url.pathname.indexOf('/fonts/') < 0) {
          var copy = resp.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return resp;
      }).catch(function () {
        /* offline navigation: serve the app shell */
        if (e.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return Response.error();
      });
    })
  );
});
