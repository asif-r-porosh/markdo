/* theme.js - UI theme (system, light, dark) */
import { $ } from './dom.js';
import { LS_CFG } from './constants.js';

/* ------------------------------------------------------- theme ---- */
var LS_THEME = 'mdpdf.theme';
export var themeChoice = 'system';   /* system | light | dark; CSS sees the resolved value */
var themeMQ = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function resolvedTheme() {
  if (themeChoice === 'light' || themeChoice === 'dark') { return themeChoice; }
  return (themeMQ && themeMQ.matches) ? 'dark' : 'light';
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', resolvedTheme());
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) { meta.setAttribute('content', resolvedTheme() === 'dark' ? '#191919' : '#F7F7F5'); }
  var btn = $('#themeBtn');
  if (btn) { btn.title = 'Theme: ' + themeChoice + ' \u00b7 click to switch \u00b7 Ctrl/Cmd+Shift+L'; }
}

export function setThemeChoice(v, persist) {
  themeChoice = (v === 'light' || v === 'dark') ? v : 'system';
  if (persist !== false) {
    try {
      localStorage.setItem(LS_THEME, themeChoice);
      /* keep the config snapshot in sync so a later reload cannot
         resurrect a stale theme from mdpdf.cfg */
      var raw = localStorage.getItem(LS_CFG);
      var cfg = raw ? JSON.parse(raw) : null;
      if (cfg && typeof cfg === 'object' && !Array.isArray(cfg)) {
        cfg.theme = themeChoice;
        localStorage.setItem(LS_CFG, JSON.stringify(cfg));
      }
    } catch (e) { /* storage unavailable */ }
  }
  applyTheme();
}

export function cycleTheme() {
  setThemeChoice(resolvedTheme() === 'dark' ? 'light' : 'dark');
}

export function initTheme() {
  var saved = null;
  try { saved = localStorage.getItem(LS_THEME); } catch (e) { /* ignore */ }
  if (saved === 'light' || saved === 'dark' || saved === 'system') { themeChoice = saved; }
  applyTheme();
  if (themeMQ) {
    var onMQ = function () { if (themeChoice === 'system') { applyTheme(); } };
    if (themeMQ.addEventListener) { themeMQ.addEventListener('change', onMQ); }
    else if (themeMQ.addListener) { themeMQ.addListener(onMQ); }
  }
  var btn = $('#themeBtn');
  if (btn) { btn.addEventListener('click', cycleTheme); }
}