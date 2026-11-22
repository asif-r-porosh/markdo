/* menubar.js - menubar panels */
import { FONT_GROUPS, fontStack } from './fonts.js';
import { closeDocument, newDocument, openDocument, saveMarkdown } from './document.js';
import { openHfDialog } from './hfdialog.js';
import { editorRedo, editorUndo } from './markers.js';
import { exportDocx, printWhenFontsReady } from './export.js';
import { cycleLayout, LAYOUT_NAMES, LAYOUTS, setLayout, splitDir } from './layout.js';
import { ddClose, ddLabel, ddOpenIdx } from './dropdowns.js';

/* ------------------------------------------- menubar panels ---------- */
/* The File / Edit / View / Format / Page Setup / Export menus. File, Edit, View and Export
   are plain action lists; Format and Page Setup are cascading pickers whose submenus
   are built from the hidden state-holder <select>s -- the same option data
   the old dropdowns used, so settings files, shortcuts and tests keep
   working unchanged. Page Setup also carries plain actions (the
   Header/Footer dialog). */
var MB_MENUS = [
  { btn: 'mbFileBtn', menu: 'mbFileMenu', actions: [
    { lab: 'New', fn: newDocument },
    { lab: 'Open', fn: openDocument, hint: 'Ctrl/Cmd+O' },
    { lab: 'Save', fn: saveMarkdown, hint: 'Ctrl/Cmd+S' },
    { sep: true },
    { lab: 'Close', fn: closeDocument }
  ] },
  { btn: 'mbEditBtn', menu: 'mbEditMenu', actions: [
    { lab: 'Undo', fn: editorUndo, hint: 'Ctrl/Cmd+Z' },
    { lab: 'Redo', fn: editorRedo, hint: 'Ctrl+Y \u00b7 Cmd+Shift+Z' }
  ] },
  { btn: 'mbViewBtn', menu: 'mbViewMenu', actions: LAYOUTS.map(function (k) {
      return { lab: LAYOUT_NAMES[k], fn: function () { setLayout(k); }, radio: k, id: 'layout-' + k };
    }).concat([
      { sep: true },
      { lab: 'Next layout', fn: function () { cycleLayout(1); }, hint: 'Ctrl/Cmd+]', pad: true },
      { lab: 'Previous layout', fn: function () { cycleLayout(-1); }, hint: 'Ctrl/Cmd+[', pad: true }
  ]) },
  { btn: 'mbFormatBtn', menu: 'mbFormatMenu', pickers: [
    { sel: 'docStyle',   label: 'Style' },
    { sel: 'headFont',   label: 'Header font' },
    { sel: 'bodyFont',   label: 'Body font' },
    { sel: 'codeFont',   label: 'Code font' },
    { sel: 'baseSize',   label: 'Base size' },
    { sel: 'lineHeight', label: 'Line height' }
  ] },
  { btn: 'mbSetupBtn', menu: 'mbSetupMenu', pickers: [
    { sel: 'pageSize', label: 'Page' },
    { sel: 'margin',   label: 'Margins' }
  ], actions: [
    { sep: true },
    { lab: 'Header/Footer', fn: openHfDialog, hint: 'Running header/footer' }
  ] },
  { btn: 'mbExportBtn', menu: 'mbExportMenu', actions: [
    { lab: 'PDF',  fn: printWhenFontsReady, hint: 'Ctrl/Cmd+P', id: 'exportBtn' },
    { lab: 'DOCX', fn: exportDocx, id: 'docxBtn', tip: 'Fonts are not kept in a DOCX; Word uses its own. For exact fonts, export a PDF.' }
  ] }
];
var mbRegistry = [];
var mbOpenIdx = -1;
var mbSub = null;                 /* { row, sel, menu, hover } while open */
var mbHoverTimer = null;

var CHEV_R = '<svg class="chev-r" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
var MB_CHECK = '<svg class="dd-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5"/></svg>';

