/* highlight.js - minimal Markdown colouring for the editor.
   A coloured copy of the text sits behind the (transparent-text) textarea,
   so typing, selection, undo and scrolling stay entirely native. Colour
   only: no weight, italic or size changes, so both layers always wrap
   identically. If the two layers ever disagree on height (an engine
   quirk), the overlay switches itself off and the plain text shows. */
import { editor } from './dom.js';

var MAX_CHARS = 300000;   /* beyond this the overlay is skipped */
var pane = editor.parentNode;
var hl = document.createElement('pre');
hl.id = 'editorHl';
hl.setAttribute('aria-hidden', 'true');
pane.insertBefore(hl, editor);

var lastValue = null;
var lastSb = -1;

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function span(cls, s) { return '<span class="hl-' + cls + '">' + esc(s) + '</span>'; }

var INLINE = /(`[^`\n]+`)|(!?\[[^\]\n]*\]\([^)\n]*\))|(\*\*|__)(?=\S)(.+?)\3|\*(?=[^\s*])([^*\n]+?)\*|(<!--.*?-->)/g;

function inline(text) {
  var out = '';
  var last = 0;
  var m;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(text)) !== null) {
    out += esc(text.slice(last, m.index));
    if (m[1]) { out += span('code', m[1]); }
    else if (m[2]) { out += span('link', m[2]); }
    else if (m[3]) { out += span('mk', m[3]) + esc(m[4]) + span('mk', m[3]); }
    else if (m[5] !== undefined) { out += span('mk', '*') + esc(m[5]) + span('mk', '*'); }
    else { out += span(/pagebreak|linebreak/i.test(m[6]) ? 'pb' : 'cm', m[6]); }
    last = m.index + m[0].length;
    if (m[0].length === 0) { INLINE.lastIndex++; }
  }
  return out + esc(text.slice(last));
}

var FENCE = /^\s{0,3}(```|~~~)/;
var HEADING = /^\s{0,3}#{1,6}(\s|$)/;
var HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
var TABLE_SEP = /^\s*\|?[\s:|-]+\|[\s:|-]*$/;
var QUOTE = /^\s{0,3}(?:>\s?)+/;
var LIST = /^\s*(?:[-*+]|\d{1,9}[.)])\s+(?:\[[ xX]\]\s+)?/;

function line(s, st) {
  var f = FENCE.exec(s);
  if (st.fence) {
    if (f && f[1] === st.fence) { st.fence = ''; }
    return s ? span('code', s) : '';
  }
  if (f) { st.fence = f[1]; return span('code', s); }
  if (HEADING.test(s)) { return span('head', s); }
  if (HR.test(s) || TABLE_SEP.test(s)) { return span('mk', s); }
  var m = QUOTE.exec(s) || LIST.exec(s);
  var head = '';
  if (m) { head = span('mk', m[0]); s = s.slice(m[0].length); }
  if (/\|/.test(s) && /^\s*\|/.test(s)) {
    return head + s.split('|').map(inline).join(span('mk', '|'));
  }
  return head + inline(s);
}

function paint(v) {
  var st = { fence: '' };
  var rows = v.split('\n');
  for (var i = 0; i < rows.length; i++) { rows[i] = line(rows[i], st); }
  /* a trailing newline gives the textarea an extra empty line; mirror it */
  hl.innerHTML = rows.join('\n') + (v.charAt(v.length - 1) === '\n' ? ' ' : '');
}

function off() {
  pane.classList.remove('hl');
  hl.textContent = '';
  lastValue = null;
}

export function refreshHighlight() {
  var v = editor.value;
  if (v.length > MAX_CHARS) { off(); return; }
  var sb = Math.max(0, editor.offsetWidth - editor.clientWidth);
  if (v === lastValue && sb === lastSb && pane.classList.contains('hl')) {
    hl.scrollTop = editor.scrollTop;
    return;
  }
  pane.classList.add('hl');            /* shown first so it can be measured */
  hl.style.right = sb + 'px';
  paint(v);
  lastValue = v;
  lastSb = sb;
  if (Math.abs(hl.scrollHeight - editor.scrollHeight) > 2) { off(); return; }
  hl.scrollTop = editor.scrollTop;
}

editor.addEventListener('scroll', function () { hl.scrollTop = editor.scrollTop; }, { passive: true });
if (typeof ResizeObserver === 'function') {
  new ResizeObserver(function () { lastSb = -1; refreshHighlight(); }).observe(editor);
}
