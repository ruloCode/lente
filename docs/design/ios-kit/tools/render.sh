#!/bin/bash
# Render a kit page at 4× (1520 × 2688), with no animations, for pixel comparison.
# usage: tools/render.sh <page.html> <out.png> [light|dark]
# Needs a Chromium headless shell. Default: Playwright's cached one; override with CHROME=/path/to/binary.
set -euo pipefail
page="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"; out="$2"; theme="${3:-light}"
CHROME="${CHROME:-$(find "$HOME/Library/Caches/ms-playwright" -name chrome-headless-shell -type f 2>/dev/null | sort | tail -1)}"
[ -x "$CHROME" ] || { echo "No headless Chromium found; set CHROME=/path/to/chrome-headless-shell" >&2; exit 1; }
"$CHROME" --hide-scrollbars --force-prefers-reduced-motion --window-size=380,672 --force-device-scale-factor=4 \
  --screenshot="$out" "file://$page?static&theme=$theme" >/dev/null 2>&1
echo "$out"
