/* document.js - open/save/new/close, unsaved-changes guard, state loading */
import { $, editor, fileInput } from './dom.js';
import { docTitle } from './util.js';
import { LS_CFG, LS_DOC, LS_SAVED, MD_ACCEPT_TYPES } from './constants.js';
import { SAMPLE } from './sample.js';
import { readConfig, render, updateStatus } from './render.js';
import { applyCfgToControls, buildMarkdownWithSettings, parseSettingsComment, resetControlsToDefaults, stripSettingsComment, syncDocSettings } from './settings.js';

/* ------------------------------------------------------- file ops ---- */
var openHandle = null;    /* FileSystemFileHandle when the browser supports it */
var lastSavedSig = null;  /* signature of the editor content at the last save/open/new */
var lastSavedSnap = null; /* doc-level settings snapshot at the same moment */

/* Short signature of a text (length + 53-bit hash): enough to tell "same as
   the last save" without keeping a second copy of the document around. */
function sig(s) {
  var h1 = 0xdeadbeef, h2 = 0x41c6ce57, ch;
  for (var i = 0; i < s.length; i++) {
    ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return s.length + ':' + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/* Settings that belong to the document (they travel in the saved file's
   settings comment and are LOST on Close/New without a save). View prefs
   (zoom, theme, split, scrollsync) are deliberately excluded: they persist
   via mdpdf.cfg and are not part of the document itself. */
var DOC_SNAP_KEYS = ['size', 'margin', 'headFont', 'bodyFont', 'codeFont',
  'fontSize', 'lineHeight', 'docstyle', 'hf'];
function docSettingsSnap() {
  var cfg = readConfig(), out = {};
  DOC_SNAP_KEYS.forEach(function (k) { out[k] = cfg[k]; });
  return JSON.stringify(out);
}
/* The saved baseline also goes to localStorage, so a reload cannot make
   unsaved edits look saved. */
function setBaseline(text) {
  lastSavedSig = sig(text);
  lastSavedSnap = docSettingsSnap();
  try { localStorage.setItem(LS_SAVED, JSON.stringify({ sig: lastSavedSig, snap: lastSavedSnap })); }
  catch (e) { /* storage unavailable: in-memory only */ }
}

function beginOpen() {
  if (window.showOpenFilePicker) {
    window.showOpenFilePicker({ types: MD_ACCEPT_TYPES, excludeAcceptAllOption: false, multiple: false })
      .then(function (hs) {
        var h = hs && hs[0];
        if (!h) { return; }
        return h.getFile().then(function (f) {
          return f.text().then(function (t) { adoptMarkdown(t, h); });
        });
      })
      .catch(function (e) {
        if (e && e.name !== 'AbortError') { fileInput.click(); }
      });
  } else {
    fileInput.click();
  }
}
export function openDocument() { requestDocSwitch('open'); }

function saveName() {
  var t = docTitle(editor.value, 'markdown-document');
  return /\.md$/i.test(t) ? t : t + '.md';
}

function markSaved() {
  setBaseline(editor.value);
  updateStatus();
}

function downloadMarkdown(text, fname) {
  var b = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () {
    URL.revokeObjectURL(a.href);
    if (a.parentNode) { a.parentNode.removeChild(a); }
  }, 1500);
}

function writeToHandle(handle, text) {
  return handle.createWritable().then(function (w) {
    return w.write(new Blob([text], { type: 'text/markdown' })).then(function () { return w.close(); });
  });
}

function pickAndSave(text, fname, done) {
  function ok() { markSaved(); if (done) { done(true); } }
  if (window.showSaveFilePicker) {
    window.showSaveFilePicker({ suggestedName: fname, types: MD_ACCEPT_TYPES }).then(function (h) {
      openHandle = h;
      return writeToHandle(h, text).then(ok);
    }).catch(function (e) {
      if (!e || e.name !== 'AbortError') { downloadMarkdown(text, fname); ok(); }
      else if (done) { done(false); }          /* save cancelled: stay open */
    });
  } else {
    downloadMarkdown(text, fname);
    ok();
  }
}

export function saveMarkdown(done) {
  syncDocSettings();              /* the settings variable is the save source */
  var text = buildMarkdownWithSettings();
  var fname = saveName();
  render();                       /* persist + refresh; the pane stays clean */
  if (openHandle && openHandle.createWritable) {
    writeToHandle(openHandle, text).then(function () { markSaved(); if (done) { done(true); } })
      .catch(function () { pickAndSave(text, fname, done); });
  } else {
    pickAndSave(text, fname, done);
  }
}

export function adoptMarkdown(text, handle) {
  var cfg = parseSettingsComment(text);
  editor.value = stripSettingsComment(text);  /* header never enters the pane */
  if (cfg) { applyCfgToControls(cfg, true); }   /* the file's own settings win; the reader's view setup stays */
  else { resetControlsToDefaults(undefined, true); }     /* no header comment: document defaults */
  syncDocSettings();
  openHandle = handle || null;
  setBaseline(editor.value);
  render();
}

/* --------------------------------- unsaved-changes switch guard ------- */
/* New, Open and Close all replace or discard the current document. A
   clean document goes straight through; a dirty one gets the three-
   choice dialog (Save changes / Discard changes / Cancel) with wording
   that matches the action. 'Open' shows the file picker first and only
   replaces the pane when a file is actually adopted, so cancelling the
   picker never loses the dirty text. */
export var closeDialogEl = $('#closeDialog');
var closeDialogReturnFocus = null;
export var pendingSwitch = null;          /* 'close' | 'new' | 'open' */

export function isDocDirty() {
  /* content changed, or doc-level settings changed (page setup, typography,
     doc style, running header/footer) -- both would be lost on Close/New */
  if (lastSavedSig != null && sig(editor.value) !== lastSavedSig) { return true; }
  if (lastSavedSnap != null && docSettingsSnap() !== lastSavedSnap) { return true; }
  return false;
}
var SWITCH_MSG = {
  close: 'Save them before closing this document?',
  open: 'Save them before opening another file?',
  new: 'Save them before starting a new document?'
};
function requestDocSwitch(kind) {
  if (!isDocDirty()) { runDocSwitch(kind); return; }
  pendingSwitch = kind;
  $('#cdMsg').textContent = 'This document has changes that are not saved yet. ' +
    (SWITCH_MSG[kind] || '');
  closeDialogReturnFocus = document.activeElement;
  closeDialogEl.hidden = false;
  $('#closeCancel').focus();
}
export function runDocSwitch(kind) {
  if (kind === 'open') { beginOpen(); return; }
  closeToNew();                  /* 'close' and 'new' both hand over a fresh untitled document */
}
function closeToNew() {
  resetControlsToDefaults(undefined, true);
  syncDocSettings();
  editor.value = '';
  openHandle = null;
  setBaseline('');
  render();
  updateStatus();
}
export function hideCloseDialog() {
  closeDialogEl.hidden = true;
  pendingSwitch = null;
  if (closeDialogReturnFocus && closeDialogReturnFocus.focus) {
    closeDialogReturnFocus.focus();
  }
}
/* guarded entry points: the File menu, the shortcuts and tests all land here */
export function newDocument() { requestDocSwitch('new'); }
export function closeDocument() { requestDocSwitch('close'); }

export function loadState() {
  var doc = null;
  var cfg = null;
  try {
    doc = localStorage.getItem(LS_DOC);
    cfg = JSON.parse(localStorage.getItem(LS_CFG) || 'null');
  } catch (e) { /* ignore */ }
  /* defaults first, saved settings layered on top: the dropdowns would
     otherwise sit on their first option (the bundled Inter) and the
     documented defaults would never apply on a fresh session */
  resetControlsToDefaults(false);
  if (cfg) { applyCfgToControls(cfg); }
  var body = (doc != null) ? doc : SAMPLE;      /* an empty document is a document; only a first visit gets the sample */
  /* a settings header left by an older save takes precedence */
  var scfg = parseSettingsComment(body);
  if (scfg) {
    body = stripSettingsComment(body);    /* keep the header out of the pane */
    applyCfgToControls(scfg, true);
  }
  editor.value = body;
  syncDocSettings();
  /* the saved baseline survives a reload: edits made before it still count
     as unsaved. No stored baseline (first visit, older version) or a legacy
     settings header: what was just loaded is the baseline. */
  var base = null;
  try { base = JSON.parse(localStorage.getItem(LS_SAVED) || 'null'); } catch (e) { /* ignore */ }
  if (base && !scfg && typeof base.sig === 'string' && typeof base.snap === 'string') {
    lastSavedSig = base.sig;
    lastSavedSnap = base.snap;
  } else {
    setBaseline(editor.value);
  }
}