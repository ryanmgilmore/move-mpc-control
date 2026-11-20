// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ryan Gilmore
/* Q-Link pages, mirrored by qlinkIndex in mpc/abletonMoveSchwung.lua.
 * Zero-based MPC indices; see the wire protocol */
export const QLINK_PAGE_LABELS = ["Q1-8", "Q9-16", "Col 1-2", "Col 3-4"];
export const NUM_QLINK_PAGES = QLINK_PAGE_LABELS.length;

export function qlinkIndex(page, k) {
    if (page < 2) return page * 8 + k;
    const c = 2 * (page - 2) + Math.floor(k / 4), r = k % 4;
    return 12 + c - 4 * r;
}
