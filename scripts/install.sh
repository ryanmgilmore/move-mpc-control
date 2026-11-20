#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Ryan Gilmore
# Copy dist/move-mpc-control/ to the Move with tar over ssh. Builds first.
#   MOVE_HOST   default ableton@move.local
#
# ui.js changes take effect on the next fresh tool open (Shift+Back out of
# the tool first: a parked tool is not reloaded). lib/*.mjs changes need a
# Move restart, because QuickJS caches imported modules for the life of the
# process.
set -eu

here=$(cd "$(dirname "$0")/.." && pwd)
host=${MOVE_HOST:-ableton@move.local}
dest=/data/UserData/schwung/modules/tools/move-mpc-control

"$here/scripts/build.sh"

echo "installing to $host:$dest"
tar -C "$here/dist/move-mpc-control" -cf - . |
    ssh "$host" "mkdir -p '$dest' && tar -C '$dest' -xf - && ls -la '$dest' '$dest/lib'"

# Show what changed in lib/, since that is the part that needs a restart.
echo
echo "lib/ checksums (local, then device):"
(cd "$here/dist/move-mpc-control/lib" && md5 -q ./*.mjs 2>/dev/null || md5sum ./*.mjs | cut -d' ' -f1) | paste -sd' ' -
ssh "$host" "cd '$dest/lib' && md5sum *.mjs | cut -d' ' -f1" | paste -sd' ' -
echo "If lib/ changed since the Move last started, restart the Move."
