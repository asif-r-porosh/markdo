# MarkDo

Offline Markdown editor with a live, paginated preview. Exports PDF and DOCX.
Runs in the browser; documents stay on the device. No account, no upload.

Live: https://markdo.pages.dev

## Features

- Editor with light Markdown colouring (headings, code, links, lists, tables, page-break markers), bundled Geist Mono
- GitHub-flavoured Markdown: tables, task lists, fenced code, strikethrough
- Preview split into real pages: A4, Letter, Legal, A5, A3; Narrow / Normal / Wide margins; zoom; side-by-side or stacked
- Linked scrolling between editor and preview
- Page break and line break markers: `Ctrl/Cmd+Enter`, `Ctrl/Cmd+Shift+Enter`
- Running header and footer, page numbers with a start offset
- Document styles, heading / body / code fonts, base size, line height
- Bundled fonts (sans, serif, mono, Bangla) cached for offline use; no font CDN
- PDF export through the browser's print dialog
- DOCX export, built in the browser (fonts map to Calibri / Cambria / Consolas; PDF keeps fonts exactly)
- Page and style settings are saved in a comment at the top of the `.md` file and restored on open
- Light and dark theme (`Ctrl/Cmd+Shift+L`), Undo / Redo in the Edit menu
- Installable as an app; works offline after the first visit

Keys: `Ctrl/Cmd+S` save, `+O` open, `+P` PDF, `Tab` / `Shift+Tab` indent / outdent.

## Run locally

No build step. The app uses ES modules, so it must be served over http:

    python3 -m http.server 8000
    # open http://localhost:8000

## Tests

Playwright (headless Chromium) with Node's built-in test runner. Details in `tests/README.md`.

    npm install
    npx playwright-core install chromium    # once
    npm test

## Deploy (Cloudflare Pages)

`scripts/stage.sh` copies only the app files into `dist/` and adds `deploy/_headers`
(security headers, cache rules).

Direct upload, from the repo root:

    1. Raise CACHE in sw.js (for example mdpdf-v23 to mdpdf-v24)
    2. sh scripts/stage.sh
    3. npx wrangler login                                    # first time only
    4. npx wrangler pages deploy dist --project-name markdo
    5. rm -rf dist

Git-connected project instead: build command `sh scripts/stage.sh`, output directory `dist`.

After a release, open the live address, go offline, reload; the app must start.

## Licence

MarkDo is MIT licensed: see `LICENSE`.

Third-party code in `vendor/` (marked, DOMPurify, docx and the libraries bundled in docx) is listed in
`vendor/THIRD-PARTY-NOTICES.txt`, with the full licence texts next to the files. Fonts: `fonts/OFL-*.txt`
(SIL Open Font License).

> RnD: Sonnet 5.5 & GLM 5.2