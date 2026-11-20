/* docstyle.js - document style presets */
import { docStyleSel } from './dom.js';
import { DEFAULT_DOC_STYLE, DOC_STYLES, LS_CFG } from './constants.js';
import { ddSyncAll } from './dropdowns.js';

DOC_STYLES.forEach(function (d) {
  var o = document.createElement('option');
  o.value = d.v;
  o.textContent = d.label;
  if (d.paper) { o.dataset.paper = d.paper; o.dataset.text = d.text || ''; }
  docStyleSel.appendChild(o);
});

/* -------------------------------------- document style ---- */
export var docStyleChoice = DEFAULT_DOC_STYLE;

function isDocStyle(v) {
  for (var i = 0; i < DOC_STYLES.length; i++) { if (DOC_STYLES[i].v === v) { return true; } }
  return false;
}

export function setDocStyle(v, persist) {
  docStyleChoice = isDocStyle(v) ? v : DEFAULT_DOC_STYLE;
  document.documentElement.setAttribute('data-docstyle', docStyleChoice);
  if (docStyleSel && docStyleSel.value !== docStyleChoice) { docStyleSel.value = docStyleChoice; }
  if (typeof ddSyncAll === 'function') { ddSyncAll(); }
  if (persist !== false) {
    try {
      /* keep the config snapshot in sync (same pattern as the theme) */
      var raw = localStorage.getItem(LS_CFG);
      var cfg = raw ? JSON.parse(raw) : null;
      if (cfg && typeof cfg === 'object' && !Array.isArray(cfg)) {
        cfg.docstyle = docStyleChoice;
        localStorage.setItem(LS_CFG, JSON.stringify(cfg));
      }
    } catch (e) { /* storage unavailable */ }
  }
}