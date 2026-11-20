#!/bin/sh
# Stage the files the hosted app needs into dist/.
# Cloudflare Pages: build command  sh scripts/stage.sh   output directory  dist
# Direct upload:    sh scripts/stage.sh && npx wrangler pages deploy dist --project-name markdo
# Only app files are copied: no tests, node_modules, notes or editor litter.
set -eu
cd "$(dirname "$0")/.."
rm -rf dist
mkdir dist
cp LICENSE index.html sw.js manifest.json icon-192.png icon-512.png icon-maskable-512.png apple-touch-icon.png favicon.ico favicon-32x32.png favicon-16x16.png dist/
cp -R css js vendor fonts dist/
cp deploy/_headers dist/_headers
find dist \( -name '.DS_Store' -o -name '._*' \) -delete
echo "staged $(find dist -type f | wc -l | tr -d ' ') files in dist/"
