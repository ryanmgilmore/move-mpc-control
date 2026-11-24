// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ryan Gilmore
/* src/ui.js end to end, under stubbed host globals (test/harness.mjs). */

import assert from "node:assert/strict";
import { withUi, vector, VECTORS, eq } from "./harness.mjs";
import * as P from "../src/lib/protocol.mjs";
import { nearestIndex, dimIndex } from "../src/lib/palette.mjs";

const HELLO = vector("move_to_mpc", "hello").wire;
const PING = vector("move_to_mpc", "ping").wire;
const BYE = vector("move_to_mpc", "bye").wire;
const WELCOME = vector("mpc_to_move", "welcome v5, clip workflow available").wire;
const count = (msgs, w) => msgs.filter((m) => eq(m, w)).length;

/* Move hardware messages, as onMidiMessageInternal receives them. */
const HW = {
    padOn: (p, v = 100) => [0x90, 68 + p, v], padOff: (p) => [0x80, 68 + p, 0],
    stepOn: (i) => [0x90, 16 + i, 127], stepOff: (i) => [0x80, 16 + i, 0],
    shiftOn: [0xB0, 49, 127], shiftOff: [0xB0, 49, 0],
    cc: (n, v = 127) => [0xB0, n, v],
};

async function connected(h) {
    h.init();
    h.tick();
    h.sysex(WELCOME);
    h.tick();
}

/* Shift + step button = a local shortcut. */
function modelMode(h, mode) {
    h.sysex([0xF0,0x7D,0x4D,0x50,0x42,mode,0,0,0,0,0,16,32,15,0,1,15,48,9,0,0xF7]);
}
function page(h) { h.internal(HW.shiftOn,HW.cc(14,1),HW.shiftOff); }
function shiftStep(h, i) {
    h.internal(HW.shiftOn, HW.stepOn(i), HW.stepOff(i), HW.shiftOff);
}

/* ---------------- every move_to_mpc vector from a user action ---------------- */

const ACTIONS = {
    "NOTE_REPEAT release": h => { h.init(); h.internal(HW.cc(58)); const m=h.mark(); h.internal(HW.cc(58,0)); return m; },
    "JOG_TOUCH release": h => { h.init(); h.internal([0x90,9,127]); const m=h.mark(); h.internal([0x80,9,0]); return m; },
    "METRONOME shifted step": h => { h.init(); modelMode(h,0); h.internal(HW.shiftOn); const m=h.mark(); h.internal(HW.stepOn(5)); return m; },
    "SIXTEEN_LEVEL shifted step": h => { h.init(); modelMode(h,0); h.internal(HW.shiftOn); const m=h.mark(); h.internal(HW.stepOn(12)); return m; },
    "FULL_LEVEL shifted step": h => { h.init(); modelMode(h,0); h.internal(HW.shiftOn); const m=h.mark(); h.internal(HW.stepOn(9)); return m; },

    "MODE": h => { h.init(); const m=h.mark(); h.internal(HW.cc(50)); return m; },
    "NOTE_REPEAT": h => { h.init(); const m=h.mark(); h.internal(HW.cc(58)); return m; },
    "ARM": h => { h.init(); const m=h.mark(); h.internal(HW.cc(118)); return m; },
    "COPY": h => { h.init(); const m=h.mark(); h.internal(HW.cc(60)); return m; },
    "DELETE": h => { h.init(); const m=h.mark(); h.internal(HW.cc(119)); return m; },
    "MUTE": h => { h.init(); const m=h.mark(); h.internal(HW.cc(88)); return m; },
    /* Automation and Arrange are sent as a press+release pair from Shift gestures. */
    "AUTOMATION": h => { h.init(); h.internal(HW.shiftOn); h.internal([0x90,8,127]); const m=h.mark(); h.internal([0x80,8,0]); return m; },
    "ARRANGE": h => { h.init(); h.internal(HW.shiftOn); const m=h.mark(); h.internal(HW.stepOn(2)); h.internal(HW.stepOff(2)); return m; },
    "JOG_TOUCH": h => { h.init(); const m=h.mark(); h.internal([0x90,9,127]); return m; },
    "TEMPO": h => { h.init(); shiftStep(h,4); const m=h.mark(); h.internal(HW.cc(14,1)); return m; },
    "hello": (h) => { const m = h.mark(); h.init(); return m; },
    "ping": (h) => { h.init(); h.sysex(WELCOME); const m = h.mark(); h.run(1000); return m; },
    "bye": (h) => { h.init(); h.tick(); const m = h.mark(); h.park(); return m; },
    "pad 0 (bottom-left, Move note 68) down vel 100": (h) => { h.init(); const m = h.mark(); h.internal([0x90, 68, 100]); return m; },
    "pad 31 (top-right, Move note 99) up": (h) => { h.init(); h.internal([0x90, 99, 90]); const m = h.mark(); h.internal([0x80, 99, 0]); return m; },
    "pad 12 pressure 64": (h) => { h.init(); modelMode(h, 2); h.internal(HW.padOn(12)); const m = h.mark(); h.internal([0xA0, 80, 64]); return m; },
    "knob 0 one step clockwise": (h) => { h.init(); const m = h.mark(); h.internal([0xB0, 71, 1]); return m; },
    "knob 7 two steps counter-clockwise": (h) => { h.init(); const m = h.mark(); h.internal([0xB0, 78, 126]); return m; },
    "knob 3 touched": (h) => { h.init(); const m = h.mark(); h.internal([0x90, 3, 127]); return m; },
    "knob 3 released": (h) => { h.init(); h.internal([0x90, 3, 127]); const m = h.mark(); h.internal([0x90, 3, 0]); return m; },
    "NAV_RIGHT press": (h) => { h.init(); const m = h.mark(); h.internal([0xB0, 63, 127]); return m; },
    "SHIFT release": (h) => { h.init(); h.internal(HW.shiftOn); const m = h.mark(); h.internal(HW.shiftOff); return m; },
    "ROW 0 (top) press": (h) => { h.init(); const m = h.mark(); h.internal([0xB0, 43, 127]); return m; },
    "STEP 15 press": (h) => { h.init(); const m = h.mark(); h.internal([0x90, 31, 127]); return m; },
    "SET_QLINK_PAGE Col 1-2": h => { h.init(); page(h); h.internal(HW.shiftOn); const m=h.mark(); h.internal(HW.cc(14,1)); return m; },
    "SET_QLINK_PAGE Col 3-4": h => { h.init(); page(h); page(h); h.internal(HW.shiftOn); const m=h.mark(); h.internal(HW.cc(14,1)); return m; },
    "SET_QLINK_PAGE 9-16": h => { h.init(); h.internal(HW.shiftOn); const m=h.mark(); h.internal(HW.cc(14,1)); return m; },
};

const PAIRED = ["AUTOMATION", "ARRANGE"];
for (const v of VECTORS.move_to_mpc.filter(v => !["SET_MODE play side (auto)","SET_PAD_BANK C|D","STEP_SEQ press","STEP_SEQ release","MAIN press","MAIN release","DUP_CLIP press","DUP_CLIP release","QUANTISE_ALWAYS press","QUANTISE_ALWAYS release",
    "REFRESH"].includes(v.name))) {   /* REFRESH: no Move control sends it since Setup lost Refresh (2026-11-19); the MPC still honours it */
    Deno.test(`ui: move_to_mpc '${v.name}' comes from its user action, byte-exact`, async () => {
        assert.ok(v.name in ACTIONS, "no user action mapped for vector: " + v.name);
        await withUi(async (h) => {
            const m = ACTIONS[v.name](h);
            const sent = h.sent(m);
            const want = PAIRED.includes(v.name) ? [v.wire, [v.wire[0], v.wire[1], 0]] : [v.wire];
            assert.deepEqual(sent, want, JSON.stringify(sent));
        });
    });
}

/* ---------------- lifecycle ---------------- */

Deno.test("ui: HELLO on open, PING every 1000 ms", async () => {
    await withUi(async (h) => {
        h.init();
        assert.deepEqual(h.sent()[0], HELLO);
        h.sysex(WELCOME);
        for (let i = 0; i < 5; i++) { h.run(1000); h.sysex(vector("mpc_to_move", "pong").wire); }
        const pings = h.ext.filter((c) => eq(c.packets, [0x04, 0xF0, 0x7D, 0x4D, 0x07, 0x50, 0x02, 0xF7]));
        assert.equal(pings.length, 5);
        const t0 = 1_000_000;
        assert.deepEqual(pings.map((c) => c.t - t0), [1000, 2000, 3000, 4000, 5000]);
    });
});

Deno.test("ui: 'No MPC' after 3 s of silence, HELLO retried every 2 s, WELCOME stops it", async () => {
    await withUi(async (h) => {
        const t0 = h.t;
        h.init();
        h.run(2980);
        assert.ok(!h.screen().includes("No MPC"), h.screen());
        assert.ok(h.screen().includes("MPC..."));
        h.run(40);
        assert.ok(h.screen().includes("No MPC"), h.screen());
        h.run(6000);
        const hellos = h.ext.filter((c) => eq(depack(c), [HELLO])).map((c) => c.t - t0);
        assert.deepEqual(hellos, [0, 3000, 5000, 7000, 9000]);
        h.sysex(WELCOME);
        h.run(100);
        assert.equal(h.state().conn, "connected");
        assert.ok(!h.screen().includes("MPC"), h.screen());
        const m = h.mark();
        for (let i = 0; i < 10; i++) { h.run(1000); h.sysex(vector("mpc_to_move", "pong").wire); }
        assert.equal(count(h.sent(m), HELLO), 0);
        assert.equal(count(h.sent(m), PING), 10);
    });
});

import { depacketize } from "../src/lib/usb.mjs";
const depack = (c) => depacketize(c.packets);

Deno.test("ui: Back parks: BYE once, no PING, no drawing; onResume says HELLO and repaints", async () => {
    await withUi(async (h) => {
        await connected(h);
        h.run(500);
        h.internal(HW.padOn(5));                 /* held across the park */
        const m = h.mark();
        const draws = h.drawCalls, ints = h.int.length;
        h.park(200);                              /* 4 s of parked ticks */
        const sent = h.sent(m);
        assert.deepEqual(sent, [[0x8F, 5, 0], BYE], "held pad released, then BYE, then silence");
        assert.equal(h.drawCalls, draws, "no drawing while parked");
        assert.equal(h.int.length, ints, "no LED writes while parked");
        /* host restores: onResume */
        const m2 = h.mark();
        h.resume();
        assert.deepEqual(h.sent(m2), [HELLO]);
        assert.equal(h.state().conn, "connecting");
        const i0 = h.int.length;
        h.run(400);
        assert.ok(h.int.length - i0 >= 60, "full LED repaint after resume: " + (h.int.length - i0));
        assert.equal(count(h.sent(m2), PING), 0, "no ping inside the first second");
        h.sysex(WELCOME);
        h.run(1000);
        assert.equal(count(h.sent(m2), PING), 1);
    });
});

Deno.test("ui: foreground again without onResume still says HELLO", async () => {
    await withUi(async (h) => {
        await connected(h);
        h.park(3);
        const m = h.mark();
        h.tick();
        assert.deepEqual(h.sent(m)[0], HELLO);
    });
});

Deno.test("ui: Shift+Back exit (onUnload) sends BYE first; eviction while parked sends nothing more", async () => {
    await withUi(async (h) => {
        await connected(h);
        h.internal(HW.shiftOn);                   /* host takes Back itself, then unloads us */
        const m = h.mark();
        h.unload();
        assert.deepEqual(h.sent(m), [BYE]);
    });
    await withUi(async (h) => {
        await connected(h);
        h.park();
        const m = h.mark();
        h.unload();
        assert.deepEqual(h.sent(m), []);
    });
});

Deno.test("ui: if Back ever reaches the module it parks / exits itself, BYE first", async () => {
    await withUi(async (h) => {
        await connected(h);
        globalThis.host_suspend_overtake = () => { h.suspended++; };
        const m = h.mark();
        h.internal([0xB0, 51, 127]);
        assert.deepEqual(h.sent(m), [BYE]);
        assert.equal(h.suspended, 1);
        assert.equal(h.exited, 0);
    });
    await withUi(async (h) => {
        await connected(h);
        h.internal(HW.shiftOn);
        const m = h.mark();
        h.internal([0xB0, 51, 127]);
        assert.deepEqual(h.sent(m), [BYE]);
        assert.equal(h.exited, 1);
    });
});

Deno.test("ui: the host escape (Shift + volume touch + jog click) is not consumed or forwarded", async () => {
    await withUi(async (h) => {
        await connected(h);
        const m = h.mark();
        h.internal(HW.shiftOn, [0x90, 8, 127], [0xB0, 3, 127], [0xB0, 3, 0], [0x90, 8, 0], HW.shiftOff);
        assert.deepEqual(h.sent(m), [[0xBF, 5, 127], [0xBF, 5, 0]], "only SHIFT reaches the MPC");
        assert.equal(h.exited, 0);
    });
});

