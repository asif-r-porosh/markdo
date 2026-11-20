/* fonts.js - font menus: stacks, groups, defaults, select filling */
import { bodyFontSel, codeFontSel, headFontSel } from './dom.js';

/* Font stacks offered by the Header font / Body font dropdowns.
 * macOS-first list with cross-platform fallbacks. */
export var FONT_OPTIONS = [
  /* Sans -- bundled faces (fonts/, OFL): identical rendering on every OS.
     Group drives the dropdown sections. */
  { v: 'geist',    label: 'Geist',         group: 'sans', stack: '"Geist", "Inter", -apple-system, "Segoe UI", Roboto, sans-serif' },
  { v: 'inter',    label: 'Inter',         group: 'sans', stack: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  { v: 'roboto',   label: 'Roboto',        group: 'sans', stack: '"Roboto", "Inter", -apple-system, "Segoe UI", sans-serif' },
  { v: 'plexsans', label: 'IBM Plex Sans', group: 'sans', stack: '"IBM Plex Sans", "Inter", -apple-system, "Segoe UI", Roboto, sans-serif' },
  { v: 'dmsans',   label: 'DM Sans',       group: 'sans', stack: '"DM Sans", "Inter", -apple-system, "Segoe UI", Roboto, sans-serif' },
  /* Serif */
  { v: 'geistserif',  label: 'Geist Serif',       group: 'serif', stack: '"Geist Serif", "Source Serif 4", Georgia, "Times New Roman", serif' },
  { v: 'sourceserif', label: 'Source Serif 4',    group: 'serif', stack: '"Source Serif 4", Georgia, "Times New Roman", serif' },
  { v: 'lora',        label: 'Lora',              group: 'serif', stack: '"Lora", "Source Serif 4", Georgia, serif' },
  { v: 'newsreader',  label: 'Newsreader',        group: 'serif', stack: '"Newsreader", "Source Serif 4", Georgia, serif' },
  { v: 'baskerville', label: 'Libre Baskerville', group: 'serif', stack: '"Libre Baskerville", "Source Serif 4", Georgia, serif' },
  /* Monospace */
  { v: 'geistmono', label: 'Geist Mono',     group: 'mono', mono: true, stack: '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
  { v: 'jbm',       label: 'JetBrains Mono', group: 'mono', mono: true, stack: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
  { v: 'plexmono',  label: 'IBM Plex Mono',  group: 'mono', mono: true, stack: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
  { v: 'robotomono',label: 'Roboto Mono',    group: 'mono', mono: true, stack: '"Roboto Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
  { v: 'sourcecode',label: 'Source Code Pro',group: 'mono', mono: true, stack: '"Source Code Pro", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
  /* Bangla -- Latin text falls back through the bundled sans */
  { v: 'kalpurush',    label: 'Kalpurush',         group: 'bangla', bn: true, stack: '"Kalpurush", "Noto Sans Bengali", "Inter", sans-serif' },
  { v: 'anekbangla',   label: 'Anek Bangla',       group: 'bangla', bn: true, stack: '"Anek Bangla", "Noto Sans Bengali", "Inter", sans-serif' },
  { v: 'hindsiliguri', label: 'Hind Siliguri',     group: 'bangla', bn: true, stack: '"Hind Siliguri", "Noto Sans Bengali", "Inter", sans-serif' },
  { v: 'notobengali',  label: 'Noto Sans Bengali', group: 'bangla', bn: true, stack: '"Noto Sans Bengali", "Inter", sans-serif' },
  { v: 'balooda2',     label: 'Baloo Da 2',        group: 'bangla', bn: true, stack: '"Baloo Da 2", "Noto Sans Bengali", "Inter", sans-serif' },
  /* System stacks (machine-dependent; kept for saved documents) */
  { v: 'system',    label: 'System Sans',      group: 'system', stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' },
  { v: 'helvetica', label: 'Helvetica Neue',   group: 'system', stack: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { v: 'arial',     label: 'Arial',            group: 'system', stack: 'Arial, Helvetica, sans-serif' },
  { v: 'avenir',    label: 'Avenir Next',      group: 'system', stack: '"Avenir Next", Avenir, "Segoe UI", sans-serif' },
  { v: 'futura',    label: 'Futura',           group: 'system', stack: 'Futura, "Trebuchet MS", Arial, sans-serif' },
  { v: 'gillsans',  label: 'Gill Sans',        group: 'system', stack: '"Gill Sans", "Gill Sans MT", Verdana, sans-serif' },
  { v: 'optima',    label: 'Optima',           group: 'system', stack: 'Optima, Candara, sans-serif' },
  { v: 'trebuchet', label: 'Trebuchet MS',     group: 'system', stack: '"Trebuchet MS", Tahoma, sans-serif' },
  { v: 'verdana',   label: 'Verdana',          group: 'system', stack: 'Verdana, Geneva, sans-serif' },
  { v: 'tahoma',    label: 'Tahoma',           group: 'system', stack: 'Tahoma, Geneva, sans-serif' },
  { v: 'georgia',   label: 'Georgia',          group: 'system', stack: 'Georgia, "Times New Roman", serif' },
  { v: 'times',     label: 'Times New Roman',  group: 'system', stack: '"Times New Roman", Times, serif' },
  { v: 'palatino',  label: 'Palatino',         group: 'system', stack: 'Palatino, "Palatino Linotype", "Book Antiqua", serif' },
  { v: 'iowan',     label: 'Iowan Old Style',  group: 'system', stack: '"Iowan Old Style", "Palatino Linotype", serif' },
  { v: 'charter',   label: 'Charter',          group: 'system', stack: 'Charter, Georgia, serif' },
  { v: 'baskerville', label: 'Baskerville',    group: 'system', stack: 'Baskerville, "Palatino Linotype", serif' },
  { v: 'didot',     label: 'Didot',            group: 'system', stack: 'Didot, "Times New Roman", serif' },
  { v: 'hoefler',   label: 'Hoefler Text',     group: 'system', stack: '"Hoefler Text", Georgia, serif' },
  { v: 'cambria',   label: 'Cambria',          group: 'system', stack: 'Cambria, Georgia, serif' },
  { v: 'garamond',  label: 'Garamond',         group: 'system', stack: 'Garamond, Georgia, serif' },
  { v: 'menlo',     label: 'Menlo',            group: 'system', mono: true, stack: 'Menlo, Consolas, monospace' },
  { v: 'monaco',    label: 'Monaco',           group: 'system', mono: true, stack: 'Monaco, Menlo, monospace' },
  { v: 'courier',   label: 'Courier New',      group: 'system', mono: true, stack: '"Courier New", Courier, monospace' }
];
/* dropdown section order + captions (Font menu structure) */
export var FONT_GROUPS = [
  { id: 'sans',   label: 'Sans' },
  { id: 'serif',  label: 'Serif' },
  { id: 'mono',   label: 'Monospace' },
  { id: 'bangla', label: 'Bangla' },
  { id: 'system', label: 'System' }
];
/* Code font menu: the bundled faces from FONT_OPTIONS (mono group)
   plus these machine monos; the doc code font is --doc-code-font. */
var CODE_FONT_OPTIONS = [
  { v: 'sysmono', label: 'System mono', group: 'mono', mono: true, stack: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace' }
];
export var DEFAULT_HEAD_FONT = 'geistserif'; /* Geist family everywhere: serif headings, sans body, mono code */
export var DEFAULT_BODY_FONT = 'geist';
export var DEFAULT_CODE_FONT = 'geistmono';

/* Font keys that no longer exist (removed from the lineup) and the face a
   saved document or stored setting that names them now gets. */
var FONT_ALIASES = {
  ss3: 'inter', manrope: 'dmsans',
  gelasio: 'geistserif', literata: 'geistserif',
  firanf: 'jbm', caskaydianf: 'sourcecode', plexmononf: 'plexmono'
};
export function resolveFont(key) {
  return Object.prototype.hasOwnProperty.call(FONT_ALIASES, key) ? FONT_ALIASES[key] : key;
}

export function fontStack(key) {
  key = resolveFont(key);
  var lists = [FONT_OPTIONS, CODE_FONT_OPTIONS];
  for (var l = 0; l < lists.length; l++) {
    for (var i = 0; i < lists[l].length; i++) {
      if (lists[l][i].v === key) { return lists[l][i].stack; }
    }
  }
  return null;
}
function makeFontOption(f) {
  var o = document.createElement('option');
  o.value = f.v;
  o.textContent = f.label;
  o.dataset.group = f.group || 'system';
  if (f.bn) { o.dataset.bn = '1'; }
  if (f.mono) { o.dataset.mono = '1'; }
  return o;
}
function fillFontSelect(sel) {
  FONT_OPTIONS.forEach(function (f) { sel.appendChild(makeFontOption(f)); });
}
function fillCodeFontSelect(sel) {
  FONT_OPTIONS.filter(function (f) { return f.group === 'mono'; })
    .concat(CODE_FONT_OPTIONS)
    .forEach(function (f) { sel.appendChild(makeFontOption(f)); });
}
fillFontSelect(headFontSel);
fillFontSelect(bodyFontSel);
fillCodeFontSelect(codeFontSel);