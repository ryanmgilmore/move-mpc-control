// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ryan Gilmore
/* LED model: what each LED should show, what it was last told, and a
 * drip-fed writer between the two. Pure: the caller sends the packets.
 *
 * What the platform establishes (Schwung 1.9.2 source, not the probe):
 * - An LED is a note-on (pads 68-99, steps 16-31) or a CC (row buttons 40-43,
 *   Play 85, Rec 86, the white buttons) on internal cable 0:
 *   [0x09, 0x9c, note, value] / [0x0B, 0xBc, cc, value].
 * - The CHANNEL nibble c is the LED animation (Push 2 convention, quoted in
 *   schwung_host.c): 0 none, 0x01-0x05 one-shot transition, 0x06-0x0A pulse,
 *   0x0B-0x0F blink (constants.mjs: Pulse24th..Pulse2th, Blink24th..Blink2th).
 *   Move itself writes the base colour on channel 0 and THEN the animation,
 *   whose value is the colour it animates to (docs/CHAIN.md, measured on
 *   CC 86; src/host/clip_state.h: ch 9 = pulsing = playing clip, ch 14 =
 *   blinking = queued clip).
 * - Under overtake the host queues LED writes keyed by note/CC number, last
 *   writer wins (shadow_ui.js activateLedQueue). So the base and the
 *   animation for one LED must go out in DIFFERENT ticks, or the base is
 *   coalesced away. The engine guarantees that.
 *
 * Keys: a note LED is its note number (0-127); a CC LED is 128 + cc. */

import { nearestIndex, dimIndex } from "./palette.mjs";

export const noteKey = (n) => n & 127;
export const ccKey = (cc) => 128 + (cc & 127);

export const ANIM_SOLID = 0, ANIM_DIM = 1, ANIM_PULSE = 2, ANIM_BLINK = 3;

/* A desired LED state: s = static value (palette index or white
 * brightness), ch = animation channel (0 none), a = animation value. */
export const solid = (s) => ({ s, ch: 0, a: 0 });

/* Protocol colour entry {r,g,b,anim} -> desired state.
 *   opts.anim       "hw" (platform animation channels) or "soft" (toggle in tick)
 *   opts.pulseCh    channel for anim 2, opts.blinkCh for anim 3
 *   opts.pulseOn, opts.blinkOn   soft-mode phase, true = the bright half */
export function specFor(entry, opts) {
    if (!entry) return solid(0);
    const full = nearestIndex(entry.r, entry.g, entry.b);
    if (full === 0) return solid(0);
    const anim = entry.anim & 3;
    if (anim === ANIM_SOLID) return solid(full);
    const half = nearestIndex(entry.r >> 1, entry.g >> 1, entry.b >> 1);
    if (anim === ANIM_DIM) return solid(dimIndex(entry.r, entry.g, entry.b));   /* keeps the hue */
    if (opts && opts.anim === "soft") {
        if (anim === ANIM_PULSE) return solid(opts.pulseOn ? full : half);
        return solid(opts.blinkOn ? full : 0);
    }
    if (anim === ANIM_PULSE) return { s: half, ch: opts ? opts.pulseCh : 0x09, a: full };
    return { s: 0, ch: opts ? opts.blinkCh : 0x0D, a: full };
}

const same = (x, y) => x && y && x.s === y.s && x.ch === y.ch && (x.ch === 0 || x.a === y.a);

/* The writer. `keys` fixes the set of LEDs it owns, and their order. */
export function createLedEngine(keys, budget = 8) {
    const list = keys.slice();
    const desired = new Map();
    const shown = new Map();       /* key -> state the hardware was told, or absent = unknown */
    const baseTick = new Map();    /* key -> tick a base (ch 0) write for an animation went out */
    let cursor = 0;

    function packet(key, ch, value) {
        return key >= 128
            ? [0x0B, 0xB0 | (ch & 0x0F), key - 128, value & 0x7F]
            : [0x09, 0x90 | (ch & 0x0F), key, value & 0x7F];
    }

    return {
        keys: list,
        set(key, st) { desired.set(key, st); },
        get(key) { return desired.get(key); },
        shownState(key) { return shown.get(key); },
        /* Forget what the hardware shows: the next drains repaint everything. */
        invalidate() { shown.clear(); baseTick.clear(); },
        /* Number of LEDs whose hardware state is not yet the desired one. */
        pending() {
            let n = 0;
            for (const k of list) if (!same(desired.get(k) || solid(0), shown.get(k))) n++;
            return n;
        },
        /* Up to `budget` packets for this tick. `send(pkt)` returns false
         * when the host refused it; the LED is then left unknown and retried. */
        drain(tick, send) {
            let used = 0;
            const n = list.length;
            let scanned = 0;
            const touched = new Set();
            while (used < budget && scanned < n) {
                const key = list[cursor];
                cursor = (cursor + 1) % n;
                scanned++;
                const want = desired.get(key) || solid(0);
                const have = shown.get(key);
                if (same(want, have)) continue;
                if (touched.has(key)) continue;
                let pkt, next;
                if (want.ch === 0) {
                    pkt = packet(key, 0, want.s);
                    next = solid(want.s);
                } else if (have && have.ch === 0 && have.s === want.s && baseTick.has(key)) {
                    if (baseTick.get(key) >= tick) continue;   /* base went out this tick */
                    pkt = packet(key, want.ch, want.a);
                    next = { s: want.s, ch: want.ch, a: want.a };
                } else {
                    /* Base first; the animation follows on a later tick. */
                    pkt = packet(key, 0, want.s);
                    next = solid(want.s);
                    baseTick.set(key, tick);
                }
                touched.add(key);
                used++;
                let ok = true;
                try { ok = send(pkt) !== false; } catch (_e) { ok = false; }
                if (ok) shown.set(key, next); else { shown.delete(key); baseTick.delete(key); }
            }
            return used;
        },
    };
}
