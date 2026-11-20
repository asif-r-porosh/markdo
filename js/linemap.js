/* linemap.js - source-line map: marked tokens to line ranges (scroll sync) */
import { MD } from './constants.js';

/* ---------------------------------- source-line map (scroll sync) ---- */
/* marked tokens carry no offsets, so every token's `raw` is re-aligned
   against the source text: each token gets its absolute [l0, l1]
   source-line range. The ranges are stamped onto rendered elements as
   data-l0 / data-l1 and, after pagination, onto every .blk wrapper,
   giving the paginated preview a line-accurate coordinate system. */
export function stampNode(node, l0, l1) {
  if (!node || node.nodeType !== 1 || !(l0 >= 1)) { return; }
  node.setAttribute('data-l0', String(l0));
  node.setAttribute('data-l1', String(Math.max(l0, l1 || l0)));
}

function alignToks(toks, src, startPos) {
  /* assign absolute char + line ranges to a token list; recurse into the
     nested block tokens that pagination can split (items, quotes) */
  var pos = startPos;
  var i;
  for (i = 0; i < toks.length; i++) {
    var t = toks[i];
    if (!t || typeof t.raw !== 'string') { continue; }
    var idx = src.indexOf(t.raw, pos);
    if (idx < 0) { idx = pos; }
    t.c0 = idx;
    pos = idx + t.raw.length;
  }
  var starts = null;
  function lineAt(ci) {
    if (!starts) {
      starts = [0];
      for (var k = 0; k < src.length; k++) {
        if (src.charCodeAt(k) === 10) { starts.push(k + 1); }
      }
    }
    var lo = 0;
    var hi = starts.length - 1;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= ci) { lo = mid; } else { hi = mid - 1; }
    }
    return lo;
  }
  for (i = 0; i < toks.length; i++) {
    var t2 = toks[i];
    if (!t2 || typeof t2.raw !== 'string') { t2.space = true; continue; }
    t2.l0 = lineAt(t2.c0) + 1;
    t2.l1 = lineAt(Math.max(t2.c0, t2.c0 + t2.raw.length - 1)) + 1;
    t2.space = (t2.type === 'space');
    t2.void = (t2.type === 'def');
    if (t2.space || t2.void) { continue; }
    if (t2.type === 'list' && t2.items && t2.items.length) { alignToks(t2.items, src, t2.c0); }
    if (t2.type === 'list_item' && t2.tokens && t2.tokens.length) { alignToks(t2.tokens, src, t2.c0); }
    if (t2.type === 'blockquote' && t2.tokens && t2.tokens.length) { alignToks(t2.tokens, src, t2.c0); }
    if (t2.type === 'table') {
      /* GFM tables are strictly one source line per row:
         raw = [header, delimiter, body...] */
      var rl = t2.raw.split('\n');
      var sep = rl.length > 1 && /^[\s|:\-+]+$/.test(rl[1]);
      t2.rowStart = t2.l0 + (sep ? 2 : 1);
    }
    if (t2.type === 'code') {
      var fenced = /^\s*(```|~~~)/.test(t2.raw);
      t2.codeRange = fenced
        ? { l0: t2.l0 + 1, l1: Math.max(t2.l0, t2.l1 - 1) }
        : { l0: t2.l0, l1: t2.l1 };
    }
  }
  return toks;
}

export function buildLineMap(src) {
  var lex = (MD && typeof MD.lexer === 'function') ? MD.lexer
    : (MD && MD.marked && typeof MD.marked.lexer === 'function') ? MD.marked.lexer : null;
  if (!lex) { return null; }
  var toks;
  try { toks = lex(src, { gfm: true }); } catch (e) { return null; }
  if (!toks || !toks.length) { return null; }
  return alignToks(toks, src, 0);
}

function matchChildren(container, toks) {
  /* pair an element's children with a token list, stamping each pair */
  if (!container || !toks || !toks.length) { return; }
  var ti = 0;
  var kids = container.children;
  for (var i = 0; i < kids.length; i++) {
    var kid = kids[i];
    while (ti < toks.length && (toks[ti].space || toks[ti].void)) { ti++; }
    if (ti >= toks.length) { break; }
    var t = toks[ti];
    ti++;
    stampNode(kid, t.l0, t.l1);
    stampDeep(kid, t);
  }
}

export function stampDeep(node, tok) {
  /* per-child refinement for the block types pagination can split */
  if (!node || node.nodeType !== 1 || !tok) { return; }
  var tag = node.tagName;
  if (tok.type === 'list' && tok.items && (tag === 'UL' || tag === 'OL')) {
    matchChildren(node, tok.items);
  } else if (tok.type === 'blockquote' && tok.tokens && tag === 'BLOCKQUOTE') {
    matchChildren(node, tok.tokens);
  } else if (tok.type === 'table' && tag === 'TABLE' && tok.rowStart) {
    var thead = node.querySelector('thead');
    if (thead && thead.rows.length) { stampNode(thead.rows[0], tok.l0, tok.l0); }
    var tb = node.querySelector('tbody');
    if (tb) {
      for (var i = 0; i < tb.rows.length; i++) {
        var ln = tok.rowStart + i;
        if (ln > tok.l1) { break; }
        stampNode(tb.rows[i], ln, ln);
      }
    }
  } else if (tok.type === 'code' && tok.codeRange && tag === 'PRE') {
    var ce = node.querySelector('code');
    if (ce) { stampNode(ce, tok.codeRange.l0, tok.codeRange.l1); }
  }
}