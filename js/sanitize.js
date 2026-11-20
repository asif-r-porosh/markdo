/* sanitize.js - the one gate for raw HTML that a document carries.
   Markdown may contain raw HTML (and marked passes it through untouched),
   so everything marked produces goes through DOMPurify before it reaches
   the page: no scripts, no event handlers, no javascript: URLs. The
   <!--pagebreak--> / <!--linebreak--> comments are kept because the
   paginator needs them, and <style> blocks are dropped so a document
   cannot restyle the app around it. If DOMPurify failed to load, nothing
   is rendered as HTML at all. */
import { esc } from './util.js';

var CFG = { ADD_TAGS: ['#comment'], FORBID_TAGS: ['style'] };

export function sanitizeHtml(html) {
  if (!window.DOMPurify || typeof window.DOMPurify.sanitize !== 'function') {
    return '<pre><code>' + esc(String(html)) + '</code></pre>';   /* fail closed */
  }
  return window.DOMPurify.sanitize(html, CFG);
}
