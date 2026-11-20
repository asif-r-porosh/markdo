/* paginate.js - measurement-based paginator and block flows (paragraph, list, table, code, container) */
import { pagesEl } from './dom.js';
import { MIN_LINE, VOID_KEEP } from './constants.js';
import { el, isHeading } from './util.js';

/* ------------------------------------------------------- pagination ---- */
var cur = null;            /* { page, content, remaining, count } */
var contentH = 0;
var contentW = 0;
var holderStack = [];      /* open split containers: [{ create, _el, _w }] */

function newPage() {
  var page = el('div', 'page');
  var content = el('div', 'page-content');
  page.appendChild(content);
  pagesEl.appendChild(page);
  cur = { page: page, content: content, remaining: content.clientHeight, count: 0 };
  holderStack.forEach(attachHolder);
}

function attachHolder(f) {
  var pos = holderStack.indexOf(f);
  var parent = pos > 0 ? holderStack[pos - 1]._el : cur.content;
  var inner = f.create();
  var w = el('div', 'blk');
  w.appendChild(inner);
  parent.appendChild(w);
  cur.remaining -= w.offsetHeight;
  cur.count += 1;
  f._el = inner;
  f._w = w;
}

function holder() {
  return holderStack.length ? holderStack[holderStack.length - 1]._el : cur.content;
}

/* Headings that were just placed with nothing after them on their page
   (consecutive ones included). When the text that belongs to them then
   starts on the next page, they move along: no heading is ever left alone
   at the bottom of a page. A manual page break is the author's choice and
   keeps them where they are. */
var tail = [];

function breakPage(manual) {
  var moved = [];
  if (!manual && tail.length && !holderStack.length) {
    var kids = cur.content.children, i = kids.length - 1;
    while (i >= 0 && tail.indexOf(kids[i]) >= 0) { moved.unshift(kids[i]); i--; }
    if (i < 0) { moved = []; }              /* the page holds only headings: nothing to rescue */
  }
  var drop = 0;
  moved.forEach(function (w) { drop += w.offsetHeight; cur.content.removeChild(w); });
  cur.remaining += drop;
  cur.count -= moved.length;
  newPage();
  moved.forEach(function (w) {
    cur.content.appendChild(w);
    cur.remaining -= w.offsetHeight;
    cur.count += 1;
  });
  tail = moved;
}

function wrapBlk(node) {
  var w = el('div', 'blk');
  w.appendChild(node);
  return w;
}

/* Best source-line range for a block node: its own stamps, else the range
   spanned by its first/last stamped descendants (split pieces, shells). */
export function blkRange(node) {
  if (!node || node.nodeType !== 1) { return null; }
  var a = parseInt(node.getAttribute('data-l0'), 10);
  var b = parseInt(node.getAttribute('data-l1'), 10);
  if (a >= 1) { return [a, b >= a ? b : a]; }
  if (!node.querySelector) { return null; }
  var f = node.querySelector('[data-l0]');
  if (!f) { return null; }
  var all = node.querySelectorAll('[data-l1]');
  var l = all[all.length - 1];
  var a2 = parseInt(f.getAttribute('data-l0'), 10);
  var b2 = parseInt(l.getAttribute('data-l1'), 10);
  if (a2 >= 1) { return [a2, b2 >= a2 ? b2 : a2]; }
  return null;
}

function measureEl(node) {
  var w = wrapBlk(node);
  holder().appendChild(w);
  var h = w.offsetHeight;
  w.parentNode.removeChild(w);
  return h;
}

function place(node) {
  var w = wrapBlk(node);
  holder().appendChild(w);
  var h = w.offsetHeight;
  if (h <= cur.remaining + 0.5) {
    cur.remaining -= h;
    cur.count += 1;
    return w;
  }
  w.parentNode.removeChild(w);
  breakPage();
  holder().appendChild(w);
  cur.remaining -= w.offsetHeight;
  cur.count += 1;
  return w;
}

export function paginate(blocks) {
  pagesEl.innerHTML = '';
  holderStack.length = 0;
  tail = [];
  newPage();
  contentW = cur.content.clientWidth;
  contentH = cur.content.clientHeight;
  var minAfter = Math.max(56, contentH * 0.10);

  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i];
    if (b.pb) {
      if (cur.count > 0) { breakPage(true); }
      continue;
    }
    if (b.lb) {
      place(el('div', 'mdlb'));                /* one blank line of body text */
      continue;
    }
    var node = b.el;
    if (isHeading(node)) {
      var h = measureEl(node);
      var nextEl = null;
      for (var j = i + 1; j < blocks.length; j++) {
        if (blocks[j].pb) { break; }
        nextEl = blocks[j].el;
        break;
      }
      var nh = nextEl ? measureEl(nextEl) : 0;
      if (h + Math.min(nh, minAfter) > cur.remaining && h <= contentH) { breakPage(); }
      var hw = place(node);
      if (hw.parentNode === cur.content) { tail.push(hw); }
    } else {
      flow(node);
    }
  }

  /* drop a trailing empty page (document ended with a break marker) */
  if (cur && cur.count === 0 && pagesEl.children.length > 1) {
    pagesEl.removeChild(cur.page);
  }
  if (!pagesEl.children.length) { newPage(); }
}