Deno.test("ui: a jog click runs the selected menu item; outside a menu it does nothing", async () => {
    await withUi(async (h) => {
        await connected(h); modelMode(h, 0);
        let m = h.mark(); h.internal([0xB0, 3, 127], [0xB0, 3, 0]);
        assert.deepEqual(h.sent(m), [], "no menu: nothing sent");
        shiftStep(h, 1);   /* Setup, on Clip layout */
        m = h.mark(); h.internal([0xB0, 3, 127], [0xB0, 3, 0]);
        assert.ok(h.sent(m).some(x => eq(x, P.encodeSetMode(1))), "Clip layout changed: " + JSON.stringify(h.sent(m)));
        assert.equal(h.exited, 0);
    });
});

/* ---------------- mpc_to_move drives screen and LEDs ---------------- */

/* The last LED write for a note (or cc) and channel; returns [cin,status,n,v]. */
function lastLed(h, kind, n, ch = 0) {
    const cin = kind === "note" ? 0x09 : 0x0B;
    const st = (kind === "note" ? 0x90 : 0xB0) | ch;
    for (let i = h.int.length - 1; i >= 0; i--) {
        const p = h.int[i].pkt;
        if (p[0] === cin && p[1] === st && p[2] === n) return p;
    }
    return null;
}

Deno.test("ui: WELCOME and STATE drive the header, position, transport and LEDs", async () => {
    await withUi(async (h) => {
        await connected(h);
        h.sysex(vector("mpc_to_move", "state: Session, qlink page 0, bank 0, playing, origin 2,5, matrix 16x32, can move left+right+down").wire);
        h.run(400);
        const s = h.screen().split("\n");
        assert.equal(s[0], "Matrix"); // the layout's name alone on the top line (Ryan, 2026-11-19)
        assert.ok(s.includes("T3-10 S5-8"), "window bottom right: " + s.join("|"));
        const win = h.gfx.calls.find(c => c.text === "T3-10 S5-8");
        assert.equal(win.y, 50, "on the M and S row"); assert.ok(win.x + 0 >= 30, "right of M and S, x " + win.x);
        assert.ok(!s.some(l => l.startsWith("16x32"))); // default clip name view
        assert.ok(h.gfx.calls.find(c => c.text === s[0]).y === 0);   /* transport is on the button LEDs, not in text */
        assert.deepEqual(lastLed(h, "cc", 85), [0x0B, 0xB0, 85, 126], "Play green");
        assert.equal(lastLed(h, "cc", 62)[3], 0x40, "left available");
        assert.equal(lastLed(h, "cc", 63)[3], 0x40, "right available");
        assert.equal(lastLed(h, "cc", 54)[3], 0x40, "down available");
        assert.equal(lastLed(h, "cc", 55)[3], 0x00, "up not available");
    });
});

Deno.test("ui: PADS vector: solid red, then green base + pulse on a later tick", async () => {
    await withUi(async (h) => {
        await connected(h);
        h.run(400);
        h.sysex(vector("mpc_to_move", "pads 8..9: full red solid, half green slow pulse").wire);
        h.run(200);
        assert.deepEqual(lastLed(h, "note", 76), [0x09, 0x90, 76, 127]);
        const base = h.int.findLast((e) => e.pkt[2] === 77 && e.pkt[1] === 0x90);
        const anim = h.int.findLast((e) => e.pkt[2] === 77 && e.pkt[1] === 0x99);
        assert.ok(base && anim, "base and animation both written");
        assert.equal(base.pkt[3], nearestIndex(0, 31, 0));
        assert.equal(anim.pkt[3], nearestIndex(0, 63, 0));
        assert.ok(anim.tick > base.tick, "animation follows its base on a later tick");
    });
});

Deno.test("ui: ROWS vector: top white, bottom blue blink; STEPS vector: dim white", async () => {
    await withUi(async (h) => {
        await connected(h);
        h.run(400);
        h.sysex(vector("mpc_to_move", "rows: white, off, off, blue blink").wire);
        h.sysex(vector("mpc_to_move", "steps 0..1: dim white, off").wire);
        h.run(200);
        assert.deepEqual(lastLed(h, "cc", 43), [0x0B, 0xB0, 43, 120], "ROW 0 = CC 43 = top");
        assert.deepEqual(lastLed(h, "cc", 40, 0x0D), [0x0B, 0xBD, 40, 125], "ROW 3 blinks blue");
        assert.deepEqual(lastLed(h, "note", 16), [0x09, 0x90, 16, 118]);
        assert.deepEqual(lastLed(h, "note", 17), [0x09, 0x90, 17, 0]);
    });
});

Deno.test("ui: TEXT slots: title, subtitle, transient slot 2 for about 1.2 s", async () => {
    await withUi(async (h) => {
        await connected(h);
        h.sysex(vector("mpc_to_move", "text slot 0 'Drum 001'").wire);
        h.sysex([0xF0, 0x7D, 0x4D, 0x50, 0x46, 1, ...[...("Scene 4")].map((c) => c.charCodeAt(0)), 0xF7]);
        h.sysex([0xF0, 0x7D, 0x4D, 0x50, 0x46, 2, ...[...("Clip launched")].map((c) => c.charCodeAt(0)), 0xF7]);
        h.tick();
        const s = h.screen().split("\n");
        assert.ok(s.includes("Clip launched"));
        assert.ok(h.gfx.calls.find(c => c.text === "Clip launched").y > 8);
        h.run(1000);
        assert.ok(h.screen().includes("Clip launched"));
        h.run(300);
        assert.ok(!h.screen().includes("Clip launched"));
        assert.ok(h.screen().includes("Drum 001"));
        h.internal(HW.shiftOn); h.run(100);
        // Holding Shift keeps the normal track screen visible.
        const screens = [h.screen()]; h.run(400); screens.push(h.screen());
        assert.ok(screens.every(s => s.includes("Drum 001") && !s.includes("SHIFT + STEP")), JSON.stringify(screens));
    });
});

Deno.test("ui: QLINK name and value shown while the knob is touched", async () => {
    await withUi(async (h) => {
        await connected(h);
        h.sysex(vector("mpc_to_move", "text slot 0 'Drum 001'").wire);
        h.internal([0x90, 2, 127]);
        h.tick();
        assert.ok(h.screen().includes("Q-Link 3"), h.screen());
        h.sysex(vector("mpc_to_move", "qlink knob 2 'Cutoff' = '1.2 kHz'").wire);
        h.run(40);
        const s = h.screen().split("\n");
        assert.ok(s.includes("Cutoff")); assert.ok(s.includes("1.2 kHz"));
        const label = h.gfx.calls.find(c => c.text === "Cutoff"), value = h.gfx.calls.find(c => c.text === "1.2 kHz");
        assert.ok(label.y < value.y);
        h.internal([0x90, 2, 0]);
        h.run(40);
        assert.ok(!h.screen().includes("Cutoff"));
        assert.ok(h.screen().includes("Drum 001"), h.screen());
        /* page 2 numbering */
        page(h);
        h.internal([0x90, 2, 127]); h.run(1600);
        assert.ok(h.screen().includes("Q-Link 11"), h.screen());
    });
});

Deno.test("ui: GOODBYE: 'No MPC', MPC-driven LEDs cleared, HELLO retried", async () => {
    await withUi(async (h) => {
        await connected(h);
        h.sysex(vector("mpc_to_move", "pads 8..9: full red solid, half green slow pulse").wire);
        h.run(400);
        assert.equal(lastLed(h, "note", 76)[3], 127);
        const m = h.mark();
        h.sysex(vector("mpc_to_move", "goodbye").wire);
        assert.deepEqual(h.sent(m), [HELLO], "immediate HELLO on GOODBYE");
        h.run(400);
        assert.ok(h.screen().includes("No MPC"), h.screen());
        assert.equal(lastLed(h, "note", 76)[3], 0);
        h.run(2000);
        assert.ok(count(h.sent(m), HELLO) >= 1);
    });
});

Deno.test("ui: WELCOME with an unknown version: 'MPC script too new/old', no pings", async () => {
    for (const [ver, word] of [[6, "too new"], [4, "too old"], [3, "too old"], [2, "too old"], [1, "too old"]]) {
        await withUi(async (h) => {
            h.init(); h.tick();
            h.sysex([0xF0, 0x7D, 0x4D, 0x50, 0x41, ver, 0, 0xF7]);
            h.run(40);
            assert.ok(h.screen().replaceAll("\n", " ").includes("MPC script " + word), h.screen());
            const m = h.mark();
            h.run(5000);
            assert.deepEqual(h.sent(m), []);
            /* a STATE from such a script is ignored */
            h.sysex(vector("mpc_to_move", "state: Session, qlink page 0, bank 0, playing, origin 2,5, matrix 16x32, can move left+right+down").wire);
            assert.equal(h.state().gotState, false);
        });
    }
});

Deno.test("ui: SysEx reassembly through onMidiMessageExternal: realtime packets, channel voice, garbage", async () => {
    await withUi(async (h) => {
        h.init();
        const w = vector("mpc_to_move", "text slot 0 'Drum 001'").wire;
        h.external(w.slice(0, 3), [0xFE], w.slice(3, 6), [0xF8], w.slice(6, 9), w.slice(9, 12), [...w.slice(12), 0, 0].slice(0, 3));
        h.tick();
        assert.ok(h.screen().includes("Drum 001"), h.screen());
        assert.equal(h.state().conn, "connected", "any valid message counts as hearing the MPC");
        /* a channel-voice fragment mid-SysEx (USB-A, or an MPC track routed to
         * the Move: cable 2 is shared) is set aside, so the MPC's message survives */
        const t2 = [0xF0, 0x7D, 0x4D, 0x50, 0x46, 0, 0x58, 0x59, 0xF7];
        h.external(t2.slice(0, 3), [0x92, 60, 100], t2.slice(3, 6), t2.slice(6, 9));
        h.run(3000);
        assert.ok(h.screen().includes("XY"), h.screen());
        assert.equal(h.state().stats.extVoice, 1);
        h.sysex(w); h.tick();
        /* an over-long message is dropped */
        h.sysex([0xF0, 0x7D, 0x4D, 0x50, 0x46, 0, ...new Array(80).fill(0x5A), 0xF7]);
        h.tick();
        assert.ok(h.screen().includes("Drum 001"), h.screen());
        /* garbage of every shape: no throw, no error counted */
        let seed = 7;
        const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF) % 256;
        for (let i = 0; i < 3000; i++) {
            const n = 1 + (rnd() % 3);
            const f = []; for (let j = 0; j < n; j++) f.push(rnd());
            h.external(f);
            h.internal([rnd(), rnd() & 127, rnd() & 127]);
            if (i % 50 === 0) h.tick();
        }
        h.external([], null, undefined);
        h.internal([0x90], [], null);
        h.tick();
        assert.equal(h.state().stats.errors, 0);
    });
});

/* ---------------- LED drip-feed ---------------- */

function fullDump() {
    const out = [];
    for (let first = 0; first < 32; first += 8) {
        const d = [];
        for (let i = 0; i < 8; i++) d.push((first + i) * 4 % 128, 127 - (first + i) * 3, 40, (first + i) % 4);
        out.push([0xF0, 0x7D, 0x4D, 0x50, 0x43, first, 8, ...d, 0xF7]);
    }
    out.push([0xF0, 0x7D, 0x4D, 0x50, 0x44, 127, 0, 0, 2, 0, 127, 0, 3, 0, 0, 127, 0, 127, 127, 0, 1, 0xF7]);
    for (const first of [0, 8]) {
        const d = [];
        for (let i = 0; i < 8; i++) d.push(100, (first + i) * 7, 20, i % 4);
        out.push([0xF0, 0x7D, 0x4D, 0x50, 0x45, first, 8, ...d, 0xF7]);
    }
    return out;
}

Deno.test("ui: LED writes are drip-fed, never more than 8 per tick, and converge", async () => {
    await withUi(async (h) => {
        h.init();
        h.sysex(WELCOME);
        for (const m of fullDump()) h.sysex(m);
        h.internal(HW.shiftOn); h.internal(HW.shiftOff);
        h.run(3000);
        const perTick = new Map();
        for (const e of h.int) perTick.set(e.tick, (perTick.get(e.tick) || 0) + 1);
        const worst = Math.max(...perTick.values());
        assert.ok(worst <= 8, "worst tick wrote " + worst);
        assert.equal(h.api.leds.pending(), 0);
        /* steady state sends nothing (hw animation needs no refresh) */
        const n = h.int.length;
        h.sysex(vector("mpc_to_move", "pong").wire);
        h.run(1000);
        assert.equal(h.int.length, n);
        /* a full repaint (as on reopening the tool) is still drip-fed */
        h.api.leds.invalidate();
        const n2 = h.int.length;
        h.run(1000);
        assert.ok(h.int.length - n2 >= 60);
    });
});

Deno.test("ui: soft animation mode toggles in tick, still within budget", async () => {
    await withUi(async (h) => {
        h.api.CFG.ANIM_MODE = "soft";
        try {
        h.init();
        h.sysex(WELCOME);
        for (const m of fullDump()) h.sysex(m);
        h.run(3000);
        const perTick = new Map();
        for (const e of h.int) perTick.set(e.tick, (perTick.get(e.tick) || 0) + 1);
        assert.ok(Math.max(...perTick.values()) <= 8);
        assert.ok(h.int.every((e) => (e.pkt[1] & 0x0F) === 0), "no animation channels in soft mode");
        const blinkWrites = h.int.filter((e) => e.pkt[2] === 68 + 3).length;   /* pad 3 anim 3 */
        assert.ok(blinkWrites > 10, "pad 3 toggled " + blinkWrites);
        } finally { h.api.CFG.ANIM_MODE = "hw"; }
    });
});

