#!/usr/bin/env bash
# Regenerates src/fonts/rubik-mock-subset.woff2.
#
# Rubik is the typeface Frame Player and Gift Fight are really drawn in, and it
# is used nowhere else on this page — two previews, below the fold, at 9–17 px.
# Fontsource ships 35 KB for it, which made it the largest asset on the site and
# the longest leg of the critical request chain, all for a few dozen labels.
#
# So it is cut down to what those two previews actually set: printable ASCII
# plus the handful of typographic characters they use, and the weight axis
# clipped to the 400–700 the mocks ask for. 35 KB becomes 12.7 KB.
#
# Run it after changing the copy inside a mock, or after bumping the Rubik
# package. Needs `pip install fonttools brotli`.
set -euo pipefail

src="node_modules/@fontsource-variable/rubik/files/rubik-latin-wght-normal.woff2"
out="src/fonts/rubik-mock-subset.woff2"
tmp="$(mktemp -t rubik).ttf"

fonttools varLib.instancer -q "$src" wght=400:700 -o "$tmp"
pyftsubset "$tmp" \
  --output-file="$out" \
  --flavor=woff2 \
  --layout-features='' \
  --no-hinting \
  --desubroutinize \
  --unicodes='U+0020-007E,U+00A0,U+00D7,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2026'
rm -f "$tmp"

printf '%s: %s bytes\n' "$out" "$(wc -c < "$out")"
