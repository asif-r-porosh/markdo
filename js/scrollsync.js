/* scrollsync.js - linked scrolling between editor and preview */
import { editor, pagesEl, viewport } from './dom.js';
import { LS_CFG } from './constants.js';
import { blkRange } from './paginate.js';
import { zoomScale } from './zoom.js';

/* ---------------------------------------------------- scroll sync ---- */
/* The editor and the preview follow each other. The preview is paginated,
   so naive proportional scrolling drifts; instead every .blk wrapper and
   every splittable child (list item, table row, code line) carries its
   source-line range (data-l0 / data-l1), and the editor side is measured
   with an off-screen mirror that replicates the textarea's line wrapping. */
var LS_SYNC = 'mdpdf.scrollsync';
export var syncOn = true;
var syncMap = [];          /* [{el, l0, l1, y}] sorted by source line */
var syncMapByY = [];       /* same anchors in document (page) order */
var lineTops = null;       /* top y (content px) of each logical editor line */
var mirror = null;
var measureTimer = null;
var syncLockT = 0;
var syncLockWho = '';
var rafE = 0;
var rafP = 0;

function noteWrite(who) {
  syncLockWho = who;
  syncLockT = Date.now();
}

function blockedFor(who) {
  return (Date.now() - syncLockT) < 140 && syncLockWho !== who;
}

export function setSync(on, persist) {
  syncOn = !!on;
  var btn = document.getElementById('syncBtn');
  if (btn) {
    btn.setAttribute('aria-pressed', syncOn ? 'true' : 'false');
    btn.title = 'Linked scrolling: the editor and the preview follow each other \u00b7 click to ' + (syncOn ? 'unlink' : 'link');
  }
  if (persist !== false) {
    try {
      localStorage.setItem(LS_SYNC, syncOn ? '1' : '0');
      /* keep the config snapshot in sync (same pattern as the theme) */
      var raw = localStorage.getItem(LS_CFG);
      var cfg = raw ? JSON.parse(raw) : null;
      if (cfg && typeof cfg === 'object' && !Array.isArray(cfg)) {
        cfg.scrollsync = syncOn;
        localStorage.setItem(LS_CFG, JSON.stringify(cfg));
      }
    } catch (e) { /* storage unavailable */ }
  }
  if (syncOn) { noteWrite('e'); syncFromEditor(); }
}

export function initSync() {
  var saved = null;
  try { saved = localStorage.getItem(LS_SYNC); } catch (e) { /* ignore */ }
  setSync(saved !== '0', false);
}

function tagBlkRanges() {
  Array.prototype.forEach.call(pagesEl.querySelectorAll('.blk'), function (w) {
    if (w.getAttribute('data-l0')) { return; }
    var kid = w.firstElementChild;
    var r = null;
    /* a split container's shell clone still carries the WHOLE block's
       range; prefer the range spanned by its stamped children */
    if (kid && kid.querySelector && kid.querySelector('[data-l0]') &&
        /^(UL|OL|TABLE|BLOCKQUOTE|PRE)$/.test(kid.tagName)) {
      var f = kid.querySelector('[data-l0]');
      var all = kid.querySelectorAll('[data-l1]');
      var l = all[all.length - 1];
      if (f && l) {
        var a2 = parseInt(f.getAttribute('data-l0'), 10);
        var b2 = parseInt(l.getAttribute('data-l1'), 10);
        if (a2 >= 1) { r = [a2, b2 >= a2 ? b2 : a2]; }
      }
    }
    if (!r) { r = blkRange(kid); }
    if (r && r[0] >= 1) {
      w.setAttribute('data-l0', String(r[0]));
      w.setAttribute('data-l1', String(r[1]));
    }
  });
}

