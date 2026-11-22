/* layout.js - pane layout (View menu) and splitter */
import { editorPane, mainEl, previewPane, splitter } from './dom.js';
import { LS_CFG } from './constants.js';
import { scheduleZoom, updateZoom } from './zoom.js';
import { scheduleMeasure } from './scrollsync.js';

/* ------------------------------------------------------- layout -------- */
/* v = editor and preview side by side (default), h = preview stacked above the
   editor, e = editor only, p = preview only. The View menu and Ctrl/Cmd+] / [
   switch it. It is a view preference of the reader, not of the document: it is
   remembered across visits and never saved inside a .md. The hidden pane stays
   laid out (CSS hides it without removing it), because pagination and linked
   scrolling measure it. */
var LS_LAYOUT = 'mdpdf.layout';
export var LAYOUTS = ['v', 'h', 'e', 'p'];
export var LAYOUT_NAMES = { v: 'Vertical split', h: 'Horizontal split', e: 'Editor only', p: 'Preview only' };
export var splitDir = 'v';                       /* current layout (name kept for render.js) */

export function setLayout(mode, persist) {
  splitDir = LAYOUTS.indexOf(mode) >= 0 ? mode : 'v';
  document.body.setAttribute('data-split', splitDir);
  if (persist !== false) {
    try {
      localStorage.setItem(LS_LAYOUT, splitDir);
      /* keep the config snapshot in sync (same pattern as theme / scrollsync):
         a later reload cannot resurrect a stale layout from mdpdf.cfg */
      var raw = localStorage.getItem(LS_CFG);
      var cfg = raw ? JSON.parse(raw) : null;
      if (cfg && typeof cfg === 'object' && !Array.isArray(cfg)) {
        cfg.split = splitDir;
        localStorage.setItem(LS_CFG, JSON.stringify(cfg));
      }
    } catch (e) { /* storage unavailable */ }
  }
  updateZoom();                        /* the preview's geometry changes */
  scheduleMeasure();                   /* so does the editor's line wrapping */
}
export var setSplit = setLayout;       /* settings.js still calls it by this name */

/* Ctrl/Cmd+] = next layout, Ctrl/Cmd+[ = previous, wrapping at the ends */
export function cycleLayout(step) {
  var i = LAYOUTS.indexOf(splitDir);
  setLayout(LAYOUTS[(i + (step < 0 ? -1 : 1) + LAYOUTS.length) % LAYOUTS.length]);
}

/* after loadState: the saved layout wins over the reset to defaults */
export function initLayout() {
  var saved = null;
  try { saved = localStorage.getItem(LS_LAYOUT); } catch (e) { /* ignore */ }
  setLayout(saved, false);
}

/* -------------------------------------------------------- splitter ---- */
var dragging = false;
splitter.addEventListener('pointerdown', function (e) {
  dragging = true;
  splitter.setPointerCapture(e.pointerId);
  document.body.classList.add('dragging');
  e.preventDefault();
});
splitter.addEventListener('pointermove', function (e) {
  if (!dragging) { return; }
  var r = mainEl.getBoundingClientRect();
  var fd = getComputedStyle(mainEl).flexDirection;
  var col = fd.indexOf('column') === 0;
  var rev = fd === 'column-reverse' || fd === 'row-reverse';
  /* fraction of the axis the EDITOR pane should occupy; in a reversed
     stack the editor hugs the far edge, so measure from that edge */
  var frac;
  if (!col) { frac = (e.clientX - r.left) / r.width; }
  else if (rev) { frac = (r.bottom - e.clientY) / r.height; }
  else { frac = (e.clientY - r.top) / r.height; }
  frac = Math.min(0.85, Math.max(0.15, frac));
  editorPane.style.flexBasis = (frac * 100).toFixed(2) + '%';
  previewPane.style.flexBasis = ((1 - frac) * 100).toFixed(2) + '%';
  scheduleZoom();
});
function endDrag() {
  if (!dragging) { return; }
  dragging = false;
  document.body.classList.remove('dragging');
  updateZoom();
}
splitter.addEventListener('pointerup', endDrag);
splitter.addEventListener('pointercancel', endDrag);
splitter.addEventListener('dblclick', function () {
  editorPane.style.flexBasis = '50%';
  previewPane.style.flexBasis = '50%';
  updateZoom();
});