/* ---------------- modes, notes, and the channel rule ---------------- */

Deno.test("ui: Notes mode plays ordinary notes in key, releases correctly, draws its own pads", async () => {
    await withUi(async (h) => {
        await connected(h);
        const m = h.mark();
        modelMode(h, 3);                                      /* Notes */
        assert.equal(h.sent(m).filter((x) => x[1] === 0x30).length, 0);
        assert.equal(h.state().mode, 3);
        const m2 = h.mark();
        h.internal(HW.padOn(0, 90), HW.padOn(8, 80));
        h.internal([0xB0, 55, 127], [0xB0, 55, 0]);            /* octave up while held */
        h.internal(HW.padOff(0), HW.padOff(8));
        h.internal(HW.padOn(0, 70), HW.padOff(0));
        assert.deepEqual(h.sent(m2), [
            [0x90, 48, 90], [0x90, 53, 80],
            [0x80, 48, 0], [0x80, 53, 0],
            [0x90, 60, 70], [0x80, 60, 0],
        ]);
        /* PADS from the MPC are ignored in Notes mode */
        h.sysex(vector("mpc_to_move", "pads 8..9: full red solid, half green slow pulse").wire);
        h.run(400);
        assert.equal(lastLed(h, "note", 68)[3], 16, "root");
        assert.equal(lastLed(h, "note", 69)[3], 118, "in scale");
        assert.notEqual(lastLed(h, "note", 76)[3], 127);
        h.run(400); // Let the expanded LED queue settle before checking a held pad.
        h.internal(HW.padOn(1));
        h.run(100);
        assert.equal(lastLed(h, "note", 69)[3], 126, "pressed");
        h.internal(HW.padOff(1));
        /* channel, root, scale, layout */
        h.internal(HW.shiftOn, [0xB0, 55, 127], [0xB0, 55, 0], HW.shiftOff);   /* channel 2 */
        h.internal(HW.shiftOn, [0xB0, 63, 127], [0xB0, 63, 0], [0xB0, 63, 127], [0xB0, 63, 0], HW.shiftOff);   /* root D (Shift + Right) */
        shiftStep(h, 8); h.internal(HW.cc(54),HW.cc(54,0),HW.cc(54),HW.cc(54,0),HW.cc(63),HW.cc(63,0),HW.cc(50),HW.cc(50,0));                                                       /* chromatic */
        const m3 = h.mark();
        h.internal(HW.padOn(1), HW.padOff(1));
        assert.deepEqual(h.sent(m3), [[0x91, 63, 100], [0x81, 63, 0]]);
        h.tick();
        h.run(1300);
        assert.ok(h.screen().includes("D Major"), h.screen());
    });
});

Deno.test("ui: a mode change releases held pads and notes", async () => {
    await withUi(async (h) => {
        await connected(h);
        h.internal(HW.padOn(3));
        const m = h.mark();
        h.sysex([0xF0, 0x7D, 0x4D, 0x50, 0x42, 3, 0, 0, 0, 0, 0, 8, 4, 0, 0, 1, 15, 48, 9, 0, 0xF7]);   /* MPC says Notes */
        assert.deepEqual(h.sent(m), [[0x8F, 3, 0]]);
        h.internal(HW.padOn(0));
        const m2 = h.mark();
        modelMode(h, 0);                                                         /* Session */
        assert.ok(h.sent(m2).some((x) => eq(x, [0x80, 48, 0])));
        const m3 = h.mark();
        h.internal(HW.padOff(0));
        assert.deepEqual(h.sent(m3), [], "release after the mode change sends nothing more");
    });
});

Deno.test("ui: Session/Rows/Pads controls", async () => {
    await withUi(async (h) => {
        await connected(h);
        const m = h.mark();
        h.internal([0xB0, 42, 127], [0xB0, 42, 0]);             /* second row button = ROW 1 */
        h.internal(HW.stepOn(2), HW.stepOff(2));
        h.internal(HW.shiftOn, HW.stepOn(2), HW.stepOff(2), HW.shiftOff);   /* shifted STEP 2 raw */
        h.internal([0xB0, 85, 127], [0xB0, 85, 0], [0xB0, 86, 127], [0xB0, 56, 127]);
        h.internal([0xB0, 14, 1], [0xB0, 14, 126]);             /* jog: next, then 2 x prev */
        // Shift+Step9 now opens Keys; transport assertions stay independent.
        h.internal([0xB0, 79, 1]);                               /* master knob: not sent */
        assert.deepEqual(h.sent(m), [
            [0xBF, 0x11, 127], [0xBF, 0x11, 0],
            [0xBF, 0x22, 127], [0xBF, 0x22, 0],
            [0xBF, 5, 127], [0xBF, 0x1A, 127], [0xBF, 0x1A, 0], [0xBF, 5, 0],   /* Shift + Step 3 = Arrange */
            [0xBF, 6, 127], [0xBF, 6, 0], [0xBF, 7, 127], [0xBF, 8, 127],
            [0xBF, 0x0B, 127], [0xBF, 0x0B, 0], [0xBF, 0x0A, 127], [0xBF, 0x0A, 0], [0xBF, 0x0A, 127], [0xBF, 0x0A, 0],
        ]);
        /* pressure only in Pads mode */
        h.internal(HW.padOn(4));
        const m2 = h.mark();
        h.internal([0xA0, 72, 50]);
        assert.deepEqual(h.sent(m2), []);
        h.internal(HW.padOff(4));
        modelMode(h, 2);
        h.internal(HW.padOn(4));
        const m3 = h.mark();
        h.internal([0xA0, 72, 50], [0xA0, 72, 50], [0xA0, 72, 51]);
        assert.deepEqual(h.sent(m3), [[0xAF, 4, 50], [0xAF, 4, 51]], "duplicate pressure suppressed");
        h.run(1300);
        assert.ok(h.screen().includes("A|B"), h.screen());
    });
});

Deno.test("ui: nothing but channel 16 and the Notes channel is ever sent", async () => {
    await withUi(async (h) => {
        await connected(h);
        const noteChannels = new Set();
        const all = () => {
            for (let p = 0; p < 32; p++) h.internal(HW.padOn(p, 1 + p * 3), [0xA0, 68 + p, p], HW.padOff(p));
            for (let i = 0; i < 16; i++) h.internal(HW.stepOn(i), HW.stepOff(i));
            for (let k = 0; k < 8; k++) h.internal([0x90, k, 127], [0xB0, 71 + k, 3], [0xB0, 71 + k, 125], [0x90, k, 0]);
            for (const cc of [40, 41, 42, 43, 49, 54, 55, 56, 62, 63, 85, 86, 88, 50, 52, 58, 60, 118, 119, 3, 14, 79]) {
                h.internal([0xB0, cc, 127], [0xB0, cc, 0]);
            }
            h.internal([0xB0, 14, 65], [0xD0, 40, 0], [0xE0, 0, 64], [0xC0, 5, 0]);
            h.tick(5);
        };
        for (const mode of [0,1,2,3]) { modelMode(h, mode); all(); }
        noteChannels.add(0);
        for (let c = 0; c < 20; c++) { h.internal(HW.shiftOn, [0xB0, 55, 127], [0xB0, 55, 0], HW.shiftOff); all(); }
        for (let c = 1; c < 15; c++) noteChannels.add(c);
        h.run(3000);
        h.park(); h.resume(); h.run(500); h.unload();
        for (const m of h.sent()) {
            if (m[0] === 0xF0) { assert.ok(m.length <= 8 && m[1] === 0x7D, JSON.stringify(m)); continue; }
            const ch = m[0] & 0x0F, type = m[0] & 0xF0;
            if (ch === 15) continue;
            assert.ok(noteChannels.has(ch) && (type === 0x90 || type === 0x80), "stray message " + JSON.stringify(m));
        }
        assert.equal(h.state().notes.channel, 15, "channel clamps at 15");
    });
});

Deno.test("ui: PING only connected; PONG and all valid messages refresh the 3500 ms link", async () => {
    await withUi(async (h) => {
        h.init(); h.run(6000);
        assert.equal(count(h.sent(), PING), 0);
        h.sysex(WELCOME);
        h.run(3480);
        assert.equal(h.state().conn, "connected");
        h.sysex(vector("mpc_to_move", "pong").wire);
        h.run(3480);
        assert.equal(h.state().conn, "connected");
        h.sysex(vector("mpc_to_move", "text slot 0 'Drum 001'").wire);
        h.run(3480);
        assert.equal(h.state().conn, "connected");
        const m = h.mark();
        h.run(20);
        assert.equal(h.state().conn, "nompc");
        assert.ok(h.screen().includes("No MPC"));
        assert.deepEqual(h.sent(m), [BYE, HELLO]);
        h.run(2000);
        assert.deepEqual(h.sent(m), [BYE, HELLO, HELLO]);
    });
});

Deno.test("ui: unknown WELCOME stops recovery until resumed", async () => {
    await withUi(async (h) => {
        h.init();
        h.sysex([0xF0, 0x7D, 0x4D, 0x50, 0x41, 1, 0, 0xF7]);
        const m = h.mark();
        h.sysex(vector("mpc_to_move", "goodbye").wire);
        h.sysex(WELCOME);
        h.run(6000);
        assert.equal(h.state().conn, "version");
        assert.deepEqual(h.sent(m), []);
        h.resume();
        assert.deepEqual(h.sent(m), [HELLO]);
    });
});

Deno.test("ui: page is optimistic and effective mode/bank follow MPC STATE", async () => {
    await withUi(async h => {
        await connected(h); page(h); assert.equal(h.state().qlinkPage,1);
        modelMode(h,2); assert.deepEqual([h.state().mode,h.state().qlinkPage,h.state().padBank],[2,0,0]);
    });
});

Deno.test("ui: Shift step LEDs override incoming STEPS", async () => {
    await withUi(async (h) => {
        await connected(h);
        h.internal(HW.shiftOn); h.tick();
        const before = Array.from({length: 8}, (_, i) => h.api.leds.get(16 + 8 + i));
        h.sysex([0xF0, 0x7D, 0x4D, 0x50, 0x45, 8, 8, ...new Array(32).fill(0), 0xF7]);
        h.tick();
        assert.deepEqual(Array.from({length: 8}, (_, i) => h.api.leds.get(24 + i)), before);
        h.internal(HW.shiftOff); h.tick();
        assert.ok(Array.from({length: 8}, (_, i) => h.api.leds.get(24 + i)).every(s => s.s === 0));
    });
});

Deno.test("ui: held pads release before MODE and bank arrows", async () => {
    await withUi(async h => {
        await connected(h); h.internal(HW.padOn(0),HW.padOn(31));
        let m=h.mark(); h.internal(HW.cc(50));
        assert.deepEqual(h.sent(m),[[0x8F,0,0],[0x8F,31,0],[0xBF,13,127]]);
        modelMode(h,2); h.internal(HW.padOn(4)); m=h.mark(); h.internal(HW.cc(63));
        assert.deepEqual(h.sent(m),[[0x8F,4,0],[0xBF,2,127]]);
        m=h.mark(); h.internal(HW.padOff(0),HW.padOff(31),HW.padOff(4)); assert.deepEqual(h.sent(m),[]);
    });
});

Deno.test("ui: WELCOME restores held Shift and knob touches after GOODBYE", async () => {
    await withUi(async (h) => {
        await connected(h);
        h.internal(HW.shiftOn, [0x90, 2, 127], [0x90, 5, 127]);
        h.sysex(vector("mpc_to_move", "goodbye").wire);
        const mark = h.mark();
        h.sysex(WELCOME);
        assert.deepEqual(h.sent(mark), [[0xBF, 5, 127], [0x9F, 0x42, 127], [0x9F, 0x45, 127]]);
        h.internal(HW.shiftOff, [0x80, 2, 0], [0x80, 5, 0]);
        assert.deepEqual(h.sent(mark).slice(3), [[0xBF, 5, 0], [0x8F, 0x42, 0], [0x8F, 0x45, 0]]);
    });
});

Deno.test("ui: duplicate Notes pitches release only their last holder", async () => {
    await withUi(async (h) => {
        await connected(h); modelMode(h, 3);
        const mark = h.mark();
        h.internal(HW.padOn(3), HW.padOn(8), HW.padOff(3));
        assert.deepEqual(h.sent(mark), [[0x90, 53, 100]]);
        h.internal(HW.padOff(8));
        assert.deepEqual(h.sent(mark), [[0x90, 53, 100], [0x80, 53, 0]]);
        h.internal(HW.padOn(3), HW.padOn(8));
        const end = h.mark(); h.park();
        assert.deepEqual(h.sent(end), [[0x80, 53, 0], BYE]);
    });
});

Deno.test("ui: realtime at callback start preserves following SysEx bytes", async () => {
    await withUi(async (h) => {
        h.init();
        h.external([0xF8, 0xF0, 0x7D], [0xF8, 0x4D, 0x50], [0x41, 5, 1], [0xF8, 0xF7, 0]);
        assert.equal(h.state().conn, "connected");
    });
});