/* dispatch one block into the current page flow */
function flow(node) {
  var tag = node.tagName;
  if (tag === 'P') { flowWords(node); return; }
  if (tag === 'UL' || tag === 'OL') { flowList(node); return; }
  if (tag === 'TABLE') { flowTable(node); return; }
  if (tag === 'PRE') { flowPre(node); return; }
  if (tag === 'BLOCKQUOTE' || tag === 'DIV' || tag === 'SECTION' || tag === 'ASIDE' || tag === 'DETAILS') {
    flowContainer(node); return;
  }
  if (isHeading(node)) { place(node); return; }  /* headings nested in containers */
  place(node);                                    /* hr, figures, raw html ... */
}

/* ------------------------------------------------- paragraph flow ---- */
function countWords(node) {
  var w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  var total = 0;
  var t;
  while ((t = w.nextNode())) {
    total += (t.textContent.match(/\S+/g) || []).length;
  }
  return total;
}

function flowWords(p) {
  var node = p;
  var guard = 0;
  while (node && guard++ < 10000) {
    var total = countWords(node);
    var whole = measureEl(node);
    if (whole <= cur.remaining + 0.5) { place(node); return; }
    if (whole <= contentH) { breakPage(); place(node); return; }
    if (total === 0) { place(node); return; }          /* e.g. image-only paragraph */
    if (cur.remaining < MIN_LINE) { breakPage(); continue; }
    var k = largestFit(node, total);
    if (k <= 0) { breakPage(); continue; }
    if (k >= total) { place(node); return; }
    var part = cloneWithWords(node, k);
    var w = wrapBlk(part);
    holder().appendChild(w);
    cur.remaining -= w.offsetHeight;
    cur.count += 1;
    node = cloneSkipWords(node, k);
  }
}

function largestFit(node, total) {
  var lo = 0;
  var hi = total;
  while (lo < hi) {
    var mid = (lo + hi + 1) >> 1;
    var part = cloneWithWords(node, mid);
    var w = wrapBlk(part);
    holder().appendChild(w);
    var h = w.offsetHeight;
    w.parentNode.removeChild(w);
    if (h <= cur.remaining + 0.5) { lo = mid; } else { hi = mid - 1; }
  }
  return lo;
}

/* Deep-clone `node` keeping only the first `k` word units (unit = \S+),
 * cutting cleanly through inline markup. */
function cloneWithWords(node, k) {
  var c = node.cloneNode(true);
  var w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
  var acc = 0;
  var t;
  var cutNode = null;
  var cutIdx = 0;
  while ((t = w.nextNode())) {
    var units = t.textContent.match(/\S+/g) || [];
    if (acc + units.length <= k) { acc += units.length; continue; }
    var need = k - acc;
    if (need <= 0) {
      cutNode = t; cutIdx = 0;
    } else {
      var re = /\S+/g;
      var m;
      var i2 = 0;
      while ((m = re.exec(t.textContent))) {
        if (i2 === need) { cutIdx = m.index; break; }
        i2++;
      }
      cutNode = t;
    }
    break;
  }
  if (cutNode) {
    cutNode.textContent = cutNode.textContent.slice(0, cutIdx).replace(/\s+$/, '');
    var n = cutNode;
    while (n && n !== c) {
      var s = n.nextSibling;
      while (s) {
        var nx = s.nextSibling;
        s.parentNode.removeChild(s);
        s = nx;
      }
      n = n.parentNode;
    }
    if (!cutNode.textContent) {
      cutNode.parentNode && cutNode.parentNode.removeChild(cutNode);
    }
    /* prune elements left completely empty by the cut */
    var all = Array.prototype.slice.call(c.querySelectorAll('*'));
    for (var z = all.length - 1; z >= 0; z--) {
      var e2 = all[z];
      if (VOID_KEEP.test(e2.tagName)) { continue; }
      if (!e2.textContent.trim() && !e2.querySelector('img,br,hr,svg,canvas,input')) {
        e2.parentNode && e2.parentNode.removeChild(e2);
      }
    }
  }
  return c;
}

/* Deep-clone `node` dropping the first `k` word units, keeping the rest
 * (the continuation part of a split paragraph). */