export function buildSyncMap() {
  tagBlkRanges();
  syncMap = [];
  syncMapByY = [];
  if (!pagesEl.children.length || !zoomScale) { return; }
  var pr = pagesEl.getBoundingClientRect();
  if (!pr.height) { return; }
  var z = zoomScale;
  function add(node) {
    var a = parseInt(node.getAttribute('data-l0'), 10);
    var b = parseInt(node.getAttribute('data-l1'), 10);
    if (!(a >= 1)) { return; }
    var r = node.getBoundingClientRect();
    syncMap.push({
      el: node, l0: a, l1: (b >= a ? b : a),
      y: (r.top - pr.top) / z        /* unscaled content px */
    });
  }
  Array.prototype.forEach.call(pagesEl.querySelectorAll('.blk[data-l0]'), add);
  Array.prototype.forEach.call(pagesEl.querySelectorAll('li[data-l0], .cl[data-l0]'), add);
  /* repeated thead rows on split tables are clones, not real positions */
  Array.prototype.forEach.call(pagesEl.querySelectorAll('tr[data-l0]'), function (tr) {
    if (tr.parentElement && tr.parentElement.tagName === 'THEAD') { return; }
    add(tr);
  });
  /* a block split across pages yields several wrappers carrying the same
     source range; keep only the first physical piece per line so the map
     stays strictly increasing in both line and page order */
  syncMap.sort(function (p, q) { return p.y - q.y; });
  var seen = {};
  var uniq = [];
  for (var i = 0; i < syncMap.length; i++) {
    if (seen[syncMap[i].l0]) { continue; }
    seen[syncMap[i].l0] = true;
    uniq.push(syncMap[i]);
  }
  syncMap = uniq;
  syncMapByY = uniq;   /* already sorted by y, and l0 never decreases */
}

export function measureEditorLines() {
  var v = editor.value;
  if (!v.length) { lineTops = [0]; return; }
  if (!mirror) {
    mirror = document.createElement('div');
    mirror.setAttribute('aria-hidden', 'true');
    mirror.style.position = 'absolute';
    mirror.style.left = '-9999px';
    mirror.style.top = '0';
    mirror.style.visibility = 'hidden';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.overflowWrap = 'break-word';
    mirror.style.wordBreak = 'normal';
    mirror.style.boxSizing = 'content-box';
    document.body.appendChild(mirror);
  }
  var cs = getComputedStyle(editor);
  var padT = parseFloat(cs.paddingTop) || 0;
  var padL = parseFloat(cs.paddingLeft) || 0;
  var padR = parseFloat(cs.paddingRight) || 0;
  mirror.style.fontFamily = cs.fontFamily;
  mirror.style.fontSize = cs.fontSize;
  mirror.style.fontWeight = cs.fontWeight;
  mirror.style.fontStyle = cs.fontStyle;
  mirror.style.lineHeight = cs.lineHeight;
  mirror.style.letterSpacing = cs.letterSpacing;
  mirror.style.tabSize = cs.tabSize;
  mirror.style.width = Math.max(10, editor.clientWidth - padL - padR) + 'px';
  mirror.style.padding = cs.paddingTop + ' ' + cs.paddingRight + ' ' + cs.paddingBottom + ' ' + cs.paddingLeft;
  var parts = v.split('\n');
  var frag = document.createDocumentFragment();
  for (var i = 0; i < parts.length; i++) {
    var d = document.createElement('div');
    if (parts[i].length) { d.textContent = parts[i]; } else { d.innerHTML = '<br>'; }
    frag.appendChild(d);
  }
  mirror.textContent = '';
  mirror.appendChild(frag);
  lineTops = new Array(parts.length);
  for (var j = 0; j < mirror.children.length; j++) {
    lineTops[j] = mirror.children[j].offsetTop - padT;
  }
}

export function scheduleMeasure() {
  clearTimeout(measureTimer);
  measureTimer = setTimeout(measureEditorLines, 120);
}

/* 0-based index of the logical line at (or directly above) scroll y */
function topLineFromScroll(st) {
  if (!lineTops || !lineTops.length) { return 0; }
  var lo = 0;
  var hi = lineTops.length - 1;
  while (lo < hi) {
    var mid = (lo + hi + 1) >> 1;
    if (lineTops[mid] <= st + 0.5) { lo = mid; } else { hi = mid - 1; }
  }
  return lo;
}

