/* shortcuts.js - global shortcuts, linked-scroll listeners, image relayout, resize */
import { $, editor, pagesEl, viewport } from './dom.js';
import { scheduleRender } from './render.js';
import { scheduleZoom } from './zoom.js';
import { onEditorScroll, onPreviewScroll, setSync, syncOn } from './scrollsync.js';
import { cycleTheme } from './theme.js';
import { openDocument, saveMarkdown } from './document.js';
import { printWhenFontsReady } from './export.js';
import { insertLinebreak, insertPagebreak } from './markers.js';

/* linked scrolling: toggle + the two scroll surfaces */
var syncBtnEl = $('#syncBtn');
if (syncBtnEl) { syncBtnEl.addEventListener('click', function () { setSync(!syncOn); }); }
editor.addEventListener('scroll', onEditorScroll, { passive: true });
viewport.addEventListener('scroll', onPreviewScroll, { passive: true });

document.addEventListener('keydown', function (e) {
  /* a dialog is open: save / open / print must not act on the document
     behind it (the browser's own versions are suppressed too) */
  if ((e.ctrlKey || e.metaKey) && /^[spo]$/i.test(e.key) && document.querySelector('.modal:not([hidden])')) {
    e.preventDefault();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
    e.preventDefault();
    printWhenFontsReady();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
    e.preventDefault();
    saveMarkdown();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'o' || e.key === 'O')) {
    e.preventDefault();
    openDocument();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
    e.preventDefault();
    cycleTheme();
    return;
  }
  /* Ctrl/Cmd+Enter inserts a page break, with Shift a line break (editor focus only) */
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key === 'Enter' && e.target === editor && !e.isComposing) {
    e.preventDefault();
    if (e.shiftKey) { insertLinebreak(); } else { insertPagebreak(); }
    return;
  }
  if (e.key === 'Tab' && e.target === editor) { editorTab(e); }
});

/* ---- Tab in the editor ---------------------------------------------------
   Tab inserts two spaces; with a selection it indents every touched line;
   Shift+Tab outdents. Edits go through the browser's own text insertion so
   Undo keeps working and a selection is never thrown away. Esc then Tab
   leaves the editor, so the keyboard is never trapped. */
var tabFree = false;
editor.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') { tabFree = true; }
  else if (e.key !== 'Tab') { tabFree = false; }
});
editor.addEventListener('blur', function () { tabFree = false; });

function replaceRange(from, to, text) {
  editor.setSelectionRange(from, to);
  var ok = false;
  try { ok = document.execCommand('insertText', false, text); } catch (err) { ok = false; }
  if (!ok) {                                   /* no undo step, but still correct */
    editor.setRangeText(text, from, to, 'end');
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function editorTab(e) {
  if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing) { return; }
  if (tabFree) { tabFree = false; return; }     /* Esc was pressed: let focus move on */
  e.preventDefault();
  var v = editor.value, s = editor.selectionStart, en = editor.selectionEnd;
  if (!e.shiftKey && s === en) { replaceRange(s, s, '  '); return; }

  var lineStart = v.lastIndexOf('\n', s - 1) + 1;
  var last = (en > s && v.charAt(en - 1) === '\n') ? en - 1 : en;   /* a selection ending after a newline stops before that line */
  var lineEnd = v.indexOf('\n', last);
  if (lineEnd < 0) { lineEnd = v.length; }
  var lines = v.slice(lineStart, lineEnd).split('\n');
  var firstDelta = 0, total = 0;
  var out = lines.map(function (l, i) {
    var d;
    if (!e.shiftKey) { d = l.length ? 2 : 0; l = l.length ? '  ' + l : l; }
    else { var m = /^( {1,2}|\t)/.exec(l); d = m ? -m[0].length : 0; l = m ? l.slice(m[0].length) : l; }
    if (i === 0) { firstDelta = d; }
    total += d;
    return l;
  });
  replaceRange(lineStart, lineEnd, out.join('\n'));
  var ns = Math.max(lineStart, s + firstDelta);
  var ne = Math.max(ns, en + total);
  editor.setSelectionRange(ns, s === en ? ns : ne);
}

/* relayout once late-loading images know their size */
pagesEl.addEventListener('load', function (e) {
  if (e.target && e.target.tagName === 'IMG' && !e.target.dataset.mdeCounted) {
    e.target.dataset.mdeCounted = '1';
    scheduleRender();
  }
}, true);

if (window.ResizeObserver) {
  new ResizeObserver(function () { scheduleZoom(); }).observe(viewport);
} else {
  window.addEventListener('resize', scheduleZoom);
}