Deno.test("ui: Shift + jog steps all four pages, clamps without wrapping and sends no track steps", async () => {
    await withUi(async (h) => {
        await connected(h);
        h.internal(HW.shiftOn);
        for (const [delta, expected] of [[127,0],[1,1],[1,2],[1,3],[1,3],[127,2],[127,1],[127,0],[127,0],[2,2],[63,3],[126,1],[65,0]]) {
            const before = h.state().qlinkPage, m = h.mark();
            h.state().qlink.fill({name:"Old page", value:"0"});
            h.internal(HW.cc(14, delta));
            assert.equal(h.state().qlinkPage, expected, `page after delta ${delta}`);
            assert.deepEqual(h.sent(m), expected === before ? [] : [P.encodeSetQlinkPage(expected)]);
            assert.ok(h.state().qlink.every(q => expected === before ? q?.name === "Old page" : q === null));
        }
        h.internal(HW.shiftOff);
    });
});

Deno.test("ui: STATE accepts each page, clears changed assignments, ignores invalid pages", async () => {
    await withUi(async h => {
        await connected(h);
        const state = vector("mpc_to_move", "state: column page 2 (Col 1-2)").wire.slice();
        for (const page of [2,3,1,0,3]) {
            h.state().qlink.fill({name:"Stale",value:"0"});
            state[6] = page; h.sysex(state);
            assert.equal(h.state().qlinkPage, page);
            assert.ok(h.state().qlink.every(q => q === null));
            h.state().qlink[0] = {name:"Current",value:"1"};
            h.sysex(state);
            assert.equal(h.state().qlink[0].name,"Current", "same-page STATE preserves fresh assignments");
        }
        for (const page of [4,127]) {
            state[6] = page; h.sysex(state);
            assert.equal(h.state().qlinkPage,3);
            assert.equal(h.state().qlink[0].name,"Current");
        }
    });
});

Deno.test("ui: Capture sends CAPTURE press and release", async () => {
    await withUi(async (h) => {
        await connected(h);
        const m = h.mark();
        h.internal([0xB0, 52, 127], [0xB0, 52, 0]);
        assert.deepEqual(h.sent(m), [[0xBF, 0x0C, 127], [0xBF, 0x0C, 0]]);
    });
});

Deno.test("ui: untouched QLINKs persist for all eight; name changes and visible value changes dirty the screen", async () => {
    await withUi(async (h) => {
        await connected(h);
        const qlink = (k, name, value = "0") => [0xF0, 0x7D, 0x4D, 0x50, 0x47, k,
            ...Array.from(name, c => c.charCodeAt(0)), 0, ...Array.from(value, c => c.charCodeAt(0)), 0xF7];
        h.state().dirty = false;
        for (let k = 0; k < 8; k++) h.sysex(qlink(k, "Target " + (k + 1)));
        assert.deepEqual(h.state().qlink, Array.from({length: 8}, (_, k) => ({name: "Target " + (k + 1), value: "0"})));
        assert.equal(h.state().dirty, true);
        h.run(1000);
        assert.ok(h.state().qlink.every(Boolean));
        h.internal([0x90, 2, 127], [0x90, 3, 127]); h.tick();
        h.sysex(qlink(2, "Hidden touched"));
        assert.equal(h.state().dirty, true, "name is visible in the retained row");
        h.run(40);
        h.sysex(qlink(3, "Visible"));
        assert.equal(h.state().dirty, true);
        h.run(40);
        h.sysex(qlink(3, "Visible"));
        assert.equal(h.state().dirty, false, "identical visible report");
        h.sysex(qlink(3, "Visible", "1"));
        assert.equal(h.state().dirty, true, "visible value changed");
        h.internal([0x80, 2, 0], [0x80, 3, 0]);
        page(h);
        assert.ok(h.state().qlink.every(q => q === null), "optimistic page clears assignments");
        for (let k = 0; k < 8; k++) h.sysex(qlink(k, "Page two"));
        h.sysex([0xF0, 0x7D, 0x4D, 0x50, 0x42, 0, 0, 0, 0, 0, 0, 8, 4, 0, 0, 1, 15, 48, 9, 0, 0xF7]);
        assert.ok(h.state().qlink.every(q => q === null), "authoritative page clears assignments");
    });
});

Deno.test('ui: idle screens stay quiet and dirty draws are capped below 30 Hz', async () => {
    await withUi(async h => {
        await connected(h);
        h.run(40);
        const draws = h.drawCalls;
        h.run(500, 2);
        assert.equal(h.drawCalls, draws, 'no periodic idle redraw');
        const times = [];
        for (let i = 0; i < 500; i++) {
            h.state().dirty = true;
            const before = h.drawCalls;
            h.tick(1,2);
            if (h.drawCalls !== before) times.push(h.t);
        }
        assert.ok(times.length <= 30);
        assert.ok(times.slice(1).every((t,i) => t-times[i] >= 34));
        assert.equal(h.state().stats.errors,0);
    });
});
Deno.test('ui: jog touch selects a display requests names without consuming host escape', async () => {
    await withUi(async h => {
        await connected(h);
        h.state().text[0] = 'Bass';
        const mark = h.mark();
        h.internal([0x90,9,127]); h.run(40);
        assert.equal(h.state().jogTouched,true);
        assert.equal(h.screen(),'Bass');
        h.internal([0x80,9,0]); h.run(40);
        assert.equal(h.state().jogTouched,false);
        assert.deepEqual(h.sent(mark),[[0xBF,23,127],[0xBF,23,0]]);
        assert.equal(h.state().stats.errors,0);
    });
});

Deno.test('ui v2: MODE, Loop, Sample, Mute, Copy, Delete and jog touch map every edge', async () => {
    await withUi(async h => {
        await connected(h);
        for (const [hw,cc] of [[50,13],[58,14],[118,15],[88,25],[60,20],[119,21]]) {
            const m=h.mark(); h.internal(HW.cc(hw),HW.cc(hw,0));
            assert.deepEqual(h.sent(m),[[0xBF,cc,127],[0xBF,cc,0]]);
        }
        for (const hw of [50,58,88,60]) {
            const cc={50:13,58:14,88:25,60:20}[hw],m=h.mark();
            h.internal(HW.shiftOn,HW.cc(hw),HW.cc(hw,0),HW.shiftOff);
            assert.deepEqual(h.sent(m),[[0xBF,5,127],[0xBF,cc,127],[0xBF,cc,0],[0xBF,5,0]]);
        }
        let m=h.mark(); h.internal(HW.shiftOn,HW.cc(119),HW.cc(119,0),HW.shiftOff);
        assert.deepEqual(h.sent(m),[[0xBF,5,127],[0xBF,5,0]]);
        modelMode(h,2); m=h.mark(); h.internal(HW.cc(60),HW.cc(119)); assert.deepEqual(h.sent(m),[]);
        m=h.mark(); h.internal([0x90,9,127],[0x80,9,0],HW.cc(3),HW.cc(79,1),[0x90,8,127]);
        assert.deepEqual(h.sent(m),[[0xBF,23,127],[0xBF,23,0]]);
    });
});

Deno.test('ui v2: Shift steps match stock labels, unused shortcuts are silent', async () => {
    await withUi(async h => {
        await connected(h); modelMode(h,0);
        for (let i=0;i<16;i++) {
            h.state().menu=null; const m=h.mark(); shiftStep(h,i);
            const raw=h.sent(m).filter(x=>x[1]!==5);
            assert.deepEqual(raw,i===0 ? [[0xBF,28,127],[0xBF,28,0]] : i===13 ? [[0xBF,27,127],[0xBF,27,0]] : i===7 ? [[0xBF,24,127],[0xBF,24,0]] : i===2 ? [[0xBF,26,127],[0xBF,26,0]] : [5,12,9,15].includes(i) ? [[0xBF,32+i,127],[0xBF,32+i,0]] : [], 'step '+(i+1));
            assert.equal(h.state().menu,({1:'setup',4:'tempo',8:'keys'})[i] ?? null);
        }
        h.state().available=0; h.state().menu=null;
        for (const i of [5,12,9,15]) { const m=h.mark(); shiftStep(h,i); assert.deepEqual(h.sent(m),[[0xBF,5,127],[0xBF,5,0]]); }
    });
});

Deno.test('ui v2: Setup, tempo and Keys menus have working navigation', async () => {
    await withUi(async h => {
        await connected(h); modelMode(h,0); shiftStep(h,1); h.run(40);
        assert.ok(h.screen().includes('Clip layout'));
        let m=h.mark(); h.internal(HW.cc(63),HW.cc(63,0));
        assert.ok(h.sent(m).some(x=>eq(x,[0xBF,48,1])));
        h.internal(HW.cc(14,1),HW.cc(63),HW.cc(63,0)); assert.equal(h.state().clockStyle,'sixteenth');
        h.internal(HW.cc(50),HW.cc(50,0)); assert.equal(h.state().menu,null);
        shiftStep(h,4); m=h.mark(); h.internal(HW.cc(14,2),HW.shiftOn,HW.cc(14,127),HW.shiftOff);
        assert.deepEqual(h.sent(m),[[0xBF,52,2],[0xBF,5,127],[0xBF,52,127],[0xBF,5,0]]);
        h.run(40); assert.ok(h.screen().includes('120.0 BPM'));
        h.internal(HW.cc(50),HW.cc(50,0)); shiftStep(h,8);
        h.internal(HW.cc(63),HW.cc(63,0)); assert.equal(h.state().notes.root,1);
        h.internal(HW.cc(14,1),HW.cc(63),HW.cc(63,0)); assert.equal(h.state().notes.scale,1);
        h.internal(HW.cc(14,1),HW.cc(63),HW.cc(63,0)); assert.equal(h.state().notes.chromatic,true);
        // Menus preserve performance releases and native Q-Link turns.
        h.internal(HW.cc(58)); shiftStep(h,1); m=h.mark(); h.internal(HW.cc(58,0),HW.cc(71,1));
        assert.deepEqual(h.sent(m),[[0xBF,14,0],[0xBF,71,1]]);
        assert.equal(h.state().stats.errors,0);
    });
});

Deno.test('ui v2: interpolated quarter/sixteenth clocks, measure strip and stop', async () => {
    await withUi(async h => {
        await connected(h); modelMode(h,2);
        h.state().playing=true;
        h.sysex(vector('mpc_to_move','position: 1 quarter in a two-bar loop, 4/4').wire);
        h.tick();
        const lit=()=>Array.from({length:16},(_,i)=>h.api.leds.get(16+i).s>0 ? i : -1).filter(i=>i>=0);
        assert.deepEqual(lit(),[4,5,6,7]);
        h.run(500); assert.deepEqual(lit(),[8,9,10,11]);
        assert.ok(h.gfx.calls.some(c=>c.kind==='fillRect' || c.kind==='line'));
        h.state().clockStyle='sixteenth'; h.tick(); assert.equal(lit().length,1);
        const before=lit()[0]; h.run(140); assert.notEqual(lit()[0],before);
        h.state().playing=false; h.tick(); assert.deepEqual(lit(),[]);
        h.state().playing=true; h.internal(HW.shiftOn); h.tick();
        assert.equal(h.api.leds.get(17).s,118,'Shift Setup overrides clock');
    });
});

Deno.test('ui v2: arm, automation, repeat and knob LEDs follow STATE', async () => {
    await withUi(async h => {
        await connected(h);
        h.sysex(vector('mpc_to_move',"qlink knob 2 'Cutoff' = '1.2 kHz'").wire);
        const state=vector('mpc_to_move','state: Session, qlink page 0, bank 0, playing, origin 2,5, matrix 16x32, can move left+right+down').wire.slice();
        h.sysex(state); h.tick();
        assert.equal(h.api.leds.get(128+118).s,127); assert.equal(h.api.leds.get(128+58).s,124);
        assert.equal(h.api.leds.get(128+88).s,0x10,'Mute is no longer the automation light'); assert.equal(h.api.leds.get(128+73).s,127);
        state[15]=1; h.sysex(state); h.tick();
        assert.equal(h.api.leds.get(128+88).s,0x10); assert.equal(h.api.leds.get(128+73).s,120);
        state[14]=0; state[15]=0; h.sysex(state); h.tick();
        assert.equal(h.api.leds.get(128+58).s,16);
        assert.equal(h.api.leds.get(128+118).s,0); assert.equal(h.api.leds.get(128+88).s,0x10);
        assert.equal(h.api.leds.get(128+71).s,0,'unnamed knob dark');
    });
});

Deno.test('ui v2: page list expires by wall time and touch has priority; jog names render', async () => {
    await withUi(async h => {
        await connected(h); h.state().qlinkList=true; page(h);
        for(let k=0;k<8;k++) h.sysex([240,125,77,80,71,k,81,48+k,0,48,247]);
        h.run(40); assert.ok(h.screen().includes('Q7'));
        h.internal(HW.shiftOn); h.run(40); assert.ok(h.screen().includes('Q7'),'page list stays while Shift is held'); h.internal(HW.shiftOff);
        h.internal([0x90,2,127]); h.run(40); assert.ok(h.screen().includes('Q-Link 11'));
        h.internal([0x80,2,0]); h.run(40); assert.ok(h.screen().includes('Q7'));
        h.run(1400,2); assert.ok(!h.screen().includes('Q7'),'1500 ms, independent of tick frequency');
        for(const [slot,name] of [[3,'Bass'],[4,'Drums'],[5,'Synth']]) h.sysex([240,125,77,80,70,slot,...Array.from(name,c=>c.charCodeAt(0)),247]);
        h.internal([0x90,9,127]); h.run(40);
        for(const name of ['Bass','Drums','Synth']) assert.ok(h.screen().includes(name),h.screen());
    });
});

