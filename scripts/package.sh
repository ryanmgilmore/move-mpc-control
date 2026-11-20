#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Ryan Gilmore
# Build the release tarball Schwung installs from: dist/move-mpc-control-module.tar.gz,
# holding the single folder move-mpc-control/ (BUILDING.md, "Build Script
# Requirements"). The Module Store, Schwung Manager's "Install Custom Module"
# (from a GitHub URL or an uploaded tarball) and a hand install all take it.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
id=move-mpc-control
"$here/scripts/build.sh" >/dev/null
out="$here/dist/$id-module.tar.gz"
rm -f "$out"
# COPYFILE_DISABLE / --no-xattrs: no macOS "._" files or extended attributes.
COPYFILE_DISABLE=1 tar --no-xattrs -czf "$out" -C "$here/dist" "$id" 2>/dev/null ||
    COPYFILE_DISABLE=1 tar -czf "$out" -C "$here/dist" "$id"
echo "$out"
tar -tzf "$out"
