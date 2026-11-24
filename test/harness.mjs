// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ryan Gilmore
import { recordingGfx } from "./recording-gfx.mjs";
/* Runs src/ui.js under stubbed Schwung host globals. ui.js is imported ONCE
 * (a static import, so plain `deno test` needs no permissions); every test
 * calls init(), which rebuilds all of ui.js's state, exactly as a fresh tool
 * open does on the Move. The host globals are looked up at call time, so
 * each loadUi() can swap in fresh stubs. */

import { depacketize } from "../src/lib/usb.mjs";
import VECTORS_JSON from "../protocol/vectors.json" with { type: "json" };

export const VECTORS = VECTORS_JSON;
export const vector = (dir, name) => {
    const v = VECTORS[dir].find((x) => x.name === name);
    if (!v) throw new Error("no vector " + name);
    return v;
};

const realNow = Date.now;
const CALLBACKS = ["init", "tick", "onMidiMessageInternal", "onMidiMessageExternal", "onUnload", "onResume"];
await import("../src/ui.js");
const CB = {};
for (const f of CALLBACKS) CB[f] = globalThis[f];

export function loadUi() {
    const h = {
        t: 1_000_000,
        tickNo: 0,
        ext: [],          /* one entry per move_midi_external_send call: {tick, t, packets} */
        int: [],          /* one entry per move_midi_internal_send call: {tick, pkt} */
        drawCalls: 0,
        exited: 0,
        suspended: 0,
        extRefuse: false,
    };
    globalThis.move_midi_external_send = (pk) => {
        h.ext.push({ tick: h.tickNo, t: h.t, packets: [...pk] });
        return !h.extRefuse;
    };
    globalThis.move_midi_internal_send = (pk) => {
        h.int.push({ tick: h.tickNo, pkt: [...pk] });
        return true;
    };
    h.gfx = recordingGfx();
    globalThis.clear_screen = () => { h.gfx.clear(); h.drawCalls++; };
    for (const [host, method] of Object.entries({print:'print', text_width:'textWidth',
        set_font:'setFont', get_font_height:'fontHeight', draw_line:'drawLine', fill_rect:'fillRect', draw_rect:'drawRect', set_pixel:'setPixel'})) {
        globalThis[host] = (...args) => h.gfx[method](...args.map((v,i) => host === 'set_font' && i === 0
            ? (v.endsWith('/font.png') ? 'default' : v.split('/').at(-1).replace('.png','')) : v));
    }
    globalThis.host_exit_module = () => { h.exited++; };
    h.spoken = [];    /* every screen-reader announcement, in order */
    globalThis.host_send_screenreader = (text) => { h.spoken.push(text); };
    delete globalThis.host_suspend_overtake;
    delete globalThis.overtakeParked;
    Date.now = () => h.t;

    const cb = CB;
    h.cb = cb;
    h.api = globalThis.__moveMpcControl;
    /* The jog-touch track list is off by default (rejected at the bench) but stays
     * built and tested: the suites run with it on unless a test turns it off. */
    h.api.CFG.JOG_TOUCH_LIST = true;
    h.state = () => globalThis.__moveMpcControl.state;

    h.init = () => cb.init();
    h.tick = (n = 1, ms = 20) => {
        for (let i = 0; i < n; i++) { h.t += ms; h.tickNo++; cb.tick(); }
    };
    /* Advance `ms` of wall time in 20 ms ticks. */
    h.run = (ms, step = 20) => h.tick(Math.round(ms / step), step);
    h.internal = (...msgs) => { for (const m of msgs) cb.onMidiMessageInternal(m); };
    h.external = (...frags) => { for (const f of frags) cb.onMidiMessageExternal(f); };
    /* Deliver a wire message the way the host does: 3-byte fragments, padded. */
    h.sysex = (wire, size = 3) => {
        for (let i = 0; i < wire.length; i += size) {
            const f = wire.slice(i, i + size);
            while (f.length < 3) f.push(0);
            cb.onMidiMessageExternal(f);
        }
    };
    h.park = (ticks = 1) => {
        globalThis.overtakeParked = true;
        try { h.tick(ticks); } finally { globalThis.overtakeParked = false; }
    };
    h.resume = () => cb.onResume();
    h.unload = () => cb.onUnload();

    /* Every wire message sent so far (or since `from`), decoded from packets. */
    h.sent = (from = 0) => h.ext.slice(from).flatMap((c) => depacketize(c.packets));
    h.mark = () => h.ext.length;
    h.screen = () => h.gfx.calls.filter(c => c.kind === "text").map(c => c.text).join("\n");
    h.close = () => { Date.now = realNow; };
    return h;
}

export async function withUi(fn) {
    const h = await loadUi();
    try { return await fn(h); } finally { h.close(); }
}

export const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
