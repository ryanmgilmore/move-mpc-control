// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ryan Gilmore
/* Notes mode: the Move's own note layout, drawn and played by the module.
 * Pure: no host globals.
 *
 * Pad p = row * 8 + col, row 0 = bottom. Two layouts, both
 * isomorphic in fourths like Move and Push:
 *   in-key     each pad right is the next scale degree, each row up is three
 *              degrees (a fourth in a seven-note scale); only scale notes.
 *   chromatic  each pad right is a semitone, each row up is five (a fourth). */

export const SCALES = [
    { name: "Major", steps: [0, 2, 4, 5, 7, 9, 11] },
    { name: "Minor", steps: [0, 2, 3, 5, 7, 8, 10] },
    { name: "Dorian", steps: [0, 2, 3, 5, 7, 9, 10] },
    { name: "Mixolydian", steps: [0, 2, 4, 5, 7, 9, 10] },
    { name: "Lydian", steps: [0, 2, 4, 6, 7, 9, 11] },
    { name: "Phrygian", steps: [0, 1, 3, 5, 7, 8, 10] },
    { name: "Locrian", steps: [0, 1, 3, 5, 6, 8, 10] },
    { name: "Harm Minor", steps: [0, 2, 3, 5, 7, 8, 11] },
    { name: "Mel Minor", steps: [0, 2, 3, 5, 7, 9, 11] },
    { name: "Maj Pent", steps: [0, 2, 4, 7, 9] },
    { name: "Min Pent", steps: [0, 3, 5, 7, 10] },
    { name: "Blues", steps: [0, 3, 5, 6, 7, 10] },
];

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/* Akai/Ableton naming: MIDI 60 = C3. */
export function noteName(n) {
    return NOTE_NAMES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 2);
}

export const OCTAVE_MIN = 0, OCTAVE_MAX = 8;

export function defaultNotes() {
    /* octave 4: the bottom-left pad is the root in octave 2 (C2 = MIDI 48). */
    return { root: 0, scale: 0, chromatic: false, octave: 4, channel: 1 };
}

/* The MIDI note of the bottom-left pad. */
export function baseNote(cfg) {
    return 12 * cfg.octave + (cfg.root % 12);
}

/* MIDI note for pad p, or -1 when it falls outside 0-127. */
export function padNote(cfg, p) {
    const row = p >> 3, col = p & 7;
    const scale = SCALES[cfg.scale] || SCALES[0];
    let n;
    if (cfg.chromatic) {
        n = baseNote(cfg) + row * 5 + col;
    } else {
        const len = scale.steps.length;
        const deg = row * 3 + col;
        n = baseNote(cfg) + 12 * Math.floor(deg / len) + scale.steps[deg % len];
    }
    return n >= 0 && n <= 127 ? n : -1;
}

/* "root", "scale" (in the scale, not the root), "out" (chromatic only), or
 * "none" (no note on this pad). */
export function padRole(cfg, p) {
    const n = padNote(cfg, p);
    if (n < 0) return "none";
    const pc = ((n - cfg.root) % 12 + 12) % 12;
    if (pc === 0) return "root";
    const scale = SCALES[cfg.scale] || SCALES[0];
    return scale.steps.indexOf(pc) >= 0 ? "scale" : "out";
}

export function clampOctave(o) {
    return Math.max(OCTAVE_MIN, Math.min(OCTAVE_MAX, o));
}

export function describe(cfg) {
    return NOTE_NAMES[cfg.root % 12] + " " + (SCALES[cfg.scale] || SCALES[0]).name;
}
