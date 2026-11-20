/* dropdowns.js - custom dropdown menus over the selects */
import { FONT_GROUPS, fontStack } from './fonts.js';
import { mbCloseAll } from './menubar.js';

/* ------------------------------------------- dropdown menus ---------- */
/* Custom Bootstrap-style menus over the real <select>s. The selects stay
   in the DOM as invisible state holders (.dd-src) so settings files,
   keyboard flows and tests keep working; the button + menu are the
   visible surface. Menus render section headers from each option's
   data-group, live font previews via fontStack(), a Bangla sample for
   the Bangla faces, and color swatches for the doc styles. */
var DD_IDS = ['zoom'];   /* the View menu; all other selects are driven by the menubar */
var ddRegistry = [];
export var ddOpenIdx = -1;

export function ddLabel(sel) {
  if (sel.id === 'zoom') { return 'View'; }   /* statusbar menu shows the section, not the value */
  var o = sel.options[sel.selectedIndex];
  return o ? o.textContent : '';
}
export function ddSyncAll() {
  ddRegistry.forEach(function (d) { d.val.textContent = ddLabel(d.sel); });
}
export function ddClose() {
  if (ddOpenIdx < 0) { return; }
  var d = ddRegistry[ddOpenIdx];
  d.menu.hidden = true;
  d.root.classList.remove('open');
  d.btn.setAttribute('aria-expanded', 'false');
  ddOpenIdx = -1;
}
function ddOptButtons(d) {
  return Array.prototype.slice.call(d.menu.querySelectorAll('.dd-opt'));
}
function ddFocus(d, i) {
  var opts = ddOptButtons(d);
  if (!opts.length) { return; }
  i = Math.max(0, Math.min(opts.length - 1, i));
  opts.forEach(function (o) { o.classList.remove('focus'); });
  opts[i].classList.add('focus');
  opts[i].focus();
}
function ddFocusedIndex(d) {
  var opts = ddOptButtons(d);
  for (var i = 0; i < opts.length; i++) {
    if (opts[i].classList.contains('focus')) { return i; }
  }
  return -1;
}
function ddPick(idx, value) {
  var d = ddRegistry[idx];
  if (d.sel.value !== value) {
    d.sel.value = value;
    d.sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  d.val.textContent = ddLabel(d.sel);
  ddClose();
  d.btn.focus();
}
function ddBuildMenu(idx) {
  var d = ddRegistry[idx];
  var sel = d.sel;
  d.menu.textContent = '';
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
      d.menu.appendChild(h);
    }
    opts.forEach(function (o) {
      if (grouped && (o.dataset.group || 'system') !== gid) { return; }
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'dd-opt';
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', String(o.value === sel.value));
      b.dataset.value = o.value;
      b.innerHTML = '<svg class="dd-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5"/></svg>';
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
      } else {
        face.textContent = o.textContent;
      }
      var st = (sel.id === 'headFont' || sel.id === 'bodyFont' || sel.id === 'codeFont')
        ? fontStack(o.value) : null;
      if (st) { face.style.fontFamily = st; }
      b.appendChild(face);
      b.addEventListener('click', function () { ddPick(idx, o.value); });
      d.menu.appendChild(b);
    });
  });
  /* land the keyboard on the selected option */
  var all = ddOptButtons(d);
  for (var i = 0; i < all.length; i++) {
    if (all[i].getAttribute('aria-selected') === 'true') { all[i].classList.add('focus'); break; }
  }
}
function ddOpen(idx) {
  ddClose();
  mbCloseAll();                        /* one popup open at a time */
  var d = ddRegistry[idx];
  ddBuildMenu(idx);
  d.menu.hidden = false;
  d.root.classList.add('open');
  d.btn.setAttribute('aria-expanded', 'true');
  ddOpenIdx = idx;
  var focusEl = d.menu.querySelector('.dd-opt.focus') || d.menu.querySelector('.dd-opt');
  if (focusEl) { focusEl.focus(); }
}
function ddMenuKeys(e, idx) {
  var d = ddRegistry[idx];
  var opts = ddOptButtons(d);
  var i = ddFocusedIndex(d);
  if (e.key === 'ArrowDown') { e.preventDefault(); ddFocus(d, i + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); ddFocus(d, i - 1); }
  else if (e.key === 'Home') { e.preventDefault(); ddFocus(d, 0); }
  else if (e.key === 'End') { e.preventDefault(); ddFocus(d, opts.length - 1); }
  else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    var el = opts[Math.max(i, 0)];
    if (el) { el.click(); }
  } else if (e.key === 'Tab') { ddClose(); }
  else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    /* simple type-ahead: jump to the next option starting with the key */
    var ch = e.key.toLowerCase();
    var start = i + 1;
    for (var k = 0; k < opts.length; k++) {
      var j = (start + k) % opts.length;
      var t = (opts[j].textContent || '').trim().toLowerCase();
      if (t.indexOf(ch) === 0) { ddFocus(d, j); break; }
    }
  }
}
export function buildDropdowns() {
  DD_IDS.forEach(function (id) {
    var sel = document.getElementById(id);
    if (!sel || sel.classList.contains('dd-src')) { return; }
    var ctl = sel.closest('.ctl');
    var root = document.createElement('span');
    root.className = 'dd';
    sel.parentNode.insertBefore(root, sel);
    root.appendChild(sel);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dd-btn';
    btn.id = id + 'Btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.title = sel.title || '';
    var val = document.createElement('span');
    val.className = 'dd-val';
    val.textContent = ddLabel(sel);
    btn.appendChild(val);
    btn.insertAdjacentHTML('beforeend',
      '<svg class="chev" viewBox="0 0 10 6" fill="none" stroke="currentColor" ' +
      'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M1 1l4 4 4-4"/></svg>');
    root.appendChild(btn);
    var menu = document.createElement('div');
    menu.className = 'dd-menu';
    menu.id = id + 'Menu';
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', sel.title || id);
    menu.hidden = true;
    root.appendChild(menu);
    sel.classList.add('dd-src');
    sel.setAttribute('tabindex', '-1');
    if (ctl) { ctl.classList.add('dd-armed'); }
    (function (idx) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (ddOpenIdx === idx) { ddClose(); } else { ddOpen(idx); }
      });
      btn.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault(); ddOpen(idx);
        }
      });
      menu.addEventListener('keydown', function (e) { ddMenuKeys(e, idx); });
      /* keep the button label in step with any change on the select
         (keyboard, settings load, tests driving select_option) */
      sel.addEventListener('change', function () {
        val.textContent = ddLabel(sel);
      });
    })(ddRegistry.length);
    ddRegistry.push({ sel: sel, root: root, btn: btn, val: val, menu: menu, id: id });
  });
  /* one menu open at a time; click-outside and Escape close it */
  document.addEventListener('click', function (e) {
    if (ddOpenIdx < 0) { return; }
    var d = ddRegistry[ddOpenIdx];
    if (!d.menu.contains(e.target) && !d.btn.contains(e.target)) { ddClose(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && ddOpenIdx >= 0) {
      var d = ddRegistry[ddOpenIdx];
      ddClose();
      d.btn.focus();
    }
  });
}