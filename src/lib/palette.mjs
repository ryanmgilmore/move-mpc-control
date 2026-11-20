// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ryan Gilmore
// The palette values are transcribed from Schwung, src/shared/constants.mjs:
// Copyright (c) 2025-2026 Charles Vestal, MIT License (THIRD_PARTY_NOTICES.md).
/* The Move's 128-entry LED palette and an rgb -> nearest-index map. Pure.
 *
 * Values are transcribed from the palette table in Schwung's
 * src/shared/constants.mjs (1.9.2), which documents them as the nominal
 * colours; test/palette.test.mjs re-reads that table and checks this copy.
 * The table is nominal: what an LED actually shows at a given index is for
 * the bench to judge, but nearest-by-nominal is the best the docs support. */

export const PALETTE_HEX = [
    0x000000, 0xFF4032, 0x800400, 0xC93C00, 0xAC1F00, 0x8C5018, 0x491804, 0xFADC3B,  // 0-7
    0xFFC516, 0xB6FF0E, 0x79FF18, 0x34C216, 0x4F8A04, 0x62FF55, 0x297D53, 0x269E72,  // 8-15
    0x31ADFF, 0x3663FC, 0x1A34FF, 0x1C0CE6, 0x153999, 0x3937FF, 0x5722FF, 0x972BFF,  // 16-23
    0x852178, 0xFF1032, 0xFF2BD4, 0xA63421, 0x995628, 0x876700, 0x90821F, 0x4A8700,  // 24-31
    0x007F12, 0x1853B2, 0x624BAD, 0x733A67, 0xF8BCAF, 0xFF9B76, 0xFFBF5F, 0xD9AF71,  // 32-39
    0xFFF480, 0xBFBA69, 0xBCCC88, 0xAEFF99, 0x7CDD9F, 0x89B47D, 0x80F3FF, 0x7ACEFC,  // 40-47
    0x68A1D3, 0x858FC2, 0xBBAAF2, 0xCDBBE4, 0xEF8BB0, 0x859D8C, 0x6B756E, 0x84909B,  // 48-55
    0x6A7075, 0x88859D, 0x6C6A75, 0x9D859C, 0x746A74, 0x9C9D85, 0x74756A, 0x9D8484,  // 56-63
    0x756A6A, 0x661914, 0x210806, 0x460300, 0x280000, 0x5D1700, 0x200D00, 0x470C00,  // 64-71
    0x1C0800, 0x3B2B14, 0x1C130A, 0x250E05, 0x0D0602, 0x645817, 0x201C07, 0x664E08,  // 72-79
    0x211902, 0x486605, 0x172101, 0x306609, 0x0F2103, 0x144D08, 0x061902, 0x1F3701,  // 80-87
    0x0A1100, 0x276622, 0x0C210B, 0x143E29, 0x081910, 0x004D36, 0x00180E, 0x134566,  // 88-95
    0x061621, 0x152764, 0x070C20, 0x0A1466, 0x030621, 0x0B045C, 0x03011D, 0x0A1C4C,  // 96-103
    0x040B1E, 0x161666, 0x070721, 0x220D66, 0x0B0421, 0x3C1166, 0x130521, 0x350D30,  // 104-111
    0x11040F, 0x660614, 0x210206, 0x661154, 0x21051B, 0x000000, 0x595959, 0x1A1A1A,  // 112-119
    0xFFFFFF, 0x595959, 0xCCCCCC, 0x404040, 0x141414, 0x0000FF, 0x00FF00, 0xFF0000,  // 120-127
];

export const PALETTE = PALETTE_HEX.map((h) => [(h >> 16) & 0xFF, (h >> 8) & 0xFF, h & 0xFF]);

/* Duplicates are left out of the search so a colour always lands on one
 * canonical index (117 = 0, 121 = 118). */
const SKIP = new Set([117, 121]);
const NEUTRAL = [0, 124, 119, 123, 118, 122, 120];
const CHROMA = [];
for (let i = 0; i < 128; i++) if (!SKIP.has(i)) CHROMA.push(i);

/* 7-bit protocol component (0-127, "8-bit shifted right by one") -> 8-bit. */
export const to8 = (v) => { v = Math.max(0, Math.min(127, v | 0)); return (v << 1) | (v >> 6); };

/* "Redmean" weighted distance: cheap and much better than plain RGB. */
function dist(a, r, g, b) {
    const rm = (a[0] + r) / 2;
    const dr = a[0] - r, dg = a[1] - g, db = a[2] - b;
    return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}

