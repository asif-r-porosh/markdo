/* dom.js - DOM element references used across the app */

/* ------------------------------------------------------------- dom ---- */
export var $ = function (s) { return document.querySelector(s); };
export var editor = $('#editor');
export var pagesEl = $('#pages');
export var viewport = $('#viewport');
export var sizer = $('#sizer');
export var scaler = $('#scaler');
export var pageSizeSel = $('#pageSize');
export var marginSel = $('#margin');
export var zoomSel = $('#zoom');
export var headFontSel = $('#headFont');
export var bodyFontSel = $('#bodyFont');
export var codeFontSel = $('#codeFont');
export var baseSizeSel = $('#baseSize');
export var lineHeightSel = $('#lineHeight');
export var docStyleSel = $('#docStyle');
export var pbBtn = $('#pbBtn');
export var saveBtn = $('#saveBtn');
export var pgNumOnCb = $('#pgNumOn');
export var pgNumStartInp = $('#pgNumStart');
export var footerTextInp = $('#footerText');
export var fileInput = $('#fileInput');
export var splitBtn = $('#splitBtn');
export var statLeft = $('#statLeft');
export var splitter = $('#splitter');
export var mainEl = $('#main');
export var editorPane = $('#editorPane');
export var previewPane = $('#previewPane');