function cloneSkipWords(node, k) {
  var c = node.cloneNode(true);
  if (k <= 0) { return c; }
  var w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
  var acc = 0;
  var t;
  var cutNode = null;
  var cutIdx = 0;
  while ((t = w.nextNode())) {
    var units = t.textContent.match(/\S+/g) || [];
    if (acc + units.length <= k) { acc += units.length; continue; }
    var need = k - acc;                  /* units to drop inside this node */
    var re = /\S+/g;
    var m;
    var i2 = 0;
    while ((m = re.exec(t.textContent))) {
      if (i2 === need) { break; }
      i2++;
    }
    cutNode = t;
    cutIdx = m ? m.index : t.textContent.length;   /* keep from unit #need on */
    break;
  }
  if (cutNode) {
    cutNode.textContent = cutNode.textContent.slice(cutIdx).replace(/^\s+/, '');
    var n = cutNode;
    while (n && n !== c) {
      var p = n.previousSibling;
      while (p) {
        var pv = p.previousSibling;
        p.parentNode.removeChild(p);
        p = pv;
      }
      n = n.parentNode;
    }
    if (!cutNode.textContent) {
      cutNode.parentNode && cutNode.parentNode.removeChild(cutNode);
    }
    var all = Array.prototype.slice.call(c.querySelectorAll('*'));
    for (var z = all.length - 1; z >= 0; z--) {
      var e2 = all[z];
      if (VOID_KEEP.test(e2.tagName)) { continue; }
      if (!e2.textContent.trim() && !e2.querySelector('img,br,hr,svg,canvas,input')) {
        e2.parentNode && e2.parentNode.removeChild(e2);
      }
    }
  }
  return c;
}

/* ------------------------------------------------------- list flow ---- */
function flowList(node) {
  var items = Array.prototype.filter.call(node.children, function (n) { return n.tagName === 'LI'; });
  if (!items.length) { place(node); return; }
  var isOl = node.tagName === 'OL';
  var base = parseInt(node.getAttribute('start'), 10);   /* a list that starts at 5 continues 5, 6, 7 on the next page */
  if (!(base === base)) { base = 1; }
  var idx = 0;
  var f = {
    create: function () {
      var l = node.cloneNode(false);
      while (l.firstChild) { l.removeChild(l.firstChild); }
      if (isOl) { l.setAttribute('start', String(base + idx)); }
      return l;
    }
  };
  holderStack.push(f);
  attachHolder(f);
  var prev = f._w.offsetHeight;
  var retried = false;

  while (idx < items.length) {
    f._el.appendChild(items[idx]);
    var h = f._w.offsetHeight;
    if (h <= cur.remaining + 0.5) {
      cur.remaining -= (h - prev);
      prev = h;
      idx += 1;
      retried = false;
      continue;
    }
    items[idx].parentNode && items[idx].parentNode.removeChild(items[idx]);
    if (f._el.children.length > 0) {
      breakPage();                    /* newPage re-attaches f on the new page */
      prev = f._w.offsetHeight;
      continue;
    }
    /* fresh page, still does not fit */
    if (retried) {
      f._el.appendChild(items[idx]);          /* single item bigger than a page: clip */
      var h2 = f._w.offsetHeight;
      cur.remaining -= (h2 - prev);
      prev = h2;
      idx += 1;
      retried = false;
      continue;
    }
    var li = items[idx];
    var liH = measureIn(li, f._el);
    if (liH > contentH) {
      idx += 1;
      var fLi = {
        create: function () {
          var c = li.cloneNode(false);
          while (c.firstChild) { c.removeChild(c.firstChild); }
          return c;
        }
      };
      holderStack.push(fLi);
      attachHolder(fLi);
      Array.prototype.slice.call(li.childNodes).forEach(function (k2) {
        if (k2.nodeType === 3) {
          if (k2.textContent.trim()) {
            var p = el('p');
            p.appendChild(k2);
            flowWords(p);
          }
        } else {
          flow(k2);
        }
      });
      holderStack.pop();
      continue;
    }
    retried = true;
    breakPage();                    /* newPage re-attaches f on the new page */
    prev = f._w.offsetHeight;
  }
  holderStack.pop();
}

function measureIn(node, holderEl) {
  var w = wrapBlk(node);
  holderEl.appendChild(w);
  var h = w.offsetHeight;
  w.parentNode.removeChild(w);
  return h;
}

