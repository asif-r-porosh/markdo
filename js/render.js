/* render.js - config read/apply and the render pipeline */
import { $, baseSizeSel, bodyFontSel, codeFontSel, editor, headFontSel, lineHeightSel, marginSel, pageSizeSel, pagesEl, pgNumOnCb, statLeft, zoomSel } from './dom.js';
import { DEFAULT_BODY_FONT, DEFAULT_CODE_FONT, DEFAULT_HEAD_FONT, fontStack } from './fonts.js';
import { LH_RE, MARGIN_PRESETS, MD, PAGE_SIZES, PT_RE } from './constants.js';
import { docTitle, esc, mdWordCount } from './util.js';
import { buildLineMap } from './linemap.js';
import { extractBlocks } from './extract.js';
import { sanitizeHtml } from './sanitize.js';
import { paginate } from './paginate.js';
import { applyRunningHF, hfCfg, syncHfMirrors } from './hf.js';
import { updateZoom } from './zoom.js';
import { measureEditorLines, reanchorPreview, syncOn } from './scrollsync.js';
import { saveState, syncDocSettings } from './settings.js';
import { themeChoice } from './theme.js';
import { docStyleChoice } from './docstyle.js';
import { isDocDirty } from './document.js';
import { splitDir } from './layout.js';
import { refreshHighlight } from './highlight.js';

/* --------------------------------------------------------- render ---- */
export function readConfig() {
  syncHfMirrors();                 /* legacy keys stay in step with hfCfg */
  return {
    size: pageSizeSel.value,
    margin: marginSel.value,
    zoom: zoomSel.value,
    headFont: headFontSel.value,
    bodyFont: bodyFontSel.value,
    codeFont: codeFontSel.value,
    fontSize: baseSizeSel.value,
    lineHeight: lineHeightSel.value,
    hf: hfCfg,
    pgNumOn: pgNumOnCb.checked,
    pgNumStart: hfCfg.pg.off || 1,
    footer: hfCfg.t1.on ? hfCfg.t1.text : '',
    split: splitDir,
    theme: themeChoice,
    docstyle: docStyleChoice,
    scrollsync: syncOn
  };
}

function applyConfig(cfg) {
  var dims = PAGE_SIZES[cfg.size] || PAGE_SIZES.A4;
  var m = MARGIN_PRESETS[cfg.margin] != null ? MARGIN_PRESETS[cfg.margin] : 20;
  var rs = document.documentElement.style;
  rs.setProperty('--pw', dims[0] + 'mm');
  rs.setProperty('--ph', dims[1] + 'mm');
  rs.setProperty('--pm', m + 'mm');
  /* typography (validated; falls back to defaults on unknown values) */
  var hf = fontStack(cfg.headFont) || fontStack(DEFAULT_HEAD_FONT);
  var bf = fontStack(cfg.bodyFont) || fontStack(DEFAULT_BODY_FONT);
  var cf = fontStack(cfg.codeFont) || fontStack(DEFAULT_CODE_FONT);
  var fs = PT_RE.test(cfg.fontSize) ? cfg.fontSize : '11pt';
  var lh = LH_RE.test(cfg.lineHeight) ? cfg.lineHeight : '1.55';
  rs.setProperty('--head-font', hf);
  rs.setProperty('--doc-font', bf);
  rs.setProperty('--doc-code-font', cf);
  rs.setProperty('--doc-size', fs);
  rs.setProperty('--doc-lh', lh);
  var rule = '@page { size: ' + dims[0] + 'mm ' + dims[1] + 'mm; margin: 0; }';
  $('#pageRule').textContent = rule;
  /* keep the attribute and the variable in step (setDocStyle is authoritative) */
  document.documentElement.setAttribute('data-docstyle', docStyleChoice);
}

var renderTimer = null;
export function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 160);
}

export function render() {
  applyConfig(readConfig());
  syncDocSettings();              /* settings live in a variable, not the pane */
  var src = editor.value;
  var toks = buildLineMap(src);
  var html = '';
  if (MD) {
    try {
      html = sanitizeHtml(MD.parse(src, { gfm: true, breaks: false, async: false }));
    } catch (e) {
      html = '<p><strong>Markdown render error:</strong> ' + esc(String((e && e.message) || e)) + '</p>';
    }
  } else {
    html = '<pre><code>markdown renderer failed to load</code></pre>';
  }
  var blocks = extractBlocks(html, toks);
  paginate(blocks);
  applyRunningHF();
  updateZoom();                   /* also rebuilds the scroll-sync anchor map */
  measureEditorLines();
  refreshHighlight();
  if (syncOn) { reanchorPreview(); }
  updateStatus();
  deriveTitle();
  saveState();
}

function deriveTitle() {
  document.title = docTitle(editor.value, 'markdown-document');
}

export function updateStatus() {
  var words = mdWordCount(editor.value);
  var pages = pagesEl.children.length;
  var dirty = isDocDirty();
  statLeft.textContent = pages + (pages === 1 ? ' page' : ' pages') +
    ' \u00b7 ' + words + (words === 1 ? ' word' : ' words') +
    ' \u00b7 ' + editor.value.length + ' characters' +
    (dirty ? ' \u00b7 unsaved changes' : '');
  statLeft.classList.toggle('unsaved', dirty);
}