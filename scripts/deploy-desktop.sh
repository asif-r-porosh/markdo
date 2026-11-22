#!/bin/sh
# Build the macOS app and install it into /Applications (replacing the old copy).
# Usage, from anywhere:  sh scripts/deploy-desktop.sh
# The build runs scripts/stage.sh itself (tauri.conf.json beforeBuildCommand).
set -eu
cd "$(dirname "$0")/.."

APP=/Applications/MarkDo.app
BUILT=desktop/src-tauri/target/release/bundle/macos/MarkDo.app

# dist/ is removed afterwards, also when the build fails
trap 'rm -rf dist' EXIT

echo "cache: $(grep -o "mdpdf-v[0-9]*" sw.js | head -1)   commit: $(git rev-parse --short HEAD 2>/dev/null || echo none)"
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  echo "warning: uncommitted changes are included in this build" >&2
fi

( cd desktop && cargo tauri build )

# a running copy is asked to quit (never killed: it may hold unsaved work)
if pgrep -x markdo-desktop >/dev/null 2>&1; then
  osascript -e 'tell application "MarkDo" to quit' >/dev/null 2>&1 || true
  i=0
  while pgrep -x markdo-desktop >/dev/null 2>&1; do
    i=$((i + 1))
    if [ "$i" -gt 20 ]; then
      echo "MarkDo is still running (unsaved changes?). Quit it, then run this script again." >&2
      exit 1
    fi
    sleep 0.5
  done
fi

rm -rf "$APP"
cp -R "$BUILT" "$APP"
echo "installed $APP"