/* ------------------------------------------------------ table flow ---- */
function flowTable(node) {
  var head = node.querySelector(':scope > thead');
  var caption = node.querySelector(':scope > caption');
  var rows = [];
  Array.prototype.forEach.call(node.children, function (child) {
    if (child.tagName === 'TBODY' || child.tagName === 'TFOOT') {
      Array.prototype.forEach.call(child.children, function (tr) {
        if (tr.tagName === 'TR') { rows.push(tr); }
      });
    } else if (child.tagName === 'TR') {
      rows.push(child);
    }
  });
  if (!rows.length) { place(node); return; }

  /* a table that fits one page is never split: it goes whole to the next
     page when the rest of this one is too short (only taller tables flow
     row by row, with the header repeated) */
  var whole = measureEl(node);
  if (whole <= cur.remaining + 0.5) { place(node); return; }
  if (whole <= contentH) { breakPage(); place(node); return; }

  var firstPiece = true;
  var f = {
    create: function () {
      var t = node.cloneNode(false);
      while (t.firstChild) { t.removeChild(t.firstChild); }
      if (caption && firstPiece) { t.appendChild(caption.cloneNode(true)); }
      if (head) { t.appendChild(head.cloneNode(true)); }
      t.appendChild(el('tbody'));
      return t;
    }
  };
  holderStack.push(f);
  attachHolder(f);
  var prev = f._w.offsetHeight;
  var i = 0;
  var retried = false;

  while (i < rows.length) {
    f._el.tBodies[0].appendChild(rows[i]);
    var h = f._w.offsetHeight;
    if (h <= cur.remaining + 0.5) {
      cur.remaining -= (h - prev);
      prev = h;
      i += 1;
      retried = false;
      continue;
    }
    rows[i].parentNode.removeChild(rows[i]);
    if (f._el.tBodies[0].children.length > 0) {
      firstPiece = false;
      breakPage();                  /* newPage re-attaches f on the new page */
      prev = f._w.offsetHeight;
      continue;
    }
    if (retried) {   /* single row taller than a page: clip it */
      f._el.tBodies[0].appendChild(rows[i]);
      var h2 = f._w.offsetHeight;
      cur.remaining -= (h2 - prev);
      prev = h2;
      i += 1;
      retried = false;
      continue;
    }
    retried = true;
    breakPage();                    /* newPage re-attaches f on the new page */
    prev = f._w.offsetHeight;
  }
  holderStack.pop();
}

/* -------------------------------------------------- code block flow ---- */
function flowPre(node) {
  var code = node.querySelector('code');
  if (!code) { place(node); return; }
  var whole = measureEl(node);
  if (whole <= cur.remaining + 0.5) { place(node); return; }
  if (whole <= contentH) { breakPage(); place(node); return; }

  var text = code.textContent.replace(/\n$/, '');
  var lines = text.split('\n');
  var lang = Array.prototype.filter.call(code.classList, function (c) { return c.indexOf('language-') === 0; });
  var clBase = parseInt(code.getAttribute('data-l0') || '0', 10) || 0;

  var f = {
    create: function () {
      var p = node.cloneNode(false);
      while (p.firstChild) { p.removeChild(p.firstChild); }
      var c2 = el('code');
      lang.forEach(function (x) { c2.classList.add(x); });
      p.appendChild(c2);
      return p;
    }
  };
  holderStack.push(f);
  attachHolder(f);
  var prev = f._w.offsetHeight;
  var i = 0;
  var retried = false;
  while (i < lines.length) {
    var s = el('span', 'cl');
    s.textContent = lines[i].length ? lines[i] : ' ';
    if (clBase > 0) {
      s.setAttribute('data-l0', String(clBase + i));
      s.setAttribute('data-l1', String(clBase + i));
    }
    f._el.querySelector('code').appendChild(s);
    var h = f._w.offsetHeight;
    if (h <= cur.remaining + 0.5) {
      cur.remaining -= (h - prev);
      prev = h;
      i += 1;
      retried = false;
      continue;
    }
    s.parentNode && s.parentNode.removeChild(s);
    if (f._el.querySelector('code').children.length > 0) {
      breakPage();                  /* newPage re-attaches f on the new page */
      prev = f._w.offsetHeight;
      continue;
    }
    if (retried) {   /* single line longer than a page: clip */
      f._el.querySelector('code').appendChild(s);
      var h2 = f._w.offsetHeight;
      cur.remaining -= (h2 - prev);
      prev = h2;
      i += 1;
      retried = false;
      continue;
    }
    retried = true;
    breakPage();                    /* newPage re-attaches f on the new page */
    prev = f._w.offsetHeight;
  }
  holderStack.pop();
}

/* -------------------------------------------- container block flow ---- */
function flowContainer(node) {
  var kids = Array.prototype.filter.call(node.childNodes, function (n) {
    return n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim());
  });
  if (!kids.length) { place(node); return; }
  var whole = measureEl(node);
  if (whole <= cur.remaining + 0.5) { place(node); return; }
  if (whole <= contentH) { breakPage(); place(node); return; }

  var f = {
    create: function () {
      var c = node.cloneNode(false);
      while (c.firstChild) { c.removeChild(c.firstChild); }
      return c;
    }
  };
  holderStack.push(f);
  attachHolder(f);
  kids.forEach(function (k) {
    if (k.nodeType === 3) {
      var p = el('p');
      p.appendChild(k);
      flowWords(p);
    } else {
      flow(k);
    }
  });
  holderStack.pop();
}