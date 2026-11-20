/* hfdialog.js - Header/Footer dialog (Page Setup) */
import { $ } from './dom.js';
import { el } from './util.js';
import { render } from './render.js';
import { HF_POS, HF_ROWS, clampInt, hfCfg, hfRowEnabled, normalizeHf, setHfCfg, syncHfMirrors } from './hf.js';

/* ======================= Header/Footer dialog (Page Setup) ==============
   Edits a working copy of hfCfg; Ok writes it back (normalized, positions
   already resolved by the allocation rule), Cancel discards. The position
   dropdowns re-filter live: every enabled row shows only the corners still
   free above it, and a row whose corner got taken is bumped to the first
   free one. Rows 5+ cannot be enabled once all four corners are taken. */
var hfDialogEl = $('#hfDialog');
var hfRowsEl = $('#hfRows');
var hfReturnFocus = null;
var hfDraft = null;

function hfRowEnabledDraft(k) { return hfRowEnabled(hfDraft, k); }

function hfBuildRow(r) {
  var row = el('div', 'hf-row');
  row.dataset.k = r.k;
  var lab = el('div', 'hf-lab');
  if (r.k === 'dt') {
    lab.appendChild(mkCb('hf-date', 'Date', hfDraft.dt.date));
    lab.appendChild(mkCb('hf-time', 'Time', hfDraft.dt.time));
  } else {
    var on = mkCb('hf-on', r.label, hfRowEnabledDraft(r.k));
    lab.appendChild(on);
  }
  row.appendChild(lab);
  var fields = el('span', 'hf-fields');
  if (r.k === 'pg') {
    var offLab = document.createTextNode('Offset ');
    fields.appendChild(offLab);
    var off = document.createElement('input');
    off.type = 'number'; off.min = '1'; off.step = '1';
    off.className = 'numin hf-off'; off.value = String(hfDraft.pg.off || 1);
    off.title = 'First page that shows a number - pages before it stay unnumbered (preview and PDF). In a DOCX the numbers simply start counting at this value, because Word sets its own page breaks.';
    fields.appendChild(off);
  } else if (r.k !== 'dt') {
    var txt = document.createElement('input');
    txt.type = 'text'; txt.maxLength = 120;
    txt.className = 'txtin hf-text'; txt.placeholder = 'Running text\u2026';
    txt.value = hfDraft[r.k].text;
    fields.appendChild(txt);
  }
  row.appendChild(fields);
  var pos = el('span', 'hf-pos');
  var side = document.createElement('select');
  side.className = 'hf-side';
  side.appendChild(new Option('Header', 'H'));
  side.appendChild(new Option('Footer', 'F'));
  var al = document.createElement('select');
  al.className = 'hf-al';
  al.appendChild(new Option('Left', 'L'));
  al.appendChild(new Option('Right', 'R'));
  pos.appendChild(side); pos.appendChild(al);
  var noSlot = el('span', 'hf-noSlot');
  noSlot.textContent = 'all four corners are taken';
  pos.appendChild(noSlot);
  row.appendChild(pos);
  return row;

  function mkCb(cls, label, checked) {
    var wrap = el('label', 'hf-cb');
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = cls;
    cb.checked = !!checked;
    wrap.appendChild(cb);
    wrap.appendChild(document.createTextNode(label));
    return wrap;
  }
}

function hfSyncPos(row) {
  var k = row.dataset.k;
  var enabled = hfRowEnabledDraft(k);
  var taken = {};
  for (var i = 0; i < HF_ROWS.length; i++) {
    var rk = HF_ROWS[i].k;
    if (rk === k) { break; }                    /* only earlier rows reserve */
    if (hfRowEnabledDraft(rk)) { taken[hfDraft[rk].pos] = true; }
  }
  var free = Object.keys(HF_POS).filter(function (p) { return !taken[p]; });
  var cur = hfDraft[k].pos;
  var side = row.querySelector('.hf-side'), al = row.querySelector('.hf-al');
  if (enabled && taken[cur] && free.length) {
    cur = free[0];                              /* bump: earlier row took it */
    hfDraft[k].pos = cur;
  }
  side.value = cur.charAt(0);
  al.value = cur.charAt(1);
  /* a side (or alignment) goes gray once EVERY corner it could form is
     reserved by earlier enabled rows; the row's own corner stays usable */
  Array.prototype.forEach.call(side.options, function (o) {
    o.disabled = taken[o.value + 'L'] && taken[o.value + 'R'] && cur.charAt(0) !== o.value;
  });
  Array.prototype.forEach.call(al.options, function (o) {
    o.disabled = taken['H' + o.value] && taken['F' + o.value] && cur.charAt(1) !== o.value;
  });
  row.setAttribute('data-off', enabled ? '0' : '1');
  row.setAttribute('data-full', (!enabled && free.length === 0) ? '1' : '0');
  var onCb = row.querySelector('.hf-on');
  if (onCb) { onCb.disabled = !enabled && free.length === 0; }
  var dtCbs = row.querySelectorAll('.hf-date, .hf-time');
  Array.prototype.forEach.call(dtCbs, function (cb) {
    cb.disabled = free.length === 0 && !hfRowEnabledDraft(k);
  });
}

