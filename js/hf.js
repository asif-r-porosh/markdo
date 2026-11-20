/* hf.js - running header/footer config and rendering */
import { footerTextInp, pagesEl, pgNumOnCb, pgNumStartInp } from './dom.js';
import { el } from './util.js';

/* ============================== running header/footer ==================
   Six options compete for four corner slots (Header/Footer x Left/Right):
   Page number, Date Time and Text 1-4. Rows are processed top to bottom;
   a position taken by an earlier enabled row is unavailable to later ones,
   so at most four options can run. Config lives in hfCfg, travels in the
   settings comment as the `hf` key, and the legacy pgNumOn / pgNumStart /
   footer keys are kept as mirrors for older app versions. */
export var HF_POS = { HL: 'Header Left', HR: 'Header Right', FL: 'Footer Left', FR: 'Footer Right' };
export var HF_ROWS = [
  { k: 'pg', label: 'Page number' },
  { k: 'dt', label: 'Date Time' },
  { k: 't1', label: 'Text 1' },
  { k: 't2', label: 'Text 2' },
  { k: 't3', label: 'Text 3' },
  { k: 't4', label: 'Text 4' }
];

export function defaultHfCfg() {
  return {
    pg: { on: false, off: 1, pos: 'FR' },
    dt: { date: false, time: false, pos: 'FL' },
    t1: { on: false, text: '', pos: 'HL' },
    t2: { on: false, text: '', pos: 'HR' },
    t3: { on: false, text: '', pos: 'FL' },
    t4: { on: false, text: '', pos: 'FR' }
  };
}
function hfPosOk(p) { return Object.prototype.hasOwnProperty.call(HF_POS, p); }
export function clampInt(v, lo, hi, dflt) {
  var n = parseInt(v, 10);
  return (isNaN(n) || n < lo || n > hi) ? dflt : n;
}
export function normalizeHf(c) {
  var d = defaultHfCfg();
  if (!c || typeof c !== 'object') { return d; }
  var out = defaultHfCfg();
  if (c.pg) {
    out.pg = {
      on: !!c.pg.on,
      off: clampInt(c.pg.off, 1, 9999, 1),
      pos: hfPosOk(c.pg.pos) ? c.pg.pos : d.pg.pos
    };
  }
  if (c.dt) {
    out.dt = {
      date: !!c.dt.date, time: !!c.dt.time,
      pos: hfPosOk(c.dt.pos) ? c.dt.pos : d.dt.pos
    };
  }
  ['t1', 't2', 't3', 't4'].forEach(function (k) {
    if (c[k]) {
      out[k] = {
        on: !!c[k].on,
        text: String(c[k].text == null ? '' : c[k].text).slice(0, 120),
        pos: hfPosOk(c[k].pos) ? c[k].pos : d[k].pos
      };
    }
  });
  return out;
}
/* legacy settings (pgNumOn / pgNumStart / footer) -> hf shape; the old
   footer always rendered bottom-left, so it migrates to the FL corner */
export function legacyHf(cfg) {
  var out = defaultHfCfg();
  var legacyFooter = (cfg && typeof cfg.footer === 'string') ? cfg.footer : '';
  out.pg.on = !!(cfg && cfg.pgNumOn);
  out.pg.off = clampInt(cfg && cfg.pgNumStart, 1, 9999, 1);
  out.t1.on = !!legacyFooter.trim();
  out.t1.text = legacyFooter;
  out.t1.pos = 'FL';
  return out;
}
export function hfRowEnabled(cfg, k) {
  if (k === 'dt') { return !!(cfg.dt && (cfg.dt.date || cfg.dt.time)); }
  if (k === 'pg') { return !!cfg.pg.on; }
  return !!(cfg[k] && cfg[k].on);
}

export var hfCfg = defaultHfCfg();

/* keep the hidden legacy mirrors in step (older saved files read them) */
export function syncHfMirrors() {
  pgNumOnCb.checked = !!hfCfg.pg.on;
  pgNumStartInp.value = String(hfCfg.pg.off || 1);
  footerTextInp.value = hfCfg.t1.on ? hfCfg.t1.text : '';
}

/* Resolve the four corner slots top-down; first enabled row wins a slot. */
export function buildHfSlots(cfg) {
  cfg = normalizeHf(cfg || hfCfg);
  var slots = { HL: null, HR: null, FL: null, FR: null, pg: null };
  HF_ROWS.forEach(function (r) {
    if (!hfRowEnabled(cfg, r.k)) { return; }
    var pos = cfg[r.k].pos;
    if (slots[pos]) { return; }               /* taken by an earlier row */
    var slot = { kind: r.k === 'pg' ? 'pg' : 'text', key: r.k, pos: pos };
    if (r.k === 'dt') {
      var bits = [];
      if (cfg.dt.date) { bits.push(hfDateString(new Date())); }
      if (cfg.dt.time) { bits.push(hfTimeString(new Date())); }
      slot.text = bits.join(' \u00b7 ');
    } else if (r.k !== 'pg') {
      slot.text = cfg[r.k].text;
    }
    slots[pos] = slot;
    if (r.k === 'pg') { slots.pg = slot; }
  });
  return slots;
}
function hfDateString(d) {
  var M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return M[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}
function hfTimeString(d) {
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  return p2(d.getHours()) + ':' + p2(d.getMinutes());
}

/* paint the resolved slots onto every preview page */
export function applyRunningHF() {
  Array.prototype.forEach.call(pagesEl.querySelectorAll('.rhf'), function (n) {
    n.parentNode.removeChild(n);
  });
  var slots = buildHfSlots();
  var count = pagesEl.children.length;
  if (!count) { return; }
  /* page number offset semantics are unchanged: the offset is the first
     page that shows a number, earlier pages stay unnumbered and the total
     counts only numbered pages (total 5, offset 3 -> [_, _, 1/3, 2/3, 3/3]) */
  /* an offset past the last page numbers nothing (total < 1 below) */
  var off = Math.max(1, parseInt(hfCfg.pg.off, 10) || 1);
  var total = count - off + 1;
  Array.prototype.forEach.call(pagesEl.children, function (pg, i) {
    Object.keys(slots).forEach(function (pos) {
      if (pos === 'pg' || !slots[pos]) { return; }
      var d = el('div', 'rhf rhf-' + pos.toLowerCase());
      if (slots[pos].kind === 'pg') {
        d.textContent = (i < off - 1 || total < 1) ? '' : (i - off + 2) + '/' + total;
        if (!d.textContent) { return; }
      } else {
        d.textContent = slots[pos].text;
      }
      pg.appendChild(d);
    });
  });
}
export function setHfCfg(v) { hfCfg = v; }
