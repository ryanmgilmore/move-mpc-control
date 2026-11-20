#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Ryan Gilmore
# Assemble dist/move-mpc-control/ from src/: the exact tree install.sh copies to the
# Move. JS only, so "build" is a copy plus a syntax check of every source.
set -eu

here=$(cd "$(dirname "$0")/.." && pwd)
src="$here/src"
out="$here/dist/move-mpc-control"

# Syntax check: node if present (ui.js is an ES module, so check a .mjs copy).
if command -v node >/dev/null 2>&1; then
    tmp=$(mktemp -d)
    trap 'rm -rf "$tmp"' EXIT
    cp "$src/ui.js" "$tmp/ui.mjs"
    node --check "$tmp/ui.mjs"
    for f in "$src"/lib/*.mjs; do node --check "$f"; done
fi
# module.json is read by a minimal JSON parser on the Move: keep it plain.
if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import json,sys; [json.load(open(p)) for p in sys.argv[1:]]' \
        "$src/module.json" "$src/help.json"
fi

rm -rf "$out"
mkdir -p "$out/lib"
cp "$src/module.json" "$src/ui.js" "$src/help.json" "$out/"
cp "$src"/lib/*.mjs "$out/lib/"

echo "built $out:"
(cd "$out" && find . -type f | sort | sed 's/^\.\//  /')
