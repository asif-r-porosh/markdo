/* extract.js - turn rendered HTML into block entries, page-break markers */
import { LB_TEST, PB_TEST, TABLE_INTERNAL } from './constants.js';
import { el, isHeading } from './util.js';
import { stampDeep, stampNode } from './linemap.js';

/* ------------------------------------------------------- extraction ---- */
/* Turn rendered HTML into a flat list of block entries.
 * Entry shapes: { pb: true } for a manual break, { el: node, keep: bool }. */
export function extractBlocks(html, toks) {
  toks = toks || [];
  var t = document.createElement('template');
  t.innerHTML = html;
  var root = t.content;

  /* replace every pagebreak / linebreak comment with a marker element */
  var walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  var pbs = [], lbs = [];
  while (walker.nextNode()) {
    var c = walker.currentNode, ct = c.textContent || '';
    if (PB_TEST.test(ct)) { pbs.push(c); }
    else if (LB_TEST.test(ct)) { lbs.push(c); }
  }
  pbs.forEach(function (c) { c.parentNode.replaceChild(el('div', 'mdpb'), c); });
  lbs.forEach(function (c) { c.parentNode.replaceChild(el('div', 'mdlb'), c); });

  /* walk top-level nodes in lock-step with the source tokens, stamping
     each element with its source-line range (data-l0 / data-l1) */
  var ti = 0;
  function peekTok() {
    while (ti < toks.length && (toks[ti].space || toks[ti].void)) { ti++; }
    return ti < toks.length ? toks[ti] : null;
  }

  var out = [];
  Array.prototype.slice.call(root.childNodes).forEach(function (node) {
    if (node.nodeType === 3) {                 /* stray text */
      if (node.textContent.trim()) {
        var p = el('p');
        p.appendChild(node);
        var tk = peekTok();
        if (tk) { stampNode(p, tk.l0, tk.l1); }
        out.push.apply(out, hoist(p));
      }
      return;
    }
    if (node.nodeType !== 1) { return; }       /* drop leftover comments */
    if (node.classList && node.classList.contains('mdpb')) {
      if (peekTok()) { ti++; }                 /* consume the html token */
      out.push({ pb: true });                  /* standalone break marker */
      return;
    }
    if (node.classList && node.classList.contains('mdlb')) {
      if (peekTok()) { ti++; }                 /* one html token per marker line */
      out.push({ lb: true });                  /* standalone blank-line marker */
      return;
    }
    var tok = peekTok();
    if (tok) {
      stampNode(node, tok.l0, tok.l1);
      stampDeep(node, tok);
      ti++;
    }
    out.push.apply(out, hoist(node));
  });
  return out;
}

/* Flatten one top-level element into entries, splitting around any .mdpb
 * marker it contains (marker inside a table cell becomes a break after the
 * whole table; splitting inside tables would corrupt their structure). */
function hoist(node) {
  var m = node.querySelector ? node.querySelector('.mdpb') : null;
  if (!m) { return [{ el: node, keep: isHeading(node) }]; }

  var a = m;
  while (a.parentElement && a.parentElement !== node) { a = a.parentElement; }

  var n = m;
  var tableInternal = false;
  while (n && n !== a) {
    if (TABLE_INTERNAL.test(n.tagName)) { tableInternal = true; break; }
    n = n.parentElement;
  }
  if (tableInternal) {
    m.remove();
    return [{ el: node, keep: false }, { pb: true }];
  }

  var shell1 = node.cloneNode(false);
  var shell2 = node.cloneNode(false);
  var kids = Array.prototype.slice.call(node.childNodes);
  var idx = kids.indexOf(a);
  kids.slice(0, idx).forEach(function (k) { shell1.appendChild(k); });
  kids.slice(idx + 1).forEach(function (k) { shell2.appendChild(k); });

  var res = [];
  if (hasContent(shell1)) { res.push.apply(res, hoist(shell1)); }
  res.push({ pb: true });
  if (hasContent(shell2)) { res.push.apply(res, hoist(shell2)); }
  return res;
}

function hasContent(node) {
  return Array.prototype.some.call(node.childNodes, function (n) {
    return n.nodeType !== 3 || n.textContent.trim().length > 0;
  });
}