function hfSyncAllRows() {
  Array.prototype.forEach.call(hfRowsEl.children, hfSyncPos);
}

export function openHfDialog() {
  hfDraft = normalizeHf(JSON.parse(JSON.stringify(hfCfg)));
  hfRowsEl.textContent = '';
  HF_ROWS.forEach(function (r) { hfRowsEl.appendChild(hfBuildRow(r)); });
  hfSyncAllRows();
  hfReturnFocus = document.activeElement;
  hfDialogEl.hidden = false;
  $('#hfOk').focus();
}
function hideHfDialog() {
  hfDialogEl.hidden = true;
  hfDraft = null;
  if (hfReturnFocus && hfReturnFocus.focus) { hfReturnFocus.focus(); }
}

hfRowsEl.addEventListener('change', function (e) {
  if (!hfDraft) { return; }
  var row = e.target.closest('.hf-row');
  if (!row) { return; }
  var k = row.dataset.k;
  if (e.target.classList.contains('hf-on')) {
    if (k === 'pg') { hfDraft.pg.on = e.target.checked; }
    else { hfDraft[k].on = e.target.checked; }
    if (e.target.checked) {
      /* enabling: if the stored corner is taken, claim the first free one */
      hfSyncPos(row);
    }
  } else if (e.target.classList.contains('hf-date')) {
    hfDraft.dt.date = e.target.checked;
  } else if (e.target.classList.contains('hf-time')) {
    hfDraft.dt.time = e.target.checked;
  } else if (e.target.classList.contains('hf-off')) {
    hfDraft.pg.off = clampInt(e.target.value, 1, 9999, 1);
    e.target.value = String(hfDraft.pg.off);
  } else if (e.target.classList.contains('hf-text')) {
    hfDraft[k].text = e.target.value.slice(0, 120);
  } else if (e.target.classList.contains('hf-side') || e.target.classList.contains('hf-al')) {
    var side = row.querySelector('.hf-side').value;
    var al = row.querySelector('.hf-al').value;
    var want = side + al;
    /* the allocation rule: a corner reserved by an earlier enabled row is
       unavailable. Redirect instead of snapping back: keep the dimension
       the user just changed and claim its first free corner, so diagonal
       moves (e.g. HR -> FL) stay possible even when corners between are
       taken. If nothing is free on that dimension, the old corner stays. */
    var takenEarlier = {};
    for (var j = 0; j < HF_ROWS.length; j++) {
      var rk2 = HF_ROWS[j].k;
      if (rk2 === k) { break; }
      if (hfRowEnabledDraft(rk2)) { takenEarlier[hfDraft[rk2].pos] = true; }
    }
    if (!takenEarlier[want]) {
      hfDraft[k].pos = want;
    } else {
      var cands = e.target.classList.contains('hf-side')
        ? [side + 'L', side + 'R']
        : ['H' + al, 'F' + al];
      var pick = null;
      for (var ci = 0; ci < cands.length; ci++) {
        if (!takenEarlier[cands[ci]]) { pick = cands[ci]; break; }
      }
      if (pick) { hfDraft[k].pos = pick; }
    }
  }
  hfSyncAllRows();                    /* later rows may need re-bumping */
});

$('#hfOk').addEventListener('click', function () {
  if (!hfDraft) { return; }
  /* drop enabled-but-empty text rows so they never occupy a corner */
  ['t1', 't2', 't3', 't4'].forEach(function (k) {
    if (hfDraft[k].on && !hfDraft[k].text.trim()) { hfDraft[k].on = false; }
  });
  setHfCfg(normalizeHf(JSON.parse(JSON.stringify(hfDraft))));
  syncHfMirrors();
  hideHfDialog();
  render();                           /* re-render + updateStatus (dirty) */
});
$('#hfCancel').addEventListener('click', hideHfDialog);
hfDialogEl.addEventListener('click', function (e) {
  if (e.target === hfDialogEl) { hideHfDialog(); }
});
hfDialogEl.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') { e.preventDefault(); hideHfDialog(); }
});