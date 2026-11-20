/* util.js - small shared helpers */

export function selectHas(sel, v) {
  for (var i = 0; i < sel.options.length; i++) { if (sel.options[i].value === String(v)) { return true; } }
  return false;
}

export function el(tag, cls) {
  var e = document.createElement(tag);
  if (cls) { e.className = cls; }
  return e;
}
export function isHeading(n) { return n && n.nodeType === 1 && /^H[1-6]$/.test(n.tagName); }
export function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
}
/* Plain text of one line of Markdown: emphasis, code, links, images, tags
   and escapes removed. Used for names derived from a heading. */
export function plainInline(s) {
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')              /* image -> alt text */
       .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')                /* [text](url) -> text */
       .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')              /* [text][ref] -> text */
       .replace(/<[^>]+>/g, '')                                 /* inline html */
       .replace(/`+([^`]*)`+/g, '$1')
       .replace(/~~([^~]+)~~/g, '$1');
  for (var i = 0; i < 3; i++) {                                 /* nested emphasis */
    s = s.replace(/(\*\*|\*)(\S|\S.*?\S)\1/g, '$2')
         .replace(/(^|[\s(])(__|_)(\S|\S.*?\S)\2(?=$|[\s).,:;!?])/g, '$1$3');
  }
  return s.replace(/\\([\\`*_{}\[\]()#+\-.!~])/g, '$1')           /* backslash escapes */
          .replace(/\s+#+\s*$/, '')                            /* closing # of an ATX heading */
          .replace(/\s+/g, ' ').trim();
}

/* Title of a document for file names and the window title: the first
   level-1 heading as plain text, safe for a file name, at most 80 chars. */
export function docTitle(md, fallback) {
  var m = md.match(/^\s*#\s+(.+?)\s*$/m);
  var t = m ? plainInline(m[1]) : fallback;
  return t.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80).trim() || fallback;
}

/* Words in a Markdown text, as a reader counts them: list markers, heading
   hashes, table pipes and rules, code fences, comments and tags do not
   count; a token needs at least one letter or digit. */
export function mdWordCount(md) {
  var n = 0;
  var src = md.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>\n]+>/g, ' ');
  src.split('\n').forEach(function (line) {
    if (/^\s*(```|~~~)/.test(line)) { return; }                 /* code fence */
    if (/^[\s>]*[-*_=|:\s]+$/.test(line)) { return; }           /* rule, setext underline, table separator */
    line = line.replace(/^[\s>]*/, '')
               .replace(/^([-*+]|\d+[.)])\s+/, '')                /* list marker */
               .replace(/^\[[ xX]\]\s+/, '');                     /* task box */
    (line.match(/\S+/g) || []).forEach(function (t) {
      if (/[\p{L}\p{N}]/u.test(t)) { n++; }
    });
  });
  return n;
}
