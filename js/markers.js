/* markers.js - insert page-break and line-break markers at the cursor */
import { editor } from './dom.js';
import { scheduleRender } from './render.js';

/* ------------------------------- marker insert (shared) ----------------
   Inserts <!--pagebreak--> / <!--linebreak--> at the cursor on a line of
   its own, framed by blank lines. One implementation, two markers. */
function insertMarkerAtCursor(MARK) {
  editor.focus();
  var s = editor.selectionStart;
  var epos = editor.selectionEnd;
  if (epos > s && document.execCommand) {
    document.execCommand('delete');   /* drop the selection */
  }
  var v = editor.value;
  s = editor.selectionStart;
  epos = editor.selectionEnd;

  /* pad so the marker sits on its own line inside a blank-line frame;
     stacked linebreak markers still count one blank line each */
  var padPre = '';
  if (s > 0) {
    if (v.slice(s - 2, s) === '\n\n') { padPre = ''; }
    else if (v.charAt(s - 1) === '\n') { padPre = '\n'; }
    else { padPre = '\n\n'; }
  }
  var padPost = '';
  if (epos < v.length) {
    if (v.slice(epos, epos + 2) === '\n\n') { padPost = ''; }
    else if (v.charAt(epos) === '\n') { padPost = '\n'; }
    else { padPost = '\n\n'; }
  }
  var ins = padPre + MARK + padPost;
  var caret = s + padPre.length + MARK.length;

  /* execCommand keeps the native undo stack; fall back to direct assign */
  var ok = false;
  try { ok = document.execCommand && document.execCommand('insertText', false, ins); } catch (err) { ok = false; }
  if (!ok) {
    editor.value = v.slice(0, s) + ins + v.slice(epos);
  }
  editor.selectionStart = editor.selectionEnd = caret;
  scheduleRender();
}
export function insertPagebreak() { insertMarkerAtCursor('<!--pagebreak-->'); }
export function insertLinebreak() { insertMarkerAtCursor('<!--linebreak-->'); }
/* Undo / Redo for the Edit menu: the browser's own history for the editor,
   so it is the same stack Ctrl/Cmd+Z uses and typing, markers and Tab edits
   are all in it. */
function editorHistory(cmd) {
  editor.focus();
  try { document.execCommand(cmd); } catch (err) { /* nothing to do */ }
  scheduleRender();
}
export function editorUndo() { editorHistory('undo'); }
export function editorRedo() { editorHistory('redo'); }
