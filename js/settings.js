/* settings.js - persistence, settings comment, config to/from controls */
import { baseSizeSel, bodyFontSel, codeFontSel, editor, headFontSel, lineHeightSel, marginSel, pageSizeSel, zoomSel } from './dom.js';
import { DEFAULT_BODY_FONT, DEFAULT_CODE_FONT, DEFAULT_HEAD_FONT, fontStack, resolveFont } from './fonts.js';
import { DEFAULT_DOC_STYLE, LH_RE, LS_CFG, LS_DOC, MARGIN_PRESETS, PAGE_SIZES, PT_RE, SETTINGS_RE } from './constants.js';
import { selectHas } from './util.js';
import { readConfig } from './render.js';
import { defaultHfCfg, hfCfg, legacyHf, normalizeHf, setHfCfg, syncHfMirrors } from './hf.js';
import { setSync } from './scrollsync.js';
import { setThemeChoice } from './theme.js';
import { setDocStyle } from './docstyle.js';
import { setSplit } from './layout.js';
import { ddSyncAll } from './dropdowns.js';

/* ------------------------------------------------------ persistence ---- */
export function saveState() {
  try {
    localStorage.setItem(LS_DOC, editor.value);
    localStorage.setItem(LS_CFG, JSON.stringify(readConfig()));
  } catch (e) { /* storage unavailable: run in-memory */ }
}

/* ------------------------------------------ config from/to controls --- */
/* Settings that belong to a document (page setup, typography, doc style,
   running header/footer). The view preferences (zoom, split, theme, linked
   scrolling) belong to the reader's setup: they are never written into a
   saved file and a file never overrides them. */
var DOC_KEYS = ['size', 'margin', 'headFont', 'bodyFont', 'codeFont', 'fontSize',
  'lineHeight', 'docstyle', 'hf', 'pgNumOn', 'pgNumStart', 'footer'];
function docPart(cfg) {
  var out = {};
  DOC_KEYS.forEach(function (k) { if (cfg[k] !== undefined) { out[k] = cfg[k]; } });
  return out;
}

/* docOnly: apply only the document's own settings (a file being opened or
   pasted); the reader's view preferences stay as they are */
export function applyCfgToControls(cfg, docOnly) {
  if (cfg.size && PAGE_SIZES[cfg.size]) { pageSizeSel.value = cfg.size; }
  if (cfg.margin && MARGIN_PRESETS[cfg.margin] != null) { marginSel.value = cfg.margin; }
  if (!docOnly && cfg.zoom && (cfg.zoom === 'fit' || parseFloat(cfg.zoom)) && selectHas(zoomSel, cfg.zoom)) { zoomSel.value = String(cfg.zoom); }
  if (cfg.headFont && fontStack(cfg.headFont)) { headFontSel.value = resolveFont(cfg.headFont); }
  if (cfg.bodyFont && fontStack(cfg.bodyFont)) { bodyFontSel.value = resolveFont(cfg.bodyFont); }
  if (cfg.codeFont && fontStack(cfg.codeFont)) { codeFontSel.value = resolveFont(cfg.codeFont); }
  if (cfg.fontSize && PT_RE.test(cfg.fontSize) && selectHas(baseSizeSel, cfg.fontSize)) { baseSizeSel.value = cfg.fontSize; }
  if (cfg.lineHeight && LH_RE.test(cfg.lineHeight) && selectHas(lineHeightSel, cfg.lineHeight)) { lineHeightSel.value = cfg.lineHeight; }
  /* running header/footer: the `hf` object wins; older files fall back
     to their legacy pgNumOn / pgNumStart / footer keys */
  setHfCfg((cfg.hf && typeof cfg.hf === 'object') ? normalizeHf(cfg.hf) : legacyHf(cfg));
  syncHfMirrors();
  if (!docOnly && (cfg.split === 'v' || cfg.split === 'h')) { setSplit(cfg.split); }
  if (!docOnly && (cfg.theme === 'light' || cfg.theme === 'dark' || cfg.theme === 'system')) { setThemeChoice(cfg.theme); }
  if (cfg.docstyle !== undefined && cfg.docstyle !== null) { setDocStyle(String(cfg.docstyle)); }
  if (!docOnly && (cfg.scrollsync === true || cfg.scrollsync === false)) { setSync(cfg.scrollsync); }
  ddSyncAll();
}

export function resetControlsToDefaults(persist, docOnly) {
  pageSizeSel.value = 'A4';
  marginSel.value = 'Normal';
  if (!docOnly) { zoomSel.value = 'fit'; }
  headFontSel.value = DEFAULT_HEAD_FONT;
  bodyFontSel.value = DEFAULT_BODY_FONT;
  codeFontSel.value = DEFAULT_CODE_FONT;
  baseSizeSel.value = '11pt';
  lineHeightSel.value = '1.55';
  if (!docOnly) { setThemeChoice('system', persist); }
  setDocStyle(DEFAULT_DOC_STYLE, persist);
  if (!docOnly) { setSync(true, persist); }
  setHfCfg(defaultHfCfg());
  syncHfMirrors();
  if (!docOnly) { setSplit('v'); }
  ddSyncAll();
}

/* --------------------------------------------- settings comment ------ */
/* The settings that travel with the document live in docSettings; they are
   never shown inside the editor pane. They are applied to the toolbar and
   the render on load, and written into the saved file as a
   <!--settings:{...}--> header on every save. */
var docSettings = null;

export function syncDocSettings() {
  docSettings = readConfig();
}

export function parseSettingsComment(src) {
  var m = (src || '').match(SETTINGS_RE);
  if (!m) { return null; }
  try {
    var o = JSON.parse(m[1]);
    return (o && typeof o === 'object' && !Array.isArray(o)) ? o : null;
  } catch (e) { return null; }
}

function buildSettingsComment(cfg) {
  return '<!--settings:' + JSON.stringify(docPart(cfg)) + '-->';
}

export function stripSettingsComment(src) {
  return (src || '').replace(SETTINGS_RE, '');
}

/* Saved markdown always carries the current settings in a header comment;
   the editor pane itself never contains it. */
export function buildMarkdownWithSettings() {
  if (!docSettings) { syncDocSettings(); }
  return buildSettingsComment(docSettings) + '\n\n' + stripSettingsComment(editor.value);
}