Deno.test('ui v2: follows valid Move root and scale changes, guarded on older hosts', async () => {
    await withUi(async h => {
        try {
            globalThis.host_get_move_info=()=>({valid:true,changes:1,rootNote:7,scale:'Minor'});
            await connected(h); modelMode(h,3); h.run(260);
            assert.equal(h.state().notes.root,7); assert.equal(h.state().notes.scale,1);
            h.internal(HW.padOn(0)); const m=h.mark();
            globalThis.host_get_move_info=()=>({valid:true,changes:2,rootNote:2,scale:'Dorian'}); h.run(260);
            assert.ok(h.sent(m).some(x=>x[0]===0x80),'old note released');
            assert.equal(h.state().notes.root,2); assert.equal(h.state().notes.scale,2);
            globalThis.host_get_move_info=()=>{throw Error('unsupported');}; h.run(260); assert.equal(h.state().stats.errors,0);
        } finally { delete globalThis.host_get_move_info; }
    });
});

Deno.test('ui v2: preferences restore only module settings and tolerate missing storage', async () => {
    await withUi(async h => {
        let saved;
        try {
            globalThis.host_read_file=()=>JSON.stringify({clipLayout:1,clockStyle:'sixteenth'});
            globalThis.host_write_file=(_p,s)=>{saved=JSON.parse(s);return true;};
            await connected(h); assert.equal(h.state().clockStyle,'sixteenth');
            assert.ok(h.sent().some(x=>eq(x,[0xBF,48,1])));
            modelMode(h,0); assert.equal(saved.clipLayout,0);
            globalThis.host_write_file=()=>{throw Error('readonly');}; modelMode(h,1); assert.equal(h.state().stats.errors,0);
        } finally { delete globalThis.host_read_file; delete globalThis.host_write_file; }
    });
});

Deno.test("ui: Back closes an open menu and does not park; a second Back parks", async () => {
    await withUi(async (h) => {
        await connected(h);
        h.internal(HW.shiftOn, HW.stepOn(1), HW.stepOff(1), HW.shiftOff);   /* Shift+Step 2: Setup */
        const m = h.mark();
        h.internal([0xB0, 51, 127], [0xB0, 51, 0]);
        assert.equal(h.sent(m).some((x) => x[0] === 0xF0 && x[4] === 0x03), false, "no BYE while closing the menu");
        const m2 = h.mark();
        h.internal([0xB0, 51, 127], [0xB0, 51, 0]);
        assert.equal(h.sent(m2).some((x) => x[0] === 0xF0 && x[4] === 0x03), true, "second Back parks: BYE");
    });
});

Deno.test("ui: by default jog touch sends nothing and shows nothing; a bare mode name is not flashed", async () => {
    await withUi(async (h) => {
        await connected(h);
        h.api.CFG.JOG_TOUCH_LIST = false;
        const m = h.mark();
        h.internal([0x90, 9, 127], [0x80, 9, 0]);
        assert.deepEqual(h.sent(m), []);
        assert.equal(h.state().jogTouched, false);
        const before = h.state().text2Until;
        h.sysex([0xF0, 0x7D, 0x4D, 0x50, 0x46, 2, ...[..."Pads"].map((c) => c.charCodeAt(0)), 0xF7]);
        assert.equal(h.state().text2Until, before, "mode name does not start a transient");
    });
});

Deno.test("ui: Setup is Clip layout, Clock style, Quantise, StepSeqJog, Q-Link list (Ryan, 2026-11-19)", async () => {
    await withUi(async h => {
        await connected(h); modelMode(h,0);
        shiftStep(h,1);
        const labels=h.api.menuItems ? h.api.menuItems().map(x=>x.label) : null;
        const seen=[];
        for (let i=0;i<8;i++) { h.state().menuSelected=i; h.state().dirty=true; h.run(40); seen.push(h.screen()); }
        const all=seen.join("\n");
        for (const want of ["Clip layout","Clock style","Quantise","StepSeqJog","Q-Link list"]) assert.ok(all.includes(want), want+" missing");
        for (const gone of ["Refresh","Step Seq ","Jog Dial","Stress","Link/vers"]) assert.ok(!all.includes(gone), gone+" still in Setup");
        if (labels) assert.deepEqual(labels,["Clip layout","Clock style","Quantise","StepSeqJog","Q-Link list"]);
    });
});

Deno.test('ui v4: Step Seq lights replace clocks in all modes; Shift step LEDs are unchanged', async () => {
    for (let mode=0;mode<4;mode++) {
        await withUi(async h => {
            await connected(h);
            const state=vector('mpc_to_move','state: Step Seq in Pads, navigation left+right').wire.slice();
            state[5]=mode; state[8]=1; h.sysex(state);
            h.sysex(vector('mpc_to_move','steps 0..2: Step Seq note, empty, playhead').wire);
            h.sysex(vector('mpc_to_move','position: 1 quarter in a two-bar loop, 4/4').wire);
            h.run(400);
            const lights=()=>Array.from({length:16},(_,i)=>h.api.leds.get(16+i));
            const expected=[127,0,126,...new Array(13).fill(0)].map(s=>({s,ch:0,a:0}));
            assert.deepEqual(lights(),expected,'mode '+mode);
            assert.deepEqual(lastLed(h,'note',16),[0x09,0x90,16,127]);
            assert.deepEqual(lastLed(h,'note',18),[0x09,0x90,18,126]);
            h.run(500); assert.deepEqual(lights(),expected,'clock never replaces steps');
            h.internal(HW.shiftOn); h.tick();
            assert.equal(h.api.leds.get(17).s,118,'Setup legend');
            assert.equal(h.api.leds.get(16).s,118,'Main Shift step');
            h.sysex(vector('mpc_to_move','steps 0..1: dim white, off').wire); h.tick();
            assert.equal(h.api.leds.get(17).s,118,'incoming STEPS never hide Shift');
            h.sysex(vector('mpc_to_move','steps 0..2: Step Seq note, empty, playhead').wire);
            h.internal(HW.shiftOff); h.tick(); assert.deepEqual(lights(),expected);
            const main=state.slice(); main[19]=0; main[13]=15; h.sysex(main); h.tick();
            if (mode>=2) assert.equal(lights().filter(x=>x.s).length,4,'normal beat clock resumes');
            else assert.deepEqual(lights(),expected,'clip sides keep drawing STEPS');
            assert.equal(h.state().stats.errors,0);
        });
    }
});

Deno.test('ui v4: STEP and NAV vectors retain wire commands, arrows follow canMove in every mode', async () => {
    for (let mode=0;mode<4;mode++) {
        await withUi(async h => {
            await connected(h);
            const state=vector('mpc_to_move','state: Step Seq in Pads, navigation left+right').wire.slice();
            state[5]=mode; h.sysex(state); h.tick();
            const notes={...h.state().notes};
            for (const [hw,on] of [[62,true],[63,true],[55,false],[54,false]]) {
                assert.equal(h.api.leds.get(128+hw).s,on ? 64 : 0,'arrow LED '+hw);
            }
            for (const v of VECTORS.step_seq) {
                const mark=h.mark(),cc=v.wire[1],value=v.wire[2];
                if (cc>=32) h.internal(value ? HW.stepOn(cc-32) : HW.stepOff(cc-32));
                else h.internal(HW.cc(({1:62,2:63,3:55,4:54})[cc],value));
                // Up/down are disabled by the MPC's canMove bits.
                const expected=cc===3 || cc===4 ? [] : [v.wire];
                assert.deepEqual(h.sent(mark),expected,v.name+' mode '+mode);
            }
            h.internal(HW.shiftOn);
            let mark=h.mark(); h.internal(HW.cc(63),HW.cc(63,0));
            assert.deepEqual(h.sent(mark),[[0xBF,2,127],[0xBF,2,0]],'Shift still navigates bars');
            mark=h.mark(); h.internal(HW.stepOn(7),HW.stepOff(7));
            assert.deepEqual(h.sent(mark),[[0xBF,24,127],[0xBF,24,0]],'Shift Step 8 toggles Step Seq');
            assert.deepEqual(h.state().notes,notes,'Notes arrows never change the layout in Step Seq');
            assert.equal(h.state().padBank,2,'bar arrows do not change bank');
            h.internal(HW.shiftOff);
            const main=state.slice(); main[19]=0; h.sysex(main);
            if (mode===3) {
                mark=h.mark(); h.internal(HW.cc(55),HW.cc(55,0));
                assert.deepEqual(h.sent(mark),[],'Notes local arrows resume');
                assert.equal(h.state().notes.octave,notes.octave+1);
            }
            assert.equal(h.state().stats.errors,0);
        });
    }
});

Deno.test('ui v4: bar arrows retain held Pads and Notes; PADS colours survive Step Seq refresh', async () => {
    for (const mode of [2,3]) await withUi(async h => {
        await connected(h); modelMode(h,mode);
        h.sysex(vector('mpc_to_move','pads 8..9: full red solid, half green slow pulse').wire);
        const pads=structuredClone(h.state().pads);
        h.internal(HW.padOn(0));
        const state=vector('mpc_to_move','state: Step Seq in Pads, navigation left+right').wire.slice();
        state[5]=mode; state[7]=0; h.sysex(state);
        const mark=h.mark(); h.internal(HW.cc(63),HW.cc(63,0));
        assert.deepEqual(h.sent(mark),[[0xBF,2,127],[0xBF,2,0]],'no pad release on bar nav');
        assert.equal(h.state().held.size,1);
        h.api.leds.invalidate();   /* a full repaint, as on reopening the tool */
        h.sysex(vector('mpc_to_move','steps 0..2: Step Seq note, empty, playhead').wire);
        assert.deepEqual(h.state().pads,pads,'steps never overwrite PADS');
        h.sysex(vector('mpc_to_move','pads 8..9: full red solid, half green slow pulse').wire);
        assert.deepEqual(h.state().pads,pads,'cached Main refresh');
        h.internal(HW.padOff(0)); assert.equal(h.state().held.size,0);
    });
});

Deno.test('ui v5: v1-v4 WELCOME mismatch vectors stop the session', async () => {
    for (const ver of [1,2,3,4]) await withUi(async h => {
        h.init(); h.sysex(VECTORS.version_mismatch['welcome_v'+ver]); h.run(40);
        assert.equal(h.state().conn,'version');
        assert.ok(h.screen().replaceAll('\n',' ').includes('MPC script too old'));
        const mark=h.mark(); h.run(5000); assert.deepEqual(h.sent(mark),[]);
    });
});

Deno.test('ui: glyph availability and connected button LEDs on both sides', async () => {
    await withUi(async h => {
        await connected(h);
        for (const mode of [0,1,2,3]) {
            modelMode(h,mode); h.state().noteRepeat=false; h.tick();
            for (const cc of [60,119]) assert.equal(h.api.leds.get(128+cc).s,mode<2 ? 0x40 : 0x10);
            assert.equal(h.api.leds.get(128+58).s,mode<2 ? 0x10 : 0x40);
            assert.equal(h.api.leds.get(128+52).s,0x40);
            h.state().noteRepeat=true; h.tick();
            assert.equal(h.api.leds.get(128+58).s,0x7C);
        }
        h.state().available=15; h.internal(HW.shiftOn); h.tick();
        for(let i=0;i<16;i++) assert.equal(h.api.leds.get(128+16+i).s,[0,1,2,4,5,7,8,9,12,13,15].includes(i) ? 0x7C : 0);
        h.state().available=0; h.tick();
        for(let i=0;i<16;i++) assert.equal(h.api.leds.get(128+16+i).s,[0,1,2,4,7,8,13].includes(i) ? 0x7C : 0);
        h.internal(HW.shiftOff); h.tick();
        for(let i=0;i<16;i++) assert.equal(h.api.leds.get(128+16+i).s,0);
        h.state().conn='waiting'; h.tick();
        for(const cc of [60,119,58,52]) assert.equal(h.api.leds.get(128+cc).s,0);
    });
});

/* ---------------- Mute, Arrange, automation, repaints (2026-11-14) ---------------- */

function stateWithMpcMode(h, mpcMode) {
    h.sysex([0xF0,0x7D,0x4D,0x50,0x42,0,0,0,0,0,0,16,32,15,0,1,15,48,9,mpcMode,0,0xF7]);
}

Deno.test('ui: Mute LED follows the MPC mode and is dark until connected', async () => {
    await withUi(async h => {
        h.init(); h.tick();
        assert.equal(h.api.leds.get(128+88).s,0,'dark while not connected');
        await connected(h);
        for (const [mode,want] of [[0,0x10],[1,0x10],[2,0x40],[3,0x7C]]) {
            stateWithMpcMode(h,mode); h.tick();
            assert.equal(h.api.leds.get(128+88).s,want,'mpcMode '+mode);
        }
    });
});

