/* main.js - startup sequence and service worker registration */
/* Modules run once, in this order = the source order of the original
   single script, so listeners on shared targets register in the same
   order as before. Keep the list explicit. */
import './dom.js';
import './fonts.js';
import './constants.js';
import './util.js';
import './sample.js';
import './linemap.js';
import './extract.js';
import './paginate.js';
import './render.js';
import './hf.js';
import './zoom.js';
import './scrollsync.js';
import './settings.js';
import './theme.js';
import './docstyle.js';
import './document.js';
import './markers.js';
import './highlight.js';
import './layout.js';
import './events.js';
import './hfdialog.js';
import './export.js';
import './shortcuts.js';
import './dropdowns.js';
import './menubar.js';
import './fontpack.js';
import './sanitize.js';

import { render, scheduleRender } from './render.js';
import { initSync } from './scrollsync.js';
import { initTheme } from './theme.js';
import { initLayout } from './layout.js';
import { isDocDirty, loadState } from './document.js';
import { buildDropdowns } from './dropdowns.js';
import { initMenubar } from './menubar.js';
import { startFontPack } from './fontpack.js';

/* ------------------------------------------------------------ init ---- */
loadState();
buildDropdowns();    /* wrap the zoom select (after loadState) */
initMenubar();       /* wire the File / Format / Layout menubar */
initSync();          /* after loadState: LS_SYNC wins over the reset */
initLayout();        /* same for the saved pane layout */
initTheme();
render();

/* webfonts landing after first paint change text metrics; re-paginate once
   so the page breaks match the real faces (flag observable for tests) */
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(function () {
    window.__fontsRerendered = true;
    scheduleRender();
    /* the first paint is done: now fetch the rest of the fonts for offline use */
    setTimeout(startFontPack, 600);
  });
}

/* PWA: register the offline service worker when served over http(s).
   Skipped on file:// where service workers do not run. */
if ('serviceWorker' in navigator &&
    (location.protocol === 'https:' ||
     location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  navigator.serviceWorker.register('sw.js').catch(function () { /* optional */ });
  /* the SW activates updates with skipWaiting(): when the controller
     changes under an already-controlled page, reload once so the shell
     never lags the pushed release. Not while the document has unsaved
     changes: a reload would drop the open file's handle, so the new
     version then simply applies on the next start */
  var hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!hadController) { hadController = true; return; }  /* first adoption, not an update */
    if (isDocDirty()) { return; }
    location.reload();
  });
}