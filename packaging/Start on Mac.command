#!/bin/bash
# Opens RadioPlan Pro in its own window, keeping projects on this drive.
DIR="$(cd "$(dirname "$0")" && pwd)"
PROFILE="$DIR/RadioPlan Data/Browser"
mkdir -p "$PROFILE"
for APP in "Google Chrome" "Microsoft Edge" "Chromium" "Brave Browser"; do
  if open -Ra "$APP" 2>/dev/null; then
    open -na "$APP" --args --user-data-dir="$PROFILE" --no-first-run --app="file://$DIR/RadioPlan.html"
    exit 0
  fi
done
open "$DIR/RadioPlan.html"