Deno.test('ui: AUTOMATION is Shift + volume touch released, with no jog click and no menu', async () => {
    await withUi(async h => {
        await connected(h); modelMode(h,0);
        const pair=[[0xBF,5,127],[0xBF,0x16,127],[0xBF,0x16,0]];
        /* 1: Shift held, touch, release -> the pair */
        h.internal(HW.shiftOn); h.internal([0x90,8,127]);
        let m=h.mark(); assert.deepEqual(h.sent(m),[]);
        h.internal([0x80,8,0]);
        assert.deepEqual(h.sent(m),[[0xBF,0x16,127],[0xBF,0x16,0]],'sent on release, not on touch');
        h.internal(HW.shiftOff);
        /* 2: no Shift -> nothing */
        m=h.mark(); h.internal([0x90,8,127],[0x80,8,0]);
        assert.deepEqual(h.sent(m),[],'touch without Shift');
        /* 3: a jog click during the touch -> nothing */
        h.internal(HW.shiftOn); m=h.mark();
        h.internal([0x90,8,127],HW.cc(3),HW.cc(3,0),[0x80,8,0]);
        assert.deepEqual(h.sent(m),[],'jog click in between');
        /* the flag clears on the next touch */
        h.internal([0x90,8,127],[0x80,8,0]);
        assert.deepEqual(h.sent(m),[[0xBF,0x16,127],[0xBF,0x16,0]],'next clean touch works');
        h.internal(HW.shiftOff);
        /* 4: a menu is open -> nothing */
        h.internal(HW.shiftOn,HW.stepOn(1),HW.stepOff(1),HW.shiftOff);
        assert.equal(h.state().menu,'setup');
        h.internal(HW.shiftOn); m=h.mark();
        h.internal([0x90,8,127],[0x80,8,0]);
        assert.deepEqual(h.sent(m),[],'menu open');
        h.internal(HW.shiftOff);
    });
});

Deno.test('ui: every volume-touch release schedules LED repaints', async () => {
    await withUi(async h => {
        await connected(h); h.run(2000);
        h.state().repaintAt=[];
        h.internal([0x90,8,127]);
        assert.deepEqual(h.state().repaintAt??[],[],'touch alone repaints nothing');
        h.internal([0x80,8,0]);
        assert.equal(h.state().repaintAt.length,2);
        h.run(500);
        assert.equal(h.state().repaintAt.length,0,'repaints run to completion');
    });
});

Deno.test('ui: Shift + Step 3 sends Arrange; its step and glyph LEDs light like Setup', async () => {
    await withUi(async h => {
        await connected(h); modelMode(h,0);
        const m=h.mark(); shiftStep(h,2);
        assert.deepEqual(h.sent(m),[[0xBF,5,127],[0xBF,0x1A,127],[0xBF,0x1A,0],[0xBF,5,0]]);
        h.state().available=0; h.internal(HW.shiftOn); h.tick();
        assert.equal(h.api.leds.get(16+2).s,h.api.leds.get(16+1).s,'step LED matches Setup');
        assert.equal(h.api.leds.get(128+16+2).s,h.api.leds.get(128+16+1).s,'glyph LED matches Setup');
        assert.ok(h.api.leds.get(16+2).s>0);
        assert.equal(h.api.leds.get(128+16+2).s,0x7C);
        h.internal(HW.shiftOff); h.tick();
        assert.equal(h.api.leds.get(16+2).s ?? 0,h.api.leds.get(16+3).s ?? 0,'dark again after Shift');
    });
});

Deno.test('ui: a changed mpcMode in STATE schedules a full LED resend, an unchanged one does not', async () => {
    await withUi(async h => {
        await connected(h); stateWithMpcMode(h,0); h.run(2000);
        h.state().repaintAt=[];
        stateWithMpcMode(h,0);
        assert.deepEqual(h.state().repaintAt??[],[],'same mode: nothing');
        stateWithMpcMode(h,2);
        assert.equal(h.state().repaintAt.length,3,'new mode: three repaints');
        h.run(1000);
        assert.equal(h.state().repaintAt.length,0);
        assert.equal(h.state().mpcMode,2);
    });
});

Deno.test("ui: Shift + Step 16 sends the step command, or QUANTISE_ALWAYS when Setup says Always; the setting is item 8 and is saved", async () => {
    await withUi(async h => {
        await connected(h); modelMode(h,2);
        const quant=()=>{ h.internal(HW.shiftOn); const m=h.mark(); h.internal(HW.stepOn(15),HW.stepOff(15)); h.tick(); const out=h.sent(m).filter(x=>x[0]===0xBF); h.internal(HW.shiftOff); h.tick(); return out; };
        const always=['press','release'].map(edge=>vector('move_to_mpc','QUANTISE_ALWAYS '+edge).wire);
        assert.equal(h.state().quantAlways,false,"default: as the MPC behaves");
        let out=quant();
        assert.ok(out.length>0 && !out.some(x=>x[1]===P.CC.QUANTISE_ALWAYS),JSON.stringify(out));
        assert.ok(out.some(x=>x[1]===P.CC.STEP0+15));
        shiftStep(h,1); h.state().menuSelected=2; h.run(40);
        assert.ok(h.screen().includes('Quantise') && h.screen().includes('TC only'),h.screen());
        h.internal(HW.cc(3)); h.run(40);   // jog click changes the selected item
        assert.equal(h.state().quantAlways,true); assert.ok(h.screen().includes('Always'),h.screen());
        h.state().menu=null;
        out=quant(); assert.deepEqual(out,always);
        h.state().available=h.state().available & ~8;
        assert.deepEqual(quant(),[],"quantise unavailable on the MPC: nothing sent");
    });
});

Deno.test("ui: Main and duplicate Shift shortcuts send pairs and light step and glyph", async () => {
    await withUi(async h => {
        await connected(h); modelMode(h,0);
        for(const [i,cc] of [[0,P.CC.MAIN],[13,P.CC.DUP_CLIP]]) {
            h.internal(HW.shiftOn); const m=h.mark(); h.internal(HW.stepOn(i),HW.stepOff(i)); h.tick();
            const name=i===0 ? 'MAIN' : 'DUP_CLIP';
            assert.deepEqual(h.sent(m).filter(x=>x[0]===0xBF),['press','release'].map(edge=>vector('move_to_mpc',name+' '+edge).wire));
            assert.equal(h.api.leds.get(16+i).s,118); assert.equal(h.api.leds.get(128+16+i).s,124);
            h.internal(HW.shiftOff);
        }
    });
});

Deno.test("ui: an aux track darkens the play side only; the clip side shows and launches clips (Ryan, 2026-11-19)", async () => {
    await withUi(async h => {
        await connected(h);
        for(let mode=0;mode<4;mode++) {
            modelMode(h,mode); const wire=vector('mpc_to_move','state: Step Seq in Pads, navigation left+right').wire.slice();
            wire[5]=mode; wire[14]=16; h.sysex(wire); h.tick();
            if (mode<2) h.sysex(vector('mpc_to_move','pads 8..9: full red solid, half green slow pulse').wire);
            h.run(200);
            const m=h.mark(); for(let p=0;p<32;p++) h.internal(HW.padOn(p),HW.padOff(p));
            if (mode>=2) {
                assert.deepEqual(h.sent(m),[],"play side: pads silent");
                for(let p=0;p<32;p++) assert.equal(h.api.leds.get(68+p).s,0,"play side: pads dark");
            } else {
                assert.equal(h.sent(m).length,64,"clip side: every pad press and release reaches the MPC");
                assert.notEqual(h.api.leds.get(68+8).s,0,"clip side: clip colours shown");
            }
        }
    });
});

Deno.test("ui: Step Seq jog bars, Q-Links, preferences and Setup Jog Dial", async () => {
    await withUi(async h => {
        const writes=[]; globalThis.host_write_file=(_p,s)=>writes.push(JSON.parse(s));
        try {
            await connected(h); modelMode(h,2); h.state().mpcMode=1;
            assert.equal(h.state().jogDial,'bars'); h.run(40); assert.ok(h.screen().includes('Jog Dial: Bars'));
            let m=h.mark(); h.internal(HW.cc(14,3),HW.cc(14,126));
            assert.deepEqual(h.sent(m),[...Array(3).fill([P.encodeButton(2,true),P.encodeButton(2,false)]).flat(),...Array(2).fill([P.encodeButton(1,true),P.encodeButton(1,false)]).flat()]);
            m=h.mark(); h.internal(HW.shiftOn,HW.cc(14,1),HW.shiftOff);
            assert.equal(h.state().jogDial,'qlinks'); assert.equal(writes.at(-1).jogDial,'qlinks');
            assert.deepEqual(h.sent(m),[P.encodeButton(5,true),P.encodeButton(5,false)]);
            m=h.mark(); h.internal(HW.cc(14,1),HW.cc(14,127));
            assert.deepEqual(h.sent(m),[P.encodeSetQlinkPage(1),P.encodeSetQlinkPage(0)]);
            h.state().pageListUntil=0; h.state().flashUntil=0; h.state().dirty=true; h.run(40); // With two page marks the label has room in full.
            assert.ok(h.screen().includes('Jog Dial: Q-Links'),h.screen());
            shiftStep(h,1); h.state().menuSelected=3; h.run(40); assert.ok(h.screen().includes('StepSeqJog'));
            h.internal(HW.cc(63)); assert.equal(h.state().jogDial,'bars'); assert.equal(writes.at(-1).jogDial,'bars');
            globalThis.host_read_file=()=>JSON.stringify({jogDial:'qlinks'}); h.init(); h.sysex(WELCOME); assert.equal(h.state().jogDial,'qlinks');
        } finally { delete globalThis.host_write_file; delete globalThis.host_read_file; }
    });
});

Deno.test("ui: Back returns to Main or closes popup, double Back parks, boundary retries Main", async () => {
    for(const popup of [false,true]) await withUi(async h => {
        await connected(h); modelMode(h,2); h.state().mpcMode=popup ? 0 : 1; h.state().popup=popup;
        let m=h.mark(); h.internal(HW.cc(51));
        assert.deepEqual(h.sent(m),[P.encodeButton(P.CC.MAIN,true),P.encodeButton(P.CC.MAIN,false)]); assert.equal(h.state().conn,'connected');
        h.t+=1500; m=h.mark(); h.internal(HW.cc(51));
        assert.deepEqual(h.sent(m),[P.encodeButton(P.CC.MAIN,true),P.encodeButton(P.CC.MAIN,false)]);
        h.t+=1499; m=h.mark(); h.internal(HW.cc(51)); assert.ok(h.sent(m).some(x=>eq(x,BYE)));
    });
});

Deno.test("ui: 16 Levels lights a pad held on the Move white; outside the popup it does not", async () => {
    for (const popup of [true,false]) await withUi(async h => {
        await connected(h); modelMode(h,2); h.state().popup=popup;
        h.state().pads[5]={r:0,g:127,b:0,anim:0};
        h.internal(HW.padOn(5)); h.state().dirty=true; h.run(400);
        const note=68+5, held=lastLed(h,"note",note);
        assert.equal(held[3]===120,popup,JSON.stringify(held));
        h.internal(HW.padOff(5)); h.state().dirty=true; h.run(400);
        assert.notEqual(lastLed(h,"note",note)[3],120);
    });
});

Deno.test("ui: Pads mode forces dim/solid by hold, except in the mute modes where the MPC's anim is used as sent", async () => {
    const full = nearestIndex(0, 127, 0), dim = dimIndex(0, 127, 0), note = 68 + 5;
    assert.notEqual(full, dim, "palette distinguishes full from dim");
    const led = (h) => { h.state().dirty = true; h.run(400); return lastLed(h, "note", note)[3]; };
    for (const mpcMode of [2, 3]) for (const [anim, want] of [[0, full], [1, dim]]) await withUi(async h => {
        await connected(h); modelMode(h, 2); h.state().mpcMode = mpcMode;
        h.state().pads[5] = { r: 0, g: 127, b: 0, anim };
        assert.equal(led(h), want, `mpcMode ${mpcMode} anim ${anim} at rest`);
        h.internal(HW.padOn(5));
        assert.equal(led(h), want, `mpcMode ${mpcMode} anim ${anim} held`);
    });
    await withUi(async h => {
        await connected(h); modelMode(h, 2); h.state().mpcMode = 0;
        h.state().pads[5] = { r: 0, g: 127, b: 0, anim: 0 };
        assert.equal(led(h), dim, "Main: solid entry rests dim");
        h.internal(HW.padOn(5));
        assert.equal(led(h), full, "Main: full while held");
    });
});

Deno.test("ui: Back keeps parking when Main, disconnected, awaiting STATE or Shift held", async () => {
    for(const condition of ['main','disconnected','no-state','shift']) await withUi(async h => {
        await connected(h); modelMode(h,2); h.state().mpcMode=1;
        if(condition==='main') h.state().mpcMode=0;
        if(condition==='disconnected') h.state().conn='waiting';
        if(condition==='no-state') h.state().gotState=false;
        if(condition==='shift') h.internal(HW.shiftOn);
        const m=h.mark(); h.internal(HW.cc(51));
        assert.equal(count(h.sent(m),P.encodeButton(P.CC.MAIN,true)),0,condition);
        assert.ok(h.sent(m).some(x=>eq(x,BYE)),condition);
    });
});