/* Hue in degrees of an 8-bit r, g, b, or null for a grey. */
function hueOf(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (!d) return null;
    const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
}
const PALETTE_HUE = PALETTE.map(([r, g, b]) => hueOf(r, g, b));

/* Weight of the hue term for saturated colours. Distance alone sent the
 * MPC's orange (255, 119, 0; hue 28) to a coral pink, index 1 (hue 4), and
 * not to the Move's orange, index 3: "orange seems to go pink in pad mute"
 * (Ryan, 2026-11-19). Over a full hue circle every change this makes moves
 * the pick closer in hue; red, green, blue, yellow, purple and amber keep
 * their index. */
const HUE_WEIGHT = 20;

const cache = new Map();

/* Nearest palette index for a 7-bit r, g, b. Achromatic input (all three
 * within 8 of each other) is matched against the neutral greys only, so a dim
 * white does not land on a tinted pastel. Cached: at most 2^21 keys in
 * principle, a few dozen in practice. */
export function nearestIndex(r7, g7, b7) {
    const key = ((r7 & 127) << 14) | ((g7 & 127) << 7) | (b7 & 127);
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const r = to8(r7), g = to8(g7), b = to8(b7);
    let best = 0, bestD = Infinity;
    if (r === 0 && g === 0 && b === 0) best = 0;
    else {
        const lo = Math.min(r7, g7, b7), hi = Math.max(r7, g7, b7);
        const set = (hi - lo) <= 8 ? NEUTRAL : CHROMA;
        const mx = Math.max(r, g, b), sat = (mx - Math.min(r, g, b)) / mx;
        const th = set === CHROMA && sat > 0.5 ? hueOf(r, g, b) : null;
        for (const i of set) {
            let d = dist(PALETTE[i], r, g, b);
            if (th !== null) {
                const ch = PALETTE_HUE[i];
                if (ch === null) d += 1e9;   /* a saturated colour never lands on a grey */
                else { let dh = Math.abs(ch - th); dh = Math.min(dh, 360 - dh); d += HUE_WEIGHT * dh * dh * sat; }
            }
            if (d < bestD) { bestD = d; best = i; }
        }
    }
    if (cache.size > 4096) cache.clear();
    cache.set(key, best);
    return best;
}

const dimCache = new Map();

/* A dimmer palette index for a 7-bit r, g, b that keeps the HUE. Halving the
 * colour and taking the nearest entry does not: a half-bright orange lands on
 * an olive that reads as yellow (bench, 2026-11-13). Here each darker entry
 * is scored on chromaticity first (its colour scaled to full brightness
 * against the target's) and on brightness, aiming at 40% of the target's,
 * second. Falls back to nearestIndex of the halved colour for greys. */
export function dimIndex(r7, g7, b7) {
    const key = ((r7 & 127) << 14) | ((g7 & 127) << 7) | (b7 & 127);
    const hit = dimCache.get(key);
    if (hit !== undefined) return hit;
    const r = to8(r7), g = to8(g7), b = to8(b7);
    const hi = Math.max(r, g, b), lo = Math.min(r, g, b);
    let best;
    if (hi === 0) best = 0;
    else if (hi - lo <= 16) best = nearestIndex(r7 >> 1, g7 >> 1, b7 >> 1);
    else {
        const tn = [r / hi * 255, g / hi * 255, b / hi * 255];
        let bestD = Infinity;
        best = nearestIndex(r7 >> 1, g7 >> 1, b7 >> 1);
        for (const i of CHROMA) {
            const c = PALETTE[i], m = Math.max(c[0], c[1], c[2]);
            /* Visibly lit, visibly dimmer. The floor follows the target down, so a
             * dark colour keeps its hue too (16 Levels: sixteen shades of one green
             * came out green, yellow and red; bench, 2026-11-14). */
            if (m < Math.min(40, hi * 0.25) || m > hi * 0.7) continue;
            const k = 255 / m;
            const hue = dist([c[0] * k, c[1] * k, c[2] * k], tn[0], tn[1], tn[2]);
            const lum = (m - hi * 0.4) * (m - hi * 0.4);
            const d = hue + 2 * lum;
            if (d < bestD) { bestD = d; best = i; }
        }
    }
    if (dimCache.size > 4096) dimCache.clear();
    dimCache.set(key, best);
    return best;
}
