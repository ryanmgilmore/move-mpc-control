// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ryan Gilmore
/* Pad coordinates. Pure.
 *
 * The module only needs padIndex to talk to the MPC: the script maps pads to
 * clips and virtual pads. The rest mirrors the script's maps so the screen
 * can name what a pad addresses, and so the tests can hold both halves to
 * protocol/vectors.json "coordinates". */

export const PAD_NOTE0 = 68, PAD_COUNT = 32;
export const STEP_NOTE0 = 16, STEP_COUNT = 16;

export const isPadNote = (n) => n >= PAD_NOTE0 && n < PAD_NOTE0 + PAD_COUNT;
export const padIndex = (moveNote) => moveNote - PAD_NOTE0;
export const padNoteOf = (p) => PAD_NOTE0 + p;
export const rowOf = (p) => p >> 3;          /* 0 = bottom */
export const colOf = (p) => p & 7;
export const padAt = (row, col) => row * 8 + col;

/* Move row buttons: CC 43 is the top row, CC 40 the bottom (API.md: reversed). */
export const ROW_CC_TOP = 43;
export const rowButtonIndex = (cc) => ROW_CC_TOP - cc;   /* 0 = top */
export const rowButtonCC = (r) => ROW_CC_TOP - r;

/* Session: tracks across, scenes down; the top pad row is the first scene. */
export function sessionClip(p) {
    return { clipColumn: colOf(p), clipRow: 3 - rowOf(p) };
}
/* Rows: each pad row a track (top first), eight scenes across. */
export function rowsClip(p) {
    return { clipColumn: 3 - rowOf(p), clipRow: colOf(p) };
}
/* Pads: two 4x4 banks side by side; pad 1 bottom-left as on the MPC. */
export function virtualPad(p, padBank) {
    const row = rowOf(p), col = colOf(p);
    return (padBank + (col >= 4 ? 1 : 0)) * 16 + row * 4 + (col % 4);
}

export const bankLetter = (b) => String.fromCharCode(65 + Math.max(0, Math.min(7, b)));