Deno.test("ui: main view labels, scene offset, track description and status visibility", async () => {
    await withUi(async h => {
        await connected(h);
        h.state().jogDial="bars";
        const state=vector("mpc_to_move","state: mute solo arm").wire.slice();
        const send=(mode,mpcMode=0,features=97,originY=0) => {
            state[5]=mode; state[9]=0; state[10]=originY; state[14]=features; state[19]=mpcMode;
            h.sysex(state); h.run(100);
        };
        const labels=()=>h.gfx.calls.filter(c=>["M","S"].includes(c.text));
        for (const [mode,prefix] of [[0,"Matrix\n"],[1,"Transposed\n"],[2,"Pads A|B"],[3,"C Major"]]) {
            send(mode);
            assert.ok(h.screen().startsWith(prefix),h.screen());
            assert.equal(labels().length,2);
            assert.ok(labels().every(c=>c.color===0));
        }
        // Widen the header's text budget in the recorder only to inspect the
        // full label constructed by ui.js, before the renderer truncates it.
        const realWidth=globalThis.text_width;
        globalThis.text_width=s=> /^(Matrix|Transp|Step Seq)/.test(s) ? s.length : realWidth(s);
        try {
            for (const [mode,layout,short,height] of [[0,"Matrix","Matrix",4],[1,"Transposed","Transp",8]]) {
                for (const y of [0,1,5]) {
                    send(mode,0,0,y);
                    const start=y;
                    assert.ok(h.screen().startsWith(layout + "\n"),h.screen());
                    assert.ok(h.screen().includes(`T1-${mode?4:8} S${start}-${start+height-1}`),h.screen());
                }
                send(mode,1);
                assert.ok(h.screen().startsWith(`Step Seq  ${short}`));   /* Step Seq's top line is shorter */
                assert.ok(!/T1-\d S\d/.test(h.screen()), "no window line in Step Seq: " + h.screen());
                assert.ok(h.screen().includes("Jog Dial: Bars"),h.screen());
                assert.equal(labels().length,0);
            }
            send(2,1); assert.ok(h.screen().startsWith("Step Seq  Pads A|B"));
        } finally { globalThis.text_width=realWidth; }
        // The mute modes keep M and S (Ryan, fifth bench); Step Seq has its bottom line instead.
        for (const mpcMode of [2,3]) { send(2,mpcMode,0); assert.equal(labels().length,2); }
        // available bit 4 (16) = "marks": the vector's 31 has it, 15 does not.
        const setAvail=a=>{ state[16]=a; };
        setAvail(15);
        for (const [mpcMode,features] of [[0,8],[0,16],[1,0]]) {
            send(2,mpcMode,features); assert.equal(labels().length,0);
            if(features&16) assert.ok(!h.gfx.calls.some(c=>c.kind==="text" && c.y===0 && c.x===2));
        }
        // Aux track: M/S only with the marks bit; non-aux either way; never popup or Step Seq.
        send(2,0,16); assert.equal(labels().length,0,"aux without marks");
        send(2,0,0); assert.equal(labels().length,2,"non-aux without marks bit");
        setAvail(31);
        send(2,0,16); assert.equal(labels().length,2,"aux with marks (Audio track)");
        send(2,0,0); assert.equal(labels().length,2,"non-aux with marks bit");
        send(2,0,8); assert.equal(labels().length,0,"popup");
        send(2,0,24); assert.equal(labels().length,0,"popup and aux with marks");
        send(2,1,16); assert.equal(labels().length,0,"Step Seq on aux with marks");
        send(2,1,0); assert.equal(labels().length,0,"Step Seq");
        setAvail(15);
        send(2,0,0); assert.equal(labels().length,2,"non-aux, marks bit clear");
        setAvail(31);
        send(2,4,0); assert.equal(labels().length,2);
        send(2,0,0);
        assert.equal(labels().length,2); assert.ok(labels().every(c=>c.color===1));
        h.sysex([240,125,77,80,70,1,...new TextEncoder().encode("Soft Saw"),247]); h.run(100);
        assert.ok(h.gfx.calls.some(c=>c.text==="Soft Saw" && c.y===33));
        h.sysex([240,125,77,80,72,247]); h.run(100); assert.equal(labels().length,0);
    });
});

Deno.test("ui: Step Seq bottom line: lane left once picked, jog setting right, cleared by a new track or No lane", async () => {
    await withUi(async h => {
        await connected(h);
        h.state().jogDial="bars";
        const state=vector("mpc_to_move","state: mute solo arm").wire.slice();
        state[5]=2; state[14]=0; state[19]=1; h.sysex(state); h.run(100);
        const text=(slot,s)=>{ h.sysex([240,125,77,80,70,slot,...new TextEncoder().encode(s),247]); h.run(100); h.state().text2Until=0; h.state().flashUntil=0; h.state().dirty=true; h.run(40); };
        const at=s=>h.gfx.calls.find(c=>c.text===s);
        assert.ok(!h.screen().includes("Lane:"),h.screen());
        h.sysex([240,125,77,80,70,2,...new TextEncoder().encode("Lane A02"),247]); h.run(100);
        assert.equal(h.state().text2Until,0,"a lane pick is not flashed");
        const lane=at("Lane: A02"), jog=at("Jog: Bars"); // beside a lane the setting drops " Dial": 128 px
        assert.ok(lane && jog,h.screen());
        assert.equal(lane.y,jog.y); assert.ok(lane.x<jog.x); assert.ok(lane.y>=40 && lane.y<58);
        text(2,"No lane"); assert.ok(!h.screen().includes("Lane:"));
        text(2,"Lane B06"); assert.ok(at("Lane: B06"));
        text(0,"Another track"); assert.ok(!h.screen().includes("Lane:"));
        assert.ok(at("Jog Dial: Bars"));
        // "@Lane": the MPC's own lane, read on entry: stored, never flashed.
        h.sysex([240,125,77,80,70,2,...new TextEncoder().encode("@Lane C05"),247]); h.run(100);
        assert.equal(h.state().text2Until,0); assert.ok(at("Lane: C05"),h.screen());
    });
});

Deno.test('ui: Q-Link list defaults off, opts in, never starts in Step Seq or flashes TEXT', async () => {
    for (const enabled of [false,true]) for (const stepSeq of [false,true]) {
        await withUi(async h => {
            await connected(h);
            assert.equal(h.state().qlinkList,false);
            h.state().qlinkList=enabled;
            const state=vector('mpc_to_move','state: mute solo arm').wire.slice();
            state[19]=stepSeq?1:0; h.sysex(state); h.run(40);
            page(h);
            h.sysex([240,125,77,80,70,2,...new TextEncoder().encode('Q-Links 9-16'),247]);
            for(let k=0;k<8;k++) h.sysex([240,125,77,80,71,k,81,48+k,0,48,247]);
            h.run(40);
            assert.equal(h.screen().includes('Q7'),enabled&&!stepSeq,h.screen());
            assert.ok(!h.screen().includes('Q-Links 9-16'),'TEXT slot 2 is never flashed');
            assert.equal(h.state().text2Until,0);
        });
    }
});

Deno.test('ui: Setup item 6 toggles and persists Q-Link list On/Off', async () => {
    await withUi(async h => {
        let saved;
        try {
            globalThis.host_read_file=()=>JSON.stringify({qlinkList:true});
            globalThis.host_write_file=(_p,s)=>{saved=JSON.parse(s);};
            await connected(h); assert.equal(h.state().qlinkList,true);
            shiftStep(h,1); h.state().menuSelected=4; h.state().dirty=true; h.run(40);
            assert.ok(h.screen().includes('Q-Link list')); assert.ok(h.screen().includes('On'));
            h.internal(HW.cc(63),HW.cc(63,0)); h.run(40);
            assert.equal(saved.qlinkList,false); assert.ok(h.screen().includes('Off'));
            h.internal(HW.cc(63),HW.cc(63,0)); h.run(40);
            assert.equal(saved.qlinkList,true); assert.ok(h.screen().includes('On'));
            globalThis.host_read_file=()=>JSON.stringify(saved);
            await connected(h); assert.equal(h.state().qlinkList,true,'stored preference restored');
        } finally {delete globalThis.host_read_file; delete globalThis.host_write_file;}
    });
});

Deno.test("ui: settings saved under the working name are read once when the renamed tool has none (2026-11-19)", async () => {
    await withUi(async h => {
        const reads = [];
        globalThis.host_read_file = p => { reads.push(p); return p.includes("/tools/movepads/") ? JSON.stringify({clipLayout:1, clockStyle:"sixteenth", jogDial:"qlinks", qlinkList:true, quantAlways:true}) : null; };
        try {
            await connected(h);
            const st = h.state();
            assert.equal(st.clipLayout, 1); assert.equal(st.clockStyle, "sixteenth"); assert.equal(st.jogDial, "qlinks");
            assert.equal(st.qlinkList, true); assert.equal(st.quantAlways, true);
            assert.ok(reads[0].includes("/tools/move-mpc-control/config.json"), "the new path first: " + reads[0]);
        } finally { delete globalThis.host_read_file; }
    });
});

/* ---------------- protocol v5: note entry and clip creation (§12) ---------------- */

const SYSEX = (...b) => [0xF0, 0x7D, 0x4D, 0x50, ...b, 0xF7];
const NOTE_STEPS = (bar, on, cov) => {
    const bits = (l) => l.reduce((a, i) => a | (1 << i), 0);
    const tri = (v) => [v & 127, (v >> 7) & 127, (v >> 14) & 127];
    return SYSEX(0x4B, bar, ...tri(bits(on)), ...tri(bits(cov)));
};
const stepLed = (h, i) => lastLed(h, "note", 16 + i)[3];
const stepSeqMode = (h) => { const w = [0xF0,0x7D,0x4D,0x50,0x42,3,0,0,0,0,0,16,32,15,0,1,15,48,9,1,0xF7]; h.sysex(w); };
const LEFT = (h) => h.internal(HW.cc(62), HW.cc(62, 0));
const RIGHT = (h) => h.internal(HW.cc(63), HW.cc(63, 0));
async function notesUi(h) { await connected(h); modelMode(h, 3); h.run(600); }

Deno.test("ui v5: Notes Left/Right page the bar (clamped), send NOTE_BAR, show Bar n and say it", async () => {
    await withUi(async (h) => {
        await notesUi(h);
        const m = h.mark();
        LEFT(h);
        assert.deepEqual(h.sent(m), [], "bar 1 is the floor: nothing sent");
        RIGHT(h); RIGHT(h);
        assert.deepEqual(h.sent(m), [SYSEX(0x14, 1), SYSEX(0x14, 2)]);
        h.run(400);
        assert.ok(h.screen().includes("Bar 3"), h.screen());
        assert.equal(h.spoken.at(-1), "Bar 3");
        for (let i = 0; i < 10; i++) RIGHT(h);
        assert.equal(h.state().noteBar, 7);
        assert.deepEqual(h.sent(m).at(-1), SYSEX(0x14, 7));
        assert.equal(h.sent(m).filter((x) => x[4] === 0x14).length, 7, "no NOTE_BAR past bar 8");
        assert.equal(h.state().notes.root, 0, "plain arrows no longer move the root");
    });
});

Deno.test("ui v5: Notes root is Shift + Left/Right, scale only in the menu, octave and channel unchanged", async () => {
    await withUi(async (h) => {
        await notesUi(h);
        const m = h.mark();
        h.internal(HW.shiftOn, HW.cc(63), HW.cc(63, 0), HW.shiftOff);
        assert.equal(h.state().notes.root, 1);
        h.internal(HW.shiftOn, HW.cc(62), HW.cc(62, 0), HW.cc(62), HW.cc(62, 0), HW.shiftOff);
        assert.equal(h.state().notes.root, 11, "wraps");
        assert.equal(h.state().notes.scale, 0, "Shift + arrows never touch the scale");
        assert.equal(h.state().noteBar, 0);
        const oct0 = h.state().notes.octave;
        h.internal(HW.cc(55), HW.cc(55, 0));
        assert.equal(h.state().notes.octave, oct0 + 1);
        h.internal(HW.shiftOn, HW.cc(55), HW.cc(55, 0), HW.shiftOff);
        assert.equal(h.state().notes.channel, 2);
        assert.equal(h.sent(m).filter((x) => x[0] === 0xF0 && x[4] === 0x14).length, 0, "no NOTE_BAR from any of these");
    });
});

Deno.test("ui v5: a held step, then a pad, sends NOTE_ADD with the pad's note and velocity, and the pad sounds", async () => {
    await withUi(async (h) => {
        await notesUi(h);
        const m = h.mark();
        h.internal(HW.stepOn(5));
        assert.deepEqual(h.sent(m), [], "a step press sends nothing by itself");
        h.internal(HW.padOn(0, 90));
        assert.deepEqual(h.sent(m), [[0x90, 48, 90], SYSEX(0x10, 5, 0, 48, 90)]);
        h.internal(HW.padOn(1, 70));
        assert.deepEqual(h.sent(m).at(-1), SYSEX(0x10, 5, 0, 50, 70));
        h.internal(HW.stepOff(5));
        assert.equal(h.sent(m).some((x) => x[4] === 0x13), false, "a used hold does not clear");
        h.internal(HW.padOff(0), HW.padOff(1));
    });
});

