/* constants.js - page sizes, margin presets, doc styles, regexes, storage keys, markdown renderer handle */

/* ------------------------------------------------------------ const ---- */
export var PAGE_SIZES = {
  A4: [210, 297],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
  A5: [148, 210],
  A3: [297, 420]
};
export var MARGIN_PRESETS = { Narrow: 12, Normal: 20, Wide: 28 };

/* Document style presets (toolbar: Doc style). The colors live in CSS
 * under html[data-docstyle="..."]; this list drives the dropdown and
 * validates the value that travels in the settings comment. */
export var DOC_STYLES = [
  { v: 'default',      label: 'Default (light)', paper: '#FFFFFF', text: '#111827' },
  { v: 'github',       label: 'GitHub light',    paper: '#FFFFFF', text: '#1F2328' },
  { v: 'github-dark',  label: 'GitHub dark',     paper: '#0D1117', text: '#E6EDF3' },
  { v: 'solarized',    label: 'Solarized light', paper: '#FDF6E3', text: '#586E75' },
  { v: 'sepia',        label: 'Sepia',           paper: '#F8F1E3', text: '#43382B' },
  { v: 'academic',     label: 'Academic',        paper: '#FFFFFF', text: '#111827' },
  { v: 'atom-dark',    label: 'Atom One dark',   paper: '#282C34', text: '#ABB2BF' },
  { v: 'nord',         label: 'Nord',            paper: '#2E3440', text: '#D8DEE9' },
  { v: 'dracula',      label: 'Dracula',         paper: '#282A36', text: '#F8F8F2' },
  { v: 'gruvbox-dark', label: 'Gruvbox dark',    paper: '#282828', text: '#EBDBB2' }
];
export var DEFAULT_DOC_STYLE = 'default';
export var PT_RE = /^\d+(\.\d+)?pt$/;
export var LH_RE = /^\d+(\.\d+)?$/;

export var LS_DOC = 'mdpdf.doc';
export var LS_CFG = 'mdpdf.cfg';
export var LS_SAVED = 'mdpdf.saved';   /* baseline of the last save/open/new: keeps the unsaved flag across reloads */
export var PB_TEST = /pagebreak/i;
export var LB_TEST = /linebreak/i;    /* <!--linebreak--> blank-line marker */
/* settings header comment: <!--settings:{...}--> (flat JSON) */
export var SETTINGS_RE = /^[ \t]*<!--\s*settings\s*:\s*(\{[\s\S]*?\})\s*-->\s*\n?/;
export var MD_ACCEPT_TYPES = [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown'], 'text/plain': ['.txt'] } }];
export var TABLE_INTERNAL = /^(TD|TH|TR|TBODY|THEAD|TFOOT)$/;

export var VOID_KEEP = /^(IMG|BR|HR|INPUT|SVG|CANVAS)$/;
export var MIN_LINE = 26;          /* px: never try to fit less than ~1.5 lines */
var meGuard = 0;

export var MD = null;
if (window.marked) {
  MD = (typeof window.marked.parse === 'function') ? window.marked
     : (window.marked.marked && typeof window.marked.marked.parse === 'function' ? window.marked.marked : null);
}