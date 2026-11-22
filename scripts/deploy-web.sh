#!/bin/sh
# Deploy MarkDo to Cloudflare Pages by direct upload: stage, upload, clean up.
# Usage, from anywhere:  sh scripts/deploy-web.sh
# First time on a machine: npx wrangler login
set -eu
cd "$(dirname "$0")/.."

# the folder is removed afterwards, also when the upload fails
trap 'rm -rf dist' EXIT

echo "cache: $(grep -o "mdpdf-v[0-9]*" sw.js | head -1)   commit: $(git rev-parse --short HEAD 2>/dev/null || echo none)"
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  echo "warning: uncommitted changes are included in this deploy" >&2
fi
if [ -n "$(git log '@{u}..HEAD' --oneline 2>/dev/null)" ]; then
  echo "warning: commits not pushed to GitHub yet" >&2
fi

sh scripts/stage.sh
npx wrangler pages deploy dist --project-name markdo
echo "deployed"