Deno.test("ui v5: pads without a held step send only the note; the step button sends no CC in Notes", async () => {
    await withUi(async (h) => {
        await notesUi(h);
        const m = h.mark();
        h.internal(HW.padOn(0, 90), HW.padOff(0));
        assert.deepEqual(h.sent(m), [[0x90, 48, 90], [0x80, 48, 0]]);
        const m2 = h.mark();
        h.internal(HW.stepOn(2)); h.internal(HW.stepOff(2));
        assert.equal(h.sent(m2).some((x) => x[0] === 0xBF), false);
    });
});

Deno.test("ui v5: tapping a step clears it; a hold that did something does not", async () => {
    await withUi(async (h) => {
        await notesUi(h);
        const m = h.mark();
        h.internal(HW.stepOn(5), HW.stepOff(5));
        assert.deepEqual(h.sent(m), [SYSEX(0x13, 5, 0)]);
        const m2 = h.mark();
        h.internal(HW.stepOn(6)); h.internal(HW.cc(14, 1)); h.internal(HW.stepOff(6));
        assert.deepEqual(h.sent(m2), [SYSEX(0x12, 6, 0, 1)], "a jog click is a use");
        const m3 = h.mark();
        h.internal(HW.stepOn(7), HW.stepOn(9), HW.stepOff(9), HW.stepOff(7));
        assert.deepEqual(h.sent(m3), [SYSEX(0x11, 7, 0, 3)], "a length is a use; the later step clears nothing");
    });
});

Deno.test("ui v5: the jog nudges a held step's length by one click and does not change track", async () => {
    await withUi(async (h) => {
        await notesUi(h);
        h.internal(HW.stepOn(5));
        const m = h.mark();
        h.internal(HW.cc(14, 1), HW.cc(14, 127));
        assert.deepEqual(h.sent(m), [SYSEX(0x12, 5, 0, 1), SYSEX(0x12, 5, 0, 127)]);
        assert.equal(h.sent(m).some((x) => x[0] === 0xBF), false, "no TRACK_NEXT / TRACK_PREV");
        h.internal(HW.stepOff(5));
        const m2 = h.mark();
        h.internal(HW.cc(14, 1));
        assert.deepEqual(h.sent(m2), [[0xBF, 0x0B, 127], [0xBF, 0x0B, 0]], "the jog is the track again");
    });
});

Deno.test("ui v5: a later step sets the length; only the first held step is the target", async () => {
    await withUi(async (h) => {
        await notesUi(h);
        const m = h.mark();
        h.internal(HW.stepOn(4), HW.stepOn(8));
        assert.deepEqual(h.sent(m), [SYSEX(0x11, 4, 0, 5)], "step 8 is length 5 from step 4");
        h.internal(HW.stepOn(2));
        assert.equal(h.sent(m).length, 1, "a step to the left of the target does nothing");
        h.internal(HW.padOn(0, 80));
        assert.deepEqual(h.sent(m).at(-1), SYSEX(0x10, 4, 0, 48, 80), "pads still go to the first step");
        h.internal(HW.stepOff(8), HW.stepOff(2), HW.stepOff(4), HW.padOff(0));
        assert.equal(h.sent(m).some((x) => x[4] === 0x13), false);
    });
});

Deno.test("ui v5: pads held first are added when the step goes down, and count as use", async () => {
    await withUi(async (h) => {
        await notesUi(h);
        h.internal(HW.padOn(0, 90), HW.padOn(2, 60));
        const m = h.mark();
        h.internal(HW.stepOn(3));
        assert.deepEqual(h.sent(m), [SYSEX(0x10, 3, 0, 48, 90), SYSEX(0x10, 3, 0, 52, 60)]);
        h.internal(HW.stepOff(3));
        assert.equal(h.sent(m).length, 2, "released without a clear");
        h.internal(HW.padOff(0), HW.padOff(2));
    });
});

Deno.test("ui v5: paging a bar keeps the held step's absolute index", async () => {
    await withUi(async (h) => {
        await notesUi(h);
        RIGHT(h);                       /* bar 2 */
        h.internal(HW.stepOn(5));
        RIGHT(h);                       /* bar 3, step still down */
        const m = h.mark();
        h.internal(HW.padOn(0, 100));
        assert.deepEqual(h.sent(m).at(-1), SYSEX(0x10, 21, 0, 48, 100), "bar 2 step 6 is absolute 21");
        h.internal(HW.stepOn(1));
        assert.deepEqual(h.sent(m).at(-1), SYSEX(0x11, 21, 0, 13), "the later step is read on the shown bar: absolute 33, length 13");
        h.internal(HW.padOff(0), HW.stepOff(1), HW.stepOff(5));
        const m2 = h.mark();
        h.internal(HW.stepOn(0), HW.stepOff(0));
        assert.deepEqual(h.sent(m2), [SYSEX(0x13, 32, 0)], "a fresh tap on bar 3 is absolute 32");
    });
});

Deno.test("ui v5: step LEDs follow NOTE_STEPS for the shown bar: on, covered, held; other bars ignored", async () => {
    await withUi(async (h) => {
        await notesUi(h);
        h.run(400);
        for (let i = 0; i < 16; i++) assert.equal(stepLed(h, i), 0, "dark before any NOTE_STEPS");
        h.sysex(NOTE_STEPS(0, [0, 8], [9, 10, 11]));
        h.run(600);
        assert.equal(stepLed(h, 0), 122); assert.equal(stepLed(h, 8), 122);
        for (const i of [9, 10, 11]) assert.equal(stepLed(h, i), 118);
        assert.equal(stepLed(h, 1), 0); assert.equal(stepLed(h, 12), 0);
        h.sysex(NOTE_STEPS(1, [3], []));
        h.run(600);
        assert.equal(stepLed(h, 3), 0, "bar 2's reply is not drawn on bar 1");
        assert.equal(stepLed(h, 0), 122);
        h.internal(HW.stepOn(10));
        h.run(600);
        assert.equal(stepLed(h, 10), 120, "held: bright white");
        h.internal(HW.stepOff(10));
        h.run(600);
        assert.equal(stepLed(h, 10), 118);
        RIGHT(h); h.run(600);
        for (let i = 0; i < 16; i++) assert.equal(stepLed(h, i), 0, "paging blanks until the MPC answers");
        h.sysex(NOTE_STEPS(1, [3], [4]));
        h.run(600);
        assert.equal(stepLed(h, 3), 122); assert.equal(stepLed(h, 4), 118);
    });
});

Deno.test("ui v5: a held step is lit on its own bar only, wherever the page is", async () => {
    await withUi(async (h) => {
        await notesUi(h);
        h.internal(HW.stepOn(2));
        RIGHT(h); h.run(600);
        assert.equal(stepLed(h, 2), 0, "the held step is on bar 1, which is not shown");
        LEFT(h); h.run(600);
        assert.equal(stepLed(h, 2), 120);
    });
});

Deno.test("ui v5: Step Seq keeps v4 step buttons and Notes entry does not apply with Shift or a menu", async () => {
    await withUi(async (h) => {
        await connected(h); stepSeqMode(h); h.tick();
        const m = h.mark();
        h.internal(HW.stepOn(5), HW.stepOff(5));
        assert.deepEqual(h.sent(m), [[0xBF, 0x25, 127], [0xBF, 0x25, 0]]);
        const m2 = h.mark();
        h.internal(HW.padOn(0)); h.internal(HW.stepOn(5)); h.internal(HW.cc(63), HW.cc(63, 0));
        assert.equal(h.sent(m2).some((x) => x[0] === 0xF0), false, "no v5 SysEx in Step Seq");
        h.internal(HW.padOff(0), HW.stepOff(5));
    });
    await withUi(async (h) => {
        await notesUi(h);
        const m = h.mark();
        shiftStep(h, 5);       /* Shift + Step 6: metronome, as before */
        assert.equal(h.sent(m).some((x) => x[0] === 0xF0), false);
        shiftStep(h, 8);       /* Keys & Scales menu */
        const m2 = h.mark();
        h.internal(HW.stepOn(3), HW.stepOff(3));
        assert.deepEqual(h.sent(m2), [[0xBF, 0x23, 127], [0xBF, 0x23, 0]], "with a menu open a step is a step again");
    });
});

Deno.test("ui v5: leaving Notes mode drops any step hold without a clear", async () => {
    await withUi(async (h) => {
        await notesUi(h);
        h.internal(HW.stepOn(5));
        modelMode(h, 0);
        const m = h.mark();
        h.internal(HW.stepOff(5));
        assert.deepEqual(h.sent(m), []);
    });
});

Deno.test("ui v5: a second press of one clip pad inside 400 ms sends CLIP_CREATE after its pad message", async () => {
    for (const mode of [0, 1]) await withUi(async (h) => {
        await connected(h); modelMode(h, mode);
        const m = h.mark();
        h.internal(HW.padOn(24)); h.internal(HW.padOff(24));
        assert.deepEqual(h.sent(m), [[0x9F, h.sent(m)[0][1], 100], [0x8F, h.sent(m)[0][1], 0]]);
        assert.equal(h.sent(m).some((x) => x[0] === 0xF0), false, "once is a launch");
        h.run(200);
        h.internal(HW.padOn(24));
        const sent = h.sent(m);
        assert.equal(sent.at(-2)[0], 0x9F, "the pad message comes first");
        assert.deepEqual(sent.at(-1), SYSEX(0x15, 24));
        h.internal(HW.padOff(24));
        h.run(100);
        h.internal(HW.padOn(24));
        assert.equal(sent.length + 1 + 1, h.sent(m).length, "a third tap sends only its pad message");
        h.internal(HW.padOff(24));
    });
});

Deno.test("ui v5: double tap needs the same pad and 400 ms or less; Pads and Notes never create clips", async () => {
    await withUi(async (h) => {
        await connected(h); modelMode(h, 0);
        const m = h.mark();
        h.internal(HW.padOn(3)); h.internal(HW.padOff(3)); h.run(500);
        h.internal(HW.padOn(3)); h.internal(HW.padOff(3));
        h.internal(HW.padOn(4)); h.internal(HW.padOff(4));
        h.run(100);
        h.internal(HW.padOn(3)); h.internal(HW.padOff(3));
        assert.equal(h.sent(m).some((x) => x[0] === 0xF0), false, "slow, or a different pad between: no create");
    });
    for (const mode of [2, 3]) await withUi(async (h) => {
        await connected(h); modelMode(h, mode);
        const m = h.mark();
        h.internal(HW.padOn(3)); h.internal(HW.padOff(3)); h.internal(HW.padOn(3)); h.internal(HW.padOff(3));
        assert.equal(h.sent(m).some((x) => x[0] === 0xF0), false);
    });
});

Deno.test("ui v5: a resumed or reconnected MPC is told the Move's bar again", async () => {
    await withUi(async (h) => {
        await notesUi(h);
        RIGHT(h); RIGHT(h);
        h.sysex(vector("mpc_to_move", "goodbye").wire); h.tick();
        const m = h.mark();
        h.sysex(WELCOME); h.tick();
        assert.ok(h.sent(m).some((x) => eq(x, SYSEX(0x14, 2))));
    });
});

Deno.test('Step Seq header shows the knobs\' parameter from the Q-Link names, in place of the view (Ryan, 2026-11-24)', async () => {
    await withUi(async h => {
        await connected(h); modelMode(h,2);
        h.sysex(vector('mpc_to_move','state: Step Seq in Pads, navigation left+right').wire); h.tick(); h.run(40);
        assert.ok(h.screen().startsWith("Step Seq  Pads "), h.screen());   /* no names yet: the view */
        const qlink = (k, name, value) => h.sysex([0xF0,0x7D,0x4D,0x50,0x47,k,...[...name].map(c=>c.charCodeAt(0)),0,...[...value].map(c=>c.charCodeAt(0)),0xF7]);
        for (let k = 0; k < 8; k++) qlink(k, `STEP ${k+1} RATCHET`, "OFF");
        h.tick(); h.run(40);
        assert.ok(h.screen().startsWith("Step Seq  Ratchet"), h.screen());
        for (let k = 0; k < 8; k++) qlink(k, `STEP ${k+1} PROBABILITY`, "100%");
        h.tick(); h.run(40);
        assert.ok(h.screen().startsWith("Step Seq  Prob.\n"), h.screen());
        for (let k = 0; k < 8; k++) qlink(k, `STEP ${k+1} VELOCITY`, "100%");
        h.tick(); h.run(40);
        assert.ok(h.screen().startsWith("Step Seq  Velocity\n"), h.screen());   /* fits uncut */
        assert.equal(h.state().stats.errors, 0);
    });
});

Deno.test('v5 step entry works on any MPC screen but Step Seq and the mute modes (first v5 bench: Grid View is mpcMode 4)', async () => {
    await withUi(async h => {
        await connected(h); modelMode(h,3);
        for (const [mm, expect] of [[4, true], [0, true], [1, false], [2, false], [3, false]]) {
            h.state().mpcMode = mm;
            const m = h.mark();
            h.internal([0x90, 16 + 2, 127], [0x90, 80, 100], [0x80, 80, 0], [0x80, 16 + 2, 0]);
            const adds = h.sent(m).filter(x => x[0] === 0xF0 && x[4] === 0x10);
            assert.equal(adds.length > 0, expect, 'mpcMode ' + mm);
        }
    });
});