/* unscaled content y of the rendered position for a 1-based source line */
function anchorYForLine(line) {
  var m = syncMap;
  if (!m.length) { return null; }
  if (line <= m[0].l0) { return m[0].y; }
  var lo = 0;
  var hi = m.length - 1;
  while (lo < hi) {
    var mid = (lo + hi + 1) >> 1;
    if (m[mid].l0 <= line) { lo = mid; } else { hi = mid - 1; }
  }
  var a = m[lo];
  var b = m[lo + 1];
  if (!b || b.l0 <= a.l0) { return a.y; }
  var t = (line - a.l0) / (b.l0 - a.l0);
  if (t < 0) { t = 0; }
  if (t > 1) { t = 1; }
  return a.y + (b.y - a.y) * t;
}

/* first anchor whose content y sits at/below the viewport top */
function anchorAtViewportTop() {
  var m = syncMapByY;
  if (!m.length) { return null; }
  var st = viewport.scrollTop;
  var vp = viewport.getBoundingClientRect();
  var pr = pagesEl.getBoundingClientRect();
  var pad = pr.top - vp.top + st;
  var z = zoomScale || 1;
  var yTop = (st - pad + 2) / z;
  if (yTop <= m[0].y) { return m[0]; }
  var lo = 0;
  var hi = m.length;
  while (lo < hi) {
    var mid = (lo + hi) >> 1;
    if (m[mid].y < yTop) { lo = mid + 1; } else { hi = mid; }
  }
  return m[Math.min(lo, m.length - 1)];
}

function syncFromEditor() {
  if (!syncOn) { return; }
  if (!lineTops || !lineTops.length) { measureEditorLines(); }
  var line = topLineFromScroll(editor.scrollTop) + 1;   /* 1-based line */
  var y = anchorYForLine(line);
  if (y == null) { return; }
  var vp = viewport.getBoundingClientRect();
  var pr = pagesEl.getBoundingClientRect();
  var pad = pr.top - vp.top + viewport.scrollTop;
  var target = Math.max(0, pad + y * zoomScale - 18);
  /* the ends must meet: the editor cannot scroll its last lines to the top,
     so over its last screenful the preview eases onto its own end; at the
     very top the preview shows the page edge, not the first block */
  var edMax = editor.scrollHeight - editor.clientHeight;
  var vpMax = viewport.scrollHeight - viewport.clientHeight;
  if (editor.scrollTop <= 0) {
    target = 0;
  } else if (edMax > 0 && vpMax > 0) {
    var zone = Math.min(editor.clientHeight, edMax);
    var from = edMax - zone;
    if (editor.scrollTop > from) {
      var k = Math.min(1, (editor.scrollTop - from) / zone);
      target = target + (vpMax - target) * k;
    }
  }
  if (Math.abs(viewport.scrollTop - target) < 1) { return; }
  viewport.scrollTop = target;
}

function syncFromPreview() {
  if (!syncOn || !lineTops || !lineTops.length) { return; }
  var e = anchorAtViewportTop();
  if (!e) { return; }
  var idx = Math.max(0, Math.min(e.l0 - 1, lineTops.length - 1));
  var target = lineTops[idx];
  if (Math.abs(editor.scrollTop - target) < 1) { return; }
  editor.scrollTop = target;
}

export function reanchorPreview() {
  noteWrite('e');
  syncFromEditor();
}

export function onEditorScroll() {
  if (rafE) { return; }
  rafE = requestAnimationFrame(function () {
    rafE = 0;
    if (!syncOn || blockedFor('e')) { return; }
    noteWrite('e');
    syncFromEditor();
  });
}

export function onPreviewScroll() {
  if (rafP) { return; }
  rafP = requestAnimationFrame(function () {
    rafP = 0;
    if (!syncOn || blockedFor('p')) { return; }
    noteWrite('p');
    syncFromPreview();
  });
}

/* test/debug surface: the sync machinery lives inside this IIFE */
window.__mdeSync = {
  map: function () { return syncMap; },
  lines: function () { return lineTops; },
  measure: measureEditorLines,
  syncFromEditor: syncFromEditor,
  syncFromPreview: syncFromPreview,
  state: function () {
    return { syncOn: syncOn, lines: lineTops ? lineTops.length : 0, anchors: syncMap.length };
  }
};