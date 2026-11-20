/* layout.js - split direction and splitter */
import { editorPane, mainEl, previewPane, splitBtn, splitter } from './dom.js';
import { LS_CFG } from './constants.js';
import { scheduleZoom, updateZoom } from './zoom.js';

/* ------------------------------------------- split direction -------- */
/* v = editor and preview side by side (default), h = preview stacked above
   the editor. The choice travels in the document's settings comment. */
export var splitDir = 'v';
export function setSplit(dir) {
  splitDir = (dir === 'h') ? 'h' : 'v';
  document.body.setAttribute('data-split', splitDir);
  if (splitBtn) {
    splitBtn.title = splitDir === 'v'
      ? 'Split: side-by-side \u2014 click to stack the preview above the editor'
      : 'Split: stacked (preview on top) \u2014 click to put the editor and preview side by side';
  }
  /* keep the config snapshot in sync (same pattern as theme / scrollsync):
     a later reload cannot resurrect a stale split from mdpdf.cfg */
  try {
    var raw = localStorage.getItem(LS_CFG);
    var cfg = raw ? JSON.parse(raw) : null;
    if (cfg && typeof cfg === 'object' && !Array.isArray(cfg)) {
      cfg.split = splitDir;
      localStorage.setItem(LS_CFG, JSON.stringify(cfg));
    }
  } catch (e) { /* storage unavailable */ }
  updateZoom();                        /* the preview's geometry changes */
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

splitBtn.addEventListener('click', function () { setSplit(splitDir === 'v' ? 'h' : 'v'); });