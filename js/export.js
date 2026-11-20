/* export.js - print and DOCX export */
import { $, baseSizeSel, editor, lineHeightSel, marginSel, pageSizeSel } from './dom.js';
import { docTitle } from './util.js';
import { FONT_OPTIONS } from './fonts.js';
import { sanitizeHtml } from './sanitize.js';
import { MARGIN_PRESETS, MD, PAGE_SIZES } from './constants.js';
import { buildHfSlots, hfCfg } from './hf.js';

/* print/export must wait for the webfonts: printing with faces still
   loading would bake fallback metrics into the PDF; Export > PDF and
   Ctrl/Cmd+P both land here */
export function printWhenFontsReady() {
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { window.print(); })
      .catch(function () { window.print(); });
  } else {
    window.print();
  }
}

/* ============== Export DOCX ==============
   Real Word export, fully offline. The vendored docx UMD bundle
   (vendor/docx.umd.min.js, MIT -- see vendor/docx.LICENSE.txt) is lazy-loaded on
   first use and precached by sw.js. The same embedded markdown
   parser (MD) feeds the converter, so the .docx always agrees with
   what the preview renders. Page size, margins, footer text, page
   numbers and base type size carry over. Remote (non-data-URI)
   images become placeholders: the app never fetches the network. */
var DOCX_LIB_URL = 'vendor/docx.umd.min.js';
var DOCX_ACCEPT_TYPES = [{
  description: 'Word document',
  accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] }
}];
var DOCX_FONT_MAP = {
  sans: 'Calibri', serif: 'Cambria', mono: 'Consolas',
  bangla: 'Nirmala UI'          /* Word substitutes if unavailable */
};
/* Word picks the font for Bengali (a complex script) from the run's `cs`
   slot, so every run names a Bengali-capable face there; Latin text keeps
   the chosen font */
function fontSpec(name) {
  return { ascii: name, hAnsi: name, eastAsia: name, cs: DOCX_FONT_MAP.bangla };
}
var docxLibPromise = null;
var docxOlInstance = 0;

function docxGroupFont(sel) {
  var v = sel && sel.value, i;
  for (i = 0; FONT_OPTIONS && i < FONT_OPTIONS.length; i++) {
    if (FONT_OPTIONS[i].v === v) { return DOCX_FONT_MAP[FONT_OPTIONS[i].group] || 'Calibri'; }
  }
  return 'Calibri';
}

function loadDocxLib() {
  if (window.docx && window.docx.Document) { return Promise.resolve(window.docx); }
  if (!docxLibPromise) {
    docxLibPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = DOCX_LIB_URL;
      s.onload = function () {
        if (window.docx && window.docx.Document) { resolve(window.docx); }
        else { docxLibPromise = null; reject(new Error('docx bundle did not expose its global')); }
      };
      s.onerror = function () {
        docxLibPromise = null;
        reject(new Error('docx bundle failed to load'));
      };
      document.head.appendChild(s);
    });
  }
  return docxLibPromise;
}

function docxSaveName() {
  return docTitle(editor.value, 'markdown-document').replace(/\.md$/i, '') + '.docx';
}

function downloadDocxBlob(blob, fname) {
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () {
    URL.revokeObjectURL(a.href);
    if (a.parentNode) { a.parentNode.removeChild(a); }
  }, 1500);
}

function pickAndSaveDocx(blob, fname) {
  if (window.showSaveFilePicker) {
    return window.showSaveFilePicker({ suggestedName: fname, types: DOCX_ACCEPT_TYPES })
      .then(function (h) {
        return h.createWritable().then(function (w) {
          return w.write(blob).then(function () { return w.close(); });
        });
      })
      .catch(function (e) {
        if (!e || e.name !== 'AbortError') { downloadDocxBlob(blob, fname); }
      });
  }
  downloadDocxBlob(blob, fname);
  return Promise.resolve();
}

/* natural pixel size of data-URI images -- docx needs dimensions */
function docxImageSizes(root) {
  var imgs = root.querySelectorAll('img[src^="data:image/"]');
  var jobs = [];
  Array.prototype.forEach.call(imgs, function (im) {
    jobs.push(new Promise(function (res) {
      var probe = new Image();
      probe.onload = function () { res({ src: im.getAttribute('src'), w: probe.naturalWidth, h: probe.naturalHeight }); };
      probe.onerror = function () { res(null); };
      probe.src = im.getAttribute('src');
    }));
  });
  return Promise.all(jobs).then(function (list) {
    var map = {};
    list.forEach(function (r) { if (r) { map[r.src] = { w: r.w, h: r.h }; } });
    return map;
  });
}