function mbCloseSub() {
  if (!mbSub) { return; }
  if (mbSub.menu.parentNode) { mbSub.menu.parentNode.removeChild(mbSub.menu); }
  mbSub.row.setAttribute('aria-expanded', 'false');
  mbSub = null;
}
export function mbCloseAll() {
  if (mbOpenIdx < 0) { return; }
  mbCloseSub();
  var m = mbRegistry[mbOpenIdx];
  m.menu.hidden = true;
  m.btn.setAttribute('aria-expanded', 'false');
  mbOpenIdx = -1;
}
function mbItems(menu) {
  return Array.prototype.slice.call(menu.querySelectorAll('.dd-opt'));
}
function mbFocusItem(items, i) {
  if (!items.length) { return; }
  i = Math.max(0, Math.min(items.length - 1, i));
  items.forEach(function (o) { o.classList.remove('focus'); });
  items[i].classList.add('focus');
  items[i].focus();
}
function mbFocusedIndex(items) {
  for (var i = 0; i < items.length; i++) { if (items[i].classList.contains('focus')) { return i; } }
  return -1;
}
function mbMakeOptionBtn(sel, o) {
  var b = document.createElement('button');
  b.type = 'button';
  b.className = 'dd-opt';
  b.setAttribute('role', 'option');
  b.setAttribute('aria-selected', String(o.value === sel.value));
  b.dataset.value = o.value;
  b.innerHTML = MB_CHECK;
  if (o.dataset.paper) {
    var sw = document.createElement('span');
    sw.className = 'dd-sw';
    sw.style.background = o.dataset.paper;
    sw.style.color = o.dataset.text;
    sw.textContent = 'A';
    b.appendChild(sw);
  }
  var face = document.createElement('span');
  face.className = 'dd-face';
  if (o.dataset.bn) {
    face.textContent = o.textContent + ' \u2014 \u09AC\u09BE\u0982\u09B2\u09BE \u09B2\u09C7\u0996\u09BE';
    face.style.fontFamily = fontStack(o.value) || '';
  } else {
    face.textContent = o.textContent;
    var st = (sel.id === 'headFont' || sel.id === 'bodyFont' || sel.id === 'codeFont') ? fontStack(o.value) : null;
    if (st) { face.style.fontFamily = st; }
  }
  b.appendChild(face);
  return b;
}
function mbBuildOptions(menu, sel) {
  menu.textContent = '';
  var opts = Array.prototype.slice.call(sel.options);
  var grouped = opts.some(function (o) { return o.dataset.group; });
  var order = FONT_GROUPS.map(function (g) { return g.id; });
  var gidList = [];
  if (grouped) {
    var seen = {};
    opts.forEach(function (o) {
      var g = o.dataset.group || 'system';
      if (!seen[g]) { seen[g] = true; gidList.push(g); }
    });
    gidList.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
  }
  (grouped ? gidList : ['']).forEach(function (gid) {
    if (grouped) {
      var gl = FONT_GROUPS.filter(function (g) { return g.id === gid; })[0];
      var h = document.createElement('div');
      h.className = 'dd-group';
      h.textContent = gl ? gl.label : gid;
      menu.appendChild(h);
    }
    opts.forEach(function (o) {
      if (grouped && (o.dataset.group || 'system') !== gid) { return; }
      menu.appendChild(mbMakeOptionBtn(sel, o));
    });
  });
  var selBtn = menu.querySelector('.dd-opt[aria-selected="true"]');
  if (selBtn) { selBtn.classList.add('focus'); }
}
function mbOpenSub(row, pick, panel, ownerBtn, fromHover) {
  if (mbSub && mbSub.row === row) { mbSub.hover = !!fromHover; return; }
  clearTimeout(mbHoverTimer);
  mbCloseSub();
  var sel = document.getElementById(pick.sel);
  var menu = document.createElement('div');
  menu.className = 'dd-menu sub';
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', pick.label);
  mbBuildOptions(menu, sel);
  panel.appendChild(menu);
  menu.hidden = false;
  /* align with the row, then clamp: the list must stay inside the window */
  var top = row.offsetTop - 6;
  var h = menu.offsetHeight;
  if (top + h > window.innerHeight - 8) { top = Math.max(8, window.innerHeight - h - 8); }
  menu.style.top = top + 'px';
  row.setAttribute('aria-expanded', 'true');
  mbSub = { row: row, sel: sel, menu: menu, hover: !!fromHover };
  Array.prototype.forEach.call(menu.querySelectorAll('.dd-opt'), function (b) {
    b.addEventListener('click', function () {
      if (sel.value !== b.dataset.value) {
        sel.value = b.dataset.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
      mbCloseAll();
      ownerBtn.focus();
    });
  });
  var selBtn = menu.querySelector('.dd-opt[aria-selected="true"]');
  if (selBtn) { selBtn.focus(); }
}
/* one plain action row: label, optional shortcut hint, click runs fn */
function mbAppendAction(menu, a) {
  if (a.sep) {
    var s = document.createElement('div');
    s.className = 'dd-sep';
    menu.appendChild(s);
    return;
  }
  var b = document.createElement('button');
  b.type = 'button';
  b.className = 'dd-opt';
  b.setAttribute('role', 'menuitem');
  if (a.id) { b.id = a.id; }          /* stable ids for tests + docxBtn state */
  if (a.tip) { b.title = a.tip; }     /* hover text */
  if (a.radio !== undefined || a.pad) {
    /* a check column: ticked for the current choice, an empty slot keeps the labels aligned */
    b.innerHTML = MB_CHECK;
    if (a.radio !== undefined) {
      b.setAttribute('role', 'menuitemradio');
      b.setAttribute('aria-checked', String(splitDir === a.radio));
    }
  }
  var face = document.createElement('span');
  face.className = 'dd-face';
  face.textContent = a.lab;
  b.appendChild(face);
  if (a.hint) {
    var hnt = document.createElement('span');
    hnt.className = 'dd-hint';
    hnt.textContent = a.hint;
    b.appendChild(hnt);
  }
  b.addEventListener('click', function () {
    /* the item is about to be hidden: park focus on the menu button first,
       so a dialog the action opens remembers a live element to return to */
    var owner = mbOpenIdx >= 0 ? mbRegistry[mbOpenIdx].btn : null;
    mbCloseAll();
    if (owner) { owner.focus(); }
    a.fn();
  });
  menu.appendChild(b);
}
function mbBuildPanel(m) {
  var menu = m.menu;
  menu.textContent = '';
  mbCloseSub();
  if (m.def.pickers) {
    m.def.pickers.forEach(function (p) {
      var sel = document.getElementById(p.sel);
      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'dd-opt mrow';
      row.setAttribute('role', 'menuitem');
      row.setAttribute('aria-haspopup', 'menu');
      row.setAttribute('aria-expanded', 'false');
      row.__pick = p;
      var lab = document.createElement('span');
      lab.className = 'mrow-lab';
      lab.textContent = p.label;
      row.appendChild(lab);
      var val = document.createElement('span');
      val.className = 'mrow-val';
      val.textContent = ddLabel(sel);
      row.appendChild(val);
      row.insertAdjacentHTML('beforeend', CHEV_R);
      row.addEventListener('click', function (e) {
        e.stopPropagation();
        if (mbSub && mbSub.row === row && !mbSub.hover) { mbCloseSub(); row.focus(); }
        else { mbOpenSub(row, p, menu, m.btn, false); }
      });
      row.addEventListener('mouseenter', function () {
        clearTimeout(mbHoverTimer);
        mbHoverTimer = setTimeout(function () { mbOpenSub(row, p, menu, m.btn, true); }, 130);
      });
      row.addEventListener('mouseleave', function () { clearTimeout(mbHoverTimer); });
      menu.appendChild(row);
    });
  }
  if (m.def.actions) {
    m.def.actions.forEach(function (a) { mbAppendAction(menu, a); });
  }
}
function mbOpen(idx) {
  if (ddOpenIdx >= 0) { ddClose(); }
  mbCloseAll();
  var m = mbRegistry[idx];
  mbBuildPanel(m);
  m.menu.hidden = false;
  m.btn.setAttribute('aria-expanded', 'true');
  mbOpenIdx = idx;
  mbFocusItem(mbItems(m.menu), 0);
}
function mbToggle(idx) {
  if (mbOpenIdx === idx) { mbCloseAll(); } else { mbOpen(idx); }
}
function mbPanelKeys(e, idx) {
  var m = mbRegistry[idx];
  var items = mbItems(m.menu);
  var i = mbFocusedIndex(items);
  var handled = true;
  if (e.key === 'ArrowDown') { e.preventDefault(); mbFocusItem(items, i + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); mbFocusItem(items, i - 1); }
  else if (e.key === 'Home') { e.preventDefault(); mbFocusItem(items, 0); }
  else if (e.key === 'End') { e.preventDefault(); mbFocusItem(items, items.length - 1); }
  else if (e.key === 'ArrowRight') {
    var row = document.activeElement;
    if (row && row.classList.contains('mrow')) { e.preventDefault(); mbOpenSub(row, row.__pick, m.menu, m.btn, false); }
  }
  else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    var tgt = items[Math.max(i, 0)];
    if (tgt) { tgt.click(); }
  }
  else if (e.key === 'Escape') {
    e.preventDefault();
    if (mbSub) { var row2 = mbSub.row; mbCloseSub(); row2.focus(); }
    else { mbCloseAll(); m.btn.focus(); }
  }
  else if (e.key === 'Tab') { mbCloseAll(); }
  else { handled = false; }
  if (handled) { e.stopPropagation(); }
}
function mbSubKeys(e) {
  if (!mbSub) { return; }
  var opts = Array.prototype.slice.call(mbSub.menu.querySelectorAll('.dd-opt'));
  var i = mbFocusedIndex(opts);
  var handled = true;
  if (e.key === 'ArrowDown') { e.preventDefault(); mbFocusItem(opts, i + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); mbFocusItem(opts, i - 1); }
  else if (e.key === 'Home') { e.preventDefault(); mbFocusItem(opts, 0); }
  else if (e.key === 'End') { e.preventDefault(); mbFocusItem(opts, opts.length - 1); }
  else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    var tgt = opts[Math.max(i, 0)];
    if (tgt) { tgt.click(); }
  }
  else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    var row = mbSub.row;
    mbCloseSub();
    row.focus();
  }
  else if (e.key === 'Tab') { mbCloseAll(); }
  else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    /* simple type-ahead over the option labels */
    var ch = e.key.toLowerCase();
    var start = i + 1;
    for (var k = 0; k < opts.length; k++) {
      var j = (start + k) % opts.length;
      var t = (opts[j].textContent || '').trim().toLowerCase();
      if (t.indexOf(ch) === 0) { mbFocusItem(opts, j); break; }
    }
  }
  else { handled = false; }
  if (handled) { e.stopPropagation(); }
}
export function initMenubar() {
  MB_MENUS.forEach(function (def) {
    mbRegistry.push({
      btn: document.getElementById(def.btn),
      menu: document.getElementById(def.menu),
      def: def
    });
  });
  mbRegistry.forEach(function (m, idx) {
    m.btn.addEventListener('click', function (e) {
      e.stopPropagation();
      mbToggle(idx);
    });
    m.btn.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        mbOpen(idx);
      }
    });
    m.menu.addEventListener('keydown', function (e) {
      if (mbSub && mbSub.menu.contains(e.target)) { mbSubKeys(e); }
      else { mbPanelKeys(e, idx); }
    });
  });
  /* click-outside closes the open panel (submenus live inside it) */
  document.addEventListener('click', function (e) {
    if (mbOpenIdx < 0) { return; }
    var m = mbRegistry[mbOpenIdx];
    if (m.menu.contains(e.target) || m.btn.contains(e.target)) { return; }
    mbCloseAll();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || mbOpenIdx < 0) { return; }
    if (mbSub) { var row = mbSub.row; mbCloseSub(); row.focus(); }
    else { var m = mbRegistry[mbOpenIdx]; mbCloseAll(); m.btn.focus(); }
  });
}