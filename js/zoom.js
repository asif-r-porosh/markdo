/* zoom.js - preview zoom */
import { pagesEl, scaler, sizer, viewport, zoomSel } from './dom.js';
import { buildSyncMap, scheduleMeasure } from './scrollsync.js';

/* ----------------------------------------------------------- zoom ---- */
export var zoomScale = 1;
export function updateZoom() {
  if (!pagesEl.children.length) { return; }
  var pw = pagesEl.children[0].offsetWidth;
  var ph = pagesEl.offsetHeight;
  var v = zoomSel.value;
  if (v === 'fit') {
    zoomScale = Math.min(1.5, Math.max(0.12, (viewport.clientWidth - 40) / pw));
  } else {
    zoomScale = parseFloat(v) || 1;
  }
  scaler.style.transform = 'scale(' + zoomScale + ')';
  scaler.style.width = pw + 'px';
  scaler.style.height = ph + 'px';
  sizer.style.width = Math.max(pw * zoomScale, 0) + 'px';
  sizer.style.height = ph * zoomScale + 'px';
  buildSyncMap();                 /* anchor positions depend on the scale */
  scheduleMeasure();              /* editor wrap width may have changed */
}

var zoomTimer = null;
export function scheduleZoom() {
  clearTimeout(zoomTimer);
  zoomTimer = setTimeout(updateZoom, 60);
}