function buildDocxD(D, dom, imgSizes) {
  var dims = PAGE_SIZES[pageSizeSel.value] || PAGE_SIZES.A4;
  var mmm = MARGIN_PRESETS[marginSel.value] != null ? MARGIN_PRESETS[marginSel.value] : 20;
  var MM2TW = 56.6929;                          /* 1 mm in twips */
  var wTw = Math.round(dims[0] * MM2TW), hTw = Math.round(dims[1] * MM2TW), mTw = Math.round(mmm * MM2TW);
  var ctx = {
    D: D,
    bodyFont: docxGroupFont($('#bodyFont')),
    headFont: docxGroupFont($('#headFont')),
    baseHp: Math.round(parseFloat(baseSizeSel.value) * 2) || 22,
    lineTw: Math.round((parseFloat(lineHeightSel.value) || 1.55) * 240),
    imgSizes: imgSizes || {},
    wTw: wTw, mmm: mmm,
    contentWmm: dims[0] - 2 * mmm,
    contentHmm: dims[1] - 2 * mmm
  };

  function pushImage(img, out) {
    var src = img.getAttribute('src') || '';
    var m = /^data:image\/(png|jpeg|gif|bmp);base64,/i.exec(src);
    var dim = ctx.imgSizes[src];
    if (m && dim) {
      var bin = atob(src.slice(m[0].length));
      var arr = new Uint8Array(bin.length);
      for (var k = 0; k < bin.length; k++) { arr[k] = bin.charCodeAt(k); }
      var w = dim.w, h = dim.h;
      var maxW = Math.round(ctx.contentWmm / 25.4 * 96), maxH = Math.round(ctx.contentHmm / 25.4 * 96);
      var sc = Math.min(1, maxW / w, maxH / h);
      out.push(new D.ImageRun({
        data: arr,
        type: m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase(),
        transformation: { width: Math.max(1, Math.round(w * sc)), height: Math.max(1, Math.round(h * sc)) }
      }));
      return;
    }
    var alt = img.getAttribute('alt') || (m ? 'image' : src);
    out.push(new D.TextRun({ text: '[image: ' + String(alt).slice(0, 80) + ']', italics: true, color: '808080' }));
  }

  function emitText(n, st, out) {
    var t = (n.textContent || '').replace(/\s+/g, ' ');
    if (!t || t === ' ') { return; }
    if (st.href) {
      out.push(new D.ExternalHyperlink({
        link: st.href,
        children: [new D.TextRun({ text: t, bold: st.bold, italics: st.italics, strike: st.strike, font: fontSpec(st.font), color: '0563C1', underline: { type: D.UnderlineType.SINGLE } })]
      }));
    } else if (st.code) {
      out.push(new D.TextRun({ text: t, bold: st.bold, italics: st.italics, strike: st.strike, font: 'Consolas', shading: { type: D.ShadingType.CLEAR, fill: 'F2F2F2' } }));
    } else {
      out.push(new D.TextRun({ text: t, bold: st.bold, italics: st.italics, boldComplexScript: st.bold, italicsComplexScript: st.italics, strike: st.strike, font: fontSpec(st.font) }));
    }
  }

  /* inline walker: accepts text nodes, elements or containers */
  function runs(node, st, out) {
    if (node.nodeType === 3) { emitText(node, st, out); return; }
    if (node.nodeType !== 1) { return; }
    Array.prototype.forEach.call(node.childNodes, function (n) {
      if (n.nodeType === 3) { emitText(n, st, out); return; }
      if (n.nodeType === 8) {                     /* inline <!--linebreak--> mid-paragraph */
        if (/linebreak/i.test(n.textContent || '')) { out.push(new D.TextRun({ text: '', break: 1 })); }
        return;
      }
      if (n.nodeType !== 1) { return; }
      var tag = n.tagName;
      if (tag === 'BR') { out.push(new D.TextRun({ text: '', break: 1 })); return; }
      if (tag === 'IMG') { pushImage(n, out); return; }
      runs(n, {
        bold: st.bold || tag === 'STRONG' || tag === 'B',
        italics: st.italics || tag === 'EM' || tag === 'I' || tag === 'CITE' || tag === 'VAR',
        strike: st.strike || tag === 'DEL' || tag === 'S' || tag === 'STRIKE',
        code: st.code || tag === 'CODE' || tag === 'KBD' || tag === 'SAMP' || tag === 'TT',
        href: tag === 'A' ? (n.getAttribute('href') || st.href) : st.href,
        font: st.font
      }, out);
    });
  }

  function walkList(listEl, kind, level, out, qLevel) {
    var inst = kind === 'OL' ? ++docxOlInstance : 0;
    Array.prototype.forEach.call(listEl.childNodes, function (li) {
      if (li.nodeType !== 1 || li.tagName !== 'LI') { return; }
      var cb = null, nested = [];
      Array.prototype.forEach.call(li.childNodes, function (c) {
        if (c.nodeType === 1) {
          var tg = c.tagName;
          if (tg === 'UL' || tg === 'OL') { nested.push(c); }
          else if (tg === 'INPUT' && (c.getAttribute('type') || '') === 'checkbox') { cb = c.hasAttribute('checked'); }
        }
      });
      var buf = [];
      if (cb !== null) { buf.push(new D.TextRun({ text: cb ? '\u2611 ' : '\u2610 ', font: 'Segoe UI Symbol' })); }
      Array.prototype.forEach.call(li.childNodes, function (c) {
        if (c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL' ||
            (c.tagName === 'INPUT' && (c.getAttribute('type') || '') === 'checkbox'))) { return; }
        if (c.nodeType === 1 && c.tagName === 'P') {
          var pr = [];
          runs(c, { font: ctx.bodyFont, italics: qLevel ? true : undefined }, pr);
          if (!buf.length) { buf = pr; }
          else { out.push(new D.Paragraph({ children: pr, indent: { left: 720 * (level + 1) } })); }
          return;
        }
        runs(c, { font: ctx.bodyFont, italics: qLevel ? true : undefined }, buf);
      });
      if (!buf.length) { buf.push(new D.TextRun({ text: '' })); }
      var opts = { children: buf };
      if (kind === 'UL') { opts.bullet = { level: Math.min(level, 8) }; }
      else { opts.numbering = { reference: 'mdol', level: Math.min(level, 2), instance: inst }; }
      if (qLevel) { opts.indent = { left: 720 * qLevel }; }
      out.push(new D.Paragraph(opts));
      nested.forEach(function (nl) { walkList(nl, nl.tagName, level + 1, out, qLevel); });
    });
  }

  function buildCode(pre, out) {
    var codeEl = pre.querySelector('code') || pre;
    var lines = (codeEl.textContent || '').replace(/\r/g, '').split('\n');
    while (lines.length && !lines[lines.length - 1].trim()) { lines.pop(); }
    if (!lines.length) { return; }
    var bd = { style: D.BorderStyle.SINGLE, size: 4, color: 'DDDDDD', space: 2 };
    out.push(new D.Paragraph({
      shading: { type: D.ShadingType.CLEAR, fill: 'F5F5F5' },
      border: { top: bd, bottom: bd, left: bd, right: bd },
      spacing: { after: 160 },
      children: lines.map(function (t, i) {
        return new D.TextRun({ text: t, break: i ? 1 : 0, font: 'Consolas', size: 18, color: '333333' });
      })
    }));
  }

  function buildTable(tbl, out) {
    var trs = [];
    Array.prototype.forEach.call(tbl.querySelectorAll('tr'), function (tr) {
      var isHead = tr.parentElement && tr.parentElement.tagName === 'THEAD';
      var cells = [];
      Array.prototype.forEach.call(tr.children, function (td) {
        var cb = [];
        runs(td, { font: ctx.bodyFont, bold: isHead || undefined }, cb);
        if (!cb.length) { cb.push(new D.TextRun({ text: '' })); }
        cells.push(new D.TableCell({
          shading: isHead ? { type: D.ShadingType.CLEAR, fill: 'EFEFEF' } : undefined,
          children: [new D.Paragraph({ children: cb })]
        }));
      });
      if (cells.length) { trs.push(new D.TableRow({ children: cells })); }
    });
    if (!trs.length) { return; }
    var B = { style: D.BorderStyle.SINGLE, size: 2, color: 'BFBFBF' };
    out.push(new D.Table({
      width: { size: 100, type: D.WidthType.PERCENTAGE },
      borders: { top: B, bottom: B, left: B, right: B, insideHorizontal: B, insideVertical: B },
      rows: trs
    }));
    out.push(new D.Paragraph({ children: [] }));   /* breathing room after the table */
  }

  function walkBlock(n, out, qLevel) {
    if (n.nodeType === 8) {                        /* <!--pagebreak--> / <!--linebreak--> */
      var cmt = n.textContent || '';
      if (/pagebreak/i.test(cmt)) {
        out.push(new D.Paragraph({ children: [new D.PageBreak()] }));
      } else if (/linebreak/i.test(cmt)) {
        out.push(new D.Paragraph({                 /* one blank body line at the set line height */
          spacing: { line: ctx.lineTw, lineRule: D.LineRuleType.AUTO },
          children: []
        }));
      }
      return;
    }
    if (n.nodeType !== 1) { return; }
    var tag = n.tagName;
    var m = /^H([1-6])$/.exec(tag);
    if (m) {
      var rr = [];
      runs(n, { font: ctx.headFont }, rr);
      if (!rr.length) { rr.push(new D.TextRun({ text: '' })); }
      out.push(new D.Paragraph({ heading: D.HeadingLevel['HEADING_' + m[1]], children: rr }));
      return;
    }
    if (tag === 'P') {
      var pr = [];
      runs(n, { font: ctx.bodyFont, italics: qLevel ? true : undefined }, pr);
      out.push(new D.Paragraph({
        children: pr.length ? pr : [new D.TextRun({ text: '' })],
        spacing: { after: 120, line: ctx.lineTw, lineRule: D.LineRuleType.AUTO },
        indent: qLevel ? { left: 720 * qLevel } : undefined,
        border: qLevel ? { left: { style: D.BorderStyle.SINGLE, size: 12, color: 'BFBFBF', space: 8 } } : undefined
      }));
      return;
    }
    if (tag === 'UL' || tag === 'OL') { walkList(n, tag, 0, out, qLevel); return; }
    if (tag === 'BLOCKQUOTE') {
      Array.prototype.forEach.call(n.childNodes, function (c) { walkBlock(c, out, (qLevel || 0) + 1); });
      return;
    }
    if (tag === 'PRE') { buildCode(n, out); return; }
    if (tag === 'TABLE') { buildTable(n, out); return; }
    if (tag === 'HR') {
      out.push(new D.Paragraph({ border: { bottom: { style: D.BorderStyle.SINGLE, size: 6, color: 'BFBFBF', space: 1 } } }));
      return;
    }
    Array.prototype.forEach.call(n.childNodes, function (c) { walkBlock(c, out, qLevel); });
  }

  var children = [];
  docxOlInstance = 0;
  Array.prototype.forEach.call(dom.body.childNodes, function (n) { walkBlock(n, children, 0); });
  if (!children.length) { children.push(new D.Paragraph({ children: [] })); }

  var secProps = {
    page: {
      size: { width: wTw, height: hTw },
      margin: { top: mTw, right: mTw, bottom: mTw, left: mTw }
    }
  };
  /* running header/footer: map the four corner slots onto Word headers /
     footers -- one paragraph per band, left slot + tab + right slot */
  var slots = buildHfSlots();
  if (slots.pg) { secProps.page.pageNumbers = { start: hfCfg.pg.off || 1 }; }
  var sec = { properties: secProps, children: children };
  function hfRuns(slot) {
    if (!slot) { return []; }
    if (slot.kind === 'pg') {
      return [new D.TextRun({ children: [D.PageNumber.CURRENT], size: 18, color: '666666' })];
    }
    return [new D.TextRun({ text: slot.text, size: 18, color: '666666' })];
  }
  function hfBand(leftSlot, rightSlot) {
    var runs = hfRuns(leftSlot);
    runs.push(new D.TextRun({ text: '\t', size: 18 }));
    runs = runs.concat(hfRuns(rightSlot));
    return new D.Paragraph({
      tabStops: [{ type: D.TabStopType.RIGHT, position: wTw - 2 * mTw }],
      children: runs
    });
  }
  if (slots.HL || slots.HR) {
    sec.headers = { default: new D.Header({ children: [hfBand(slots.HL, slots.HR)] }) };
  }
  if (slots.FL || slots.FR) {
    sec.footers = { default: new D.Footer({ children: [hfBand(slots.FL, slots.FR)] }) };
  }

  var doc = new D.Document({
    numbering: { config: [{ reference: 'mdol', levels: [0, 1, 2].map(function (lvl) {
      return {
        level: lvl,
        format: [D.LevelFormat.DECIMAL, D.LevelFormat.LOWER_LETTER, D.LevelFormat.LOWER_ROMAN][lvl],
        text: ['%1.', '%2.', '%3.'][lvl],
        alignment: D.AlignmentType.START,
        style: { paragraph: { indent: { left: 720 * (lvl + 1), hanging: 360 } } }
      };
    }) }] },
    styles: { default: { document: { run: { font: fontSpec(ctx.bodyFont), size: ctx.baseHp } } } },
    sections: [sec]
  });

  return D.Packer.toBlob(doc).then(function (blob) {
    return { blob: blob, fname: docxSaveName() };
  });
}

export function exportDocx() {
  var btn = $('#docxBtn');               /* the Export > DOCX menu item */
  if (btn) { btn.disabled = true; }
  loadDocxLib()
    .then(function (D) {
      if (!MD) { throw new Error('markdown renderer not loaded'); }
      var html = sanitizeHtml(MD.parse(editor.value, { gfm: true, breaks: false, async: false }));
      var dom = new DOMParser().parseFromString(html, 'text/html');
      return docxImageSizes(dom.body).then(function (map) {
        return buildDocxD(D, dom, map);
      });
    })
    .then(function (r) { return pickAndSaveDocx(r.blob, r.fname); })
    .catch(function (e) {
      window.alert('DOCX export failed: ' + ((e && e.message) || e));
    })
    .then(function () { if (btn) { btn.disabled = false; } });
}