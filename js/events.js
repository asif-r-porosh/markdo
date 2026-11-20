/* events.js - editor and toolbar event wiring */
import { $, baseSizeSel, bodyFontSel, codeFontSel, docStyleSel, editor, fileInput, headFontSel, lineHeightSel, marginSel, pageSizeSel, pbBtn, saveBtn, zoomSel } from './dom.js';
import { fontStack } from './fonts.js';
import { render, scheduleRender } from './render.js';
import { applyCfgToControls, parseSettingsComment, stripSettingsComment } from './settings.js';
import { setDocStyle } from './docstyle.js';
import { adoptMarkdown, closeDialogEl, hideCloseDialog, pendingSwitch, runDocSwitch, saveMarkdown } from './document.js';
import { insertLinebreak, insertPagebreak } from './markers.js';
import { refreshHighlight } from './highlight.js';

/* ---------------------------------------------------------- events ---- */
editor.addEventListener('input', function () { refreshHighlight(); scheduleRender(); });
/* pasted text that begins with a settings header: absorb it silently so
   the comment block never appears inside the editor pane */
editor.addEventListener('paste', function (e) {
  var cd = e.clipboardData || window.clipboardData;
  if (!cd || !cd.getData) { return; }
  var t = '';
  try { t = cd.getData('text/plain') || ''; } catch (err) { return; }
  var cfg = parseSettingsComment(t);
  if (!cfg) { return; }                   /* ordinary paste: default handling */
  e.preventDefault();
  var body = stripSettingsComment(t);
  applyCfgToControls(cfg, true);
  editor.focus();
  var s = editor.selectionStart;
  var epos = editor.selectionEnd;
  var ok = false;
  try { ok = document.execCommand('insertText', false, body); } catch (err) { ok = false; }
  if (!ok) {
    editor.value = editor.value.slice(0, s) + body + editor.value.slice(epos);
    editor.selectionStart = editor.selectionEnd = s + body.length;
  }
  scheduleRender();
});
[pageSizeSel, marginSel, zoomSel, baseSizeSel, lineHeightSel].forEach(function (s) {
  s.addEventListener('change', function () { render(); });
});
/* the chosen face may still be downloading; re-paginate when it lands so
   page breaks match the real glyph metrics, not the fallback's */
[headFontSel, bodyFontSel, codeFontSel].forEach(function (s) {
  s.addEventListener('change', function () {
    render();
    if (document.fonts && document.fonts.load) {
      var stack = fontStack(s.value);
      if (stack) {
        document.fonts.load('16px ' + stack.split(',')[0].trim())
          .then(scheduleRender).catch(function () {});
      }
    }
  });
});
docStyleSel.addEventListener('change', function () {
  setDocStyle(docStyleSel.value);
  render();
});
pbBtn.addEventListener('click', insertPagebreak);
var lbBtn = $('#lbBtn');
lbBtn.addEventListener('click', insertLinebreak);
saveBtn.addEventListener('click', function () { saveMarkdown(); });
$('#closeCancel').addEventListener('click', hideCloseDialog);
$('#closeDiscard').addEventListener('click', function () {
  var kind = pendingSwitch || 'close';
  hideCloseDialog();
  runDocSwitch(kind);
});
$('#closeSave').addEventListener('click', function () {
  var kind = pendingSwitch || 'close';
  hideCloseDialog();
  saveMarkdown(function (saved) { if (saved) { runDocSwitch(kind); } });
});
closeDialogEl.addEventListener('click', function (e) {
  if (e.target === closeDialogEl) { hideCloseDialog(); }
});
closeDialogEl.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') { e.preventDefault(); hideCloseDialog(); }
  if (e.key === 'Tab') {
    var order = [$('#closeCancel'), $('#closeDiscard'), $('#closeSave')];
    var ci = order.indexOf(document.activeElement);
    if (e.shiftKey && ci <= 0) { e.preventDefault(); order[2].focus(); }
    else if (!e.shiftKey && (ci === order.length - 1 || ci === -1)) { e.preventDefault(); order[0].focus(); }
  }
});
fileInput.addEventListener('change', function () {
  var f = fileInput.files && fileInput.files[0];
  fileInput.value = '';           /* allow re-selecting the same file later */
  if (!f) { return; }
  f.text().then(function (t) { adoptMarkdown(t, null); }).catch(function () { /* ignore */ });
});