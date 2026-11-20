// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ryan Gilmore
import assert from "node:assert/strict";
import * as P from "../src/lib/protocol.mjs";
import { createAssembler, sysexPackets, voicePacket, depacketize, packetsFor } from "../src/lib/usb.mjs";
import { PALETTE, PALETTE_HEX, nearestIndex, dimIndex, to8 } from "../src/lib/palette.mjs";
import { createLedEngine, specFor, solid, noteKey, ccKey } from "../src/lib/leds.mjs";
import * as N from "../src/lib/notes.mjs";
import * as L from "../src/lib/layout.mjs";
import { NUM_QLINK_PAGES, QLINK_PAGE_LABELS, qlinkIndex } from "../src/lib/qlinks.mjs";
import { VECTORS, vector } from "./harness.mjs";

/* ---------------- protocol: encoders against move_to_mpc ---------------- */

const ENCODED = {
    "DUP_CLIP press": P.encodeButton(P.CC.DUP_CLIP,true),
    "DUP_CLIP release": P.encodeButton(P.CC.DUP_CLIP,false),
    "MAIN press": P.encodeButton(P.CC.MAIN,true),
    "MAIN release": P.encodeButton(P.CC.MAIN,false),
    "QUANTISE_ALWAYS press": P.encodeButton(P.CC.QUANTISE_ALWAYS,true),
    "QUANTISE_ALWAYS release": P.encodeButton(P.CC.QUANTISE_ALWAYS,false),
    "hello": P.encodeHello(),
    "ping": P.encodePing(),
    "bye": P.encodeBye(),
    "pad 0 (bottom-left, Move note 68) down vel 100": P.encodePadDown(L.padIndex(68), 100),
    "pad 31 (top-right, Move note 99) up": P.encodePadUp(L.padIndex(99)),
    "pad 12 pressure 64": P.encodePadPressure(12, 64),
    "knob 0 one step clockwise": P.encodeKnobDelta(0, 1),
    "knob 7 two steps counter-clockwise": P.encodeKnobDelta(7, 126),
    "knob 3 touched": P.encodeKnobTouch(3, true),
    "knob 3 released": P.encodeKnobTouch(3, false),
    "NAV_RIGHT press": P.encodeButton(P.CC.NAV_RIGHT, true),
    "SHIFT release": P.encodeButton(P.CC.SHIFT, false),
    "ROW 0 (top) press": P.encodeButton(P.CC.ROW0 + 0, true),
    "STEP 15 press": P.encodeButton(P.CC.STEP0 + 15, true),
    "SET_MODE play side (auto)": P.encodeSetMode(P.MODES.PADS),
    "SET_QLINK_PAGE 9-16": P.encodeSetQlinkPage(1),
    "SET_QLINK_PAGE Col 1-2": P.encodeSetQlinkPage(2),
    "SET_QLINK_PAGE Col 3-4": P.encodeSetQlinkPage(3),
    "SET_PAD_BANK C|D": P.encodeSetPadBank(2),
    "REFRESH": P.encodeRefresh(),
    "STEP_SEQ press": P.encodeButton(P.CC.STEP_SEQ, true),
    "STEP_SEQ release": P.encodeButton(P.CC.STEP_SEQ, false),
    "MODE": P.encodeButton(P.CC.MODE, true),
    "NOTE_REPEAT": P.encodeButton(P.CC.NOTE_REPEAT, true),
    "ARM": P.encodeButton(P.CC.ARM, true),
    "COPY": P.encodeButton(P.CC.COPY, true),
    "DELETE": P.encodeButton(P.CC.DELETE, true),
    "AUTOMATION": P.encodeButton(P.CC.AUTOMATION, true),
    "MUTE": P.encodeButton(P.CC.MUTE, true),
    "ARRANGE": P.encodeButton(P.CC.ARRANGE, true),
    "JOG_TOUCH": P.encodeButton(P.CC.JOG_TOUCH, true),
    "NOTE_REPEAT release": P.encodeButton(P.CC.NOTE_REPEAT, false),
    "JOG_TOUCH release": P.encodeButton(P.CC.JOG_TOUCH, false),
    "METRONOME shifted step": P.encodeButton(P.CC.STEP0+5, true),
    "SIXTEEN_LEVEL shifted step": P.encodeButton(P.CC.STEP0+12, true),
    "FULL_LEVEL shifted step": P.encodeButton(P.CC.STEP0+9, true),
    "TEMPO": P.encodeValue(P.CC.TEMPO, 1),
};

Deno.test("protocol: every move_to_mpc vector has an encoder and matches byte-exactly", () => {
    for (const v of VECTORS.move_to_mpc) {
        assert.ok(v.name in ENCODED, "no encoder mapped for vector: " + v.name);
        assert.deepEqual(ENCODED[v.name], v.wire, v.name);
    }
});

Deno.test("protocol: Move->MPC SysEx stays within 8 bytes (§5)", () => {
    for (const m of [P.encodeHello(), P.encodePing(), P.encodeBye()]) assert.ok(m.length <= 8);
});

/* ---------------- protocol: decoder against mpc_to_move ---------------- */

Deno.test("protocol: every mpc_to_move vector decodes, to 'decoded' where given", () => {
    for (const v of VECTORS.mpc_to_move) {
        const m = P.decode(v.wire);
        assert.ok(m, "did not decode: " + v.name);
        if (!v.decoded) continue;
        for (const [k, want] of Object.entries(v.decoded)) assert.deepEqual(m[k], want, v.name + " ." + k);
    }
});

Deno.test("protocol: specific decodes", () => {
    assert.deepEqual(P.decode(vector("mpc_to_move", "welcome v4, clip workflow available").wire),
        { type: "welcome", ver: 4, flags: 1, clipWorkflow: true });
    const rows = P.decode(vector("mpc_to_move", "rows: white, off, off, blue blink").wire);
    assert.deepEqual(rows.rows[0], { r: 127, g: 127, b: 127, anim: 0 });
    assert.deepEqual(rows.rows[3], { r: 0, g: 0, b: 127, anim: 3 });
    const steps = P.decode(vector("mpc_to_move", "steps 0..1: dim white, off").wire);
    assert.equal(steps.first, 0);
    assert.deepEqual(steps.steps, [{ r: 127, g: 127, b: 127, anim: 1 }, { r: 0, g: 0, b: 0, anim: 0 }]);
    assert.equal(P.decode(vector("mpc_to_move", "goodbye").wire).type, "goodbye");
    assert.deepEqual(P.decode(vector("mpc_to_move", "pong").wire), { type: "pong" });
});

Deno.test("protocol: unknown, reserved, short and foreign messages decode to null", () => {
    const H = [0xF0, 0x7D, 0x4D, 0x50];
    assert.equal(P.decode([...H, 0x60, 1, 2, 0xF7]), null, "reserved 0x60");
    assert.equal(P.decode([...H, 0x6F, 0xF7]), null, "reserved 0x6F");
    assert.equal(P.decode([...H, 0x55, 0xF7]), null, "unknown");
    assert.equal(P.decode([...H, 0x42, 0, 0, 0, 0xF7]), null, "short STATE");
    assert.equal(P.decode([...H, 0x43, 0, 2, 1, 2, 3, 0, 0xF7]), null, "short PADS");
    assert.equal(P.decode([...H, 0x43, 0, 9, ...new Array(36).fill(1), 0xF7]), null, "PADS n > 8");
    assert.equal(P.decode([...H, 0x43, 30, 4, ...new Array(16).fill(1), 0xF7]), null, "PADS past pad 31");
    assert.equal(P.decode([...H, 0x45, 12, 5, ...new Array(20).fill(1), 0xF7]), null, "STEPS past 15");
    assert.equal(P.decode([...H, 0x46, 6, 65, 0xF7]), null, "TEXT bad slot");
    assert.equal(P.decode([...H, 0x47, 8, 65, 0, 66, 0xF7]), null, "QLINK bad knob");
    assert.equal(P.decode([...H, 0x41, 1, 0xF7]), null, "short WELCOME");
    assert.equal(P.decode([0xF0, 0x7E, 0x4D, 0x50, 0x41, 1, 1, 0xF7]), null, "foreign header");
    assert.equal(P.decode([0xF0, 0x7D]), null, "tiny");
    assert.equal(P.decode(null), null);
});

Deno.test("protocol: TEXT is capped at 40 chars, QLINK name 20 / value 16, non-printables replaced", () => {
    const H = [0xF0, 0x7D, 0x4D, 0x50];
    const t = P.decode([...H, 0x46, 1, ...new Array(45).fill(65), 0xF7]);
    assert.equal(t.text.length, 40);
    const q = P.decode([...H, 0x47, 0, ...new Array(25).fill(66), 0, ...new Array(20).fill(67), 0xF7]);
    assert.equal(q.name.length, 20); assert.equal(q.value.length, 16);
    const nz = P.decode([...H, 0x47, 1, 65, 66, 0xF7]);
    assert.equal(nz, null);
    assert.equal(P.decode([...H, 0x46, 0, 65, 0x07, 66, 0xF7]).text, "A?B");
});

/* ---------------- USB framing ---------------- */

Deno.test("usb: HELLO packets are exactly what the probe sent on the device", () => {
    assert.deepEqual(sysexPackets(P.encodeHello()),
        [0x04, 0xF0, 0x7D, 0x4D, 0x04, 0x50, 0x01, 0x04, 0x06, 0x00, 0xF7, 0x00]);
    assert.deepEqual(sysexPackets(P.encodePing()), [0x04, 0xF0, 0x7D, 0x4D, 0x07, 0x50, 0x02, 0xF7]);
    assert.deepEqual(sysexPackets([0xF0, 1, 2, 3, 0xF7]), [0x04, 0xF0, 1, 2, 0x06, 3, 0xF7, 0]);
    assert.deepEqual(sysexPackets([0xF0, 1, 2, 0xF7]), [0x04, 0xF0, 1, 2, 0x05, 0xF7, 0, 0]);
});

Deno.test("usb: channel voice goes on cable 2 as the probe proved", () => {
    assert.deepEqual(voicePacket([0x9F, 3, 100]), [0x29, 0x9F, 3, 100]);
    assert.deepEqual(voicePacket([0x8F, 3, 0]), [0x28, 0x8F, 3, 0]);
    assert.deepEqual(voicePacket([0xBF, 73, 1]), [0x2B, 0xBF, 73, 1]);
    assert.deepEqual(voicePacket([0xAF, 12, 64]), [0x2A, 0xAF, 12, 64]);
    assert.deepEqual(voicePacket([0x90, 60, 90]), [0x29, 0x90, 60, 90]);
});

Deno.test("usb: depacketize inverts packetsFor for every vector", () => {
    for (const v of [...VECTORS.move_to_mpc, ...VECTORS.mpc_to_move]) {
        assert.deepEqual(depacketize(packetsFor(v.wire)), [v.wire], v.name);
    }
});

/* ---------------- SysEx assembler ---------------- */

function frag(wire, n = 3) {
    const out = [];
    for (let i = 0; i < wire.length; i += n) out.push(wire.slice(i, i + n));
    return out;
}

Deno.test("assembler: 1-, 2- and 3-byte fragments, with end padding", () => {
    for (const v of VECTORS.mpc_to_move) {
        for (const n of [1, 2, 3]) {
            const a = createAssembler(64);
            const got = [];
            for (const f of frag(v.wire, n)) {
                const p = f.slice(); while (n === 3 && p.length < 3) p.push(0);
                got.push(...a.feed(p));
            }
            assert.deepEqual(got, [v.wire], v.name + " /" + n);
        }
    }
});

Deno.test("assembler: realtime bytes interleaved mid-message are skipped", () => {
    const w = vector("mpc_to_move", "text slot 0 'Drum 001'").wire;
    const a = createAssembler(64);
    const got = [];
    got.push(...a.feed([w[0], 0xF8, w[1]]));
    got.push(...a.feed([0xFE]));
    got.push(...a.feed(w.slice(2, 8)));
    got.push(...a.feed([0xFA, ...w.slice(8)]));
    assert.deepEqual(got, [w]);
});

Deno.test("assembler: any other status byte aborts; F0 restarts; idle data ignored", () => {
    const w = vector("mpc_to_move", "goodbye").wire;
    const a = createAssembler(64);
    assert.deepEqual(a.feed([0xF0, 0x7D, 0x4D]), []);
    assert.deepEqual(a.feed([0x90, 60, 100]), []);           /* aborts */
    assert.equal(a.active, false);
    assert.deepEqual(a.feed([0x50, 0x48, 0xF7]), [], "tail of the aborted message is not a message");
    assert.deepEqual(a.feed([0xF0, 0x7D, 0x4D, 0xF0, ...w.slice(1)]), [w], "second F0 restarts");
    assert.deepEqual(a.feed([0x01, 0x02, 0x03]), [], "data while idle");
    assert.ok(a.stats.aborted >= 2);
});

Deno.test("assembler: a message longer than the cap is discarded, the next one survives", () => {
    const a = createAssembler(64);
    const big = [0xF0, 0x7D, 0x4D, 0x50, 0x46, 0, ...new Array(70).fill(65), 0xF7];
    let got = [];
    for (const f of frag(big)) got.push(...a.feed(f));
    assert.deepEqual(got, []);
    assert.equal(a.stats.overflow, 1);
    const exact = [0xF0, ...new Array(62).fill(1), 0xF7];   /* 64 bytes: allowed */
    got = [];
    for (const f of frag(exact)) got.push(...a.feed(f));
    assert.deepEqual(got, [exact]);
    const over = [0xF0, ...new Array(63).fill(1), 0xF7];    /* 65 bytes: not */
    got = [];
    for (const f of frag(over)) got.push(...a.feed(f));
    assert.deepEqual(got, []);
});

/* ---------------- palette ---------------- */

Deno.test("palette: matches the table in Schwung's constants.mjs", async () => {
    let src;
    try {
        src = await Deno.readTextFile(new URL("../.schwung/src/shared/constants.mjs", import.meta.url));
    } catch (e) {
        /* Not cloned on this machine (git clone https://github.com/charlesvestal/schwung .schwung), or run
         * without --allow-read: say so rather than pass silently. */
        console.log("  SKIPPED palette cross-check: " + (e && e.name));
        return;
    }
    const hdr = src.slice(0, src.indexOf("*/"));
    const ref = new Map();
    for (const m of hdr.matchAll(/(\d+)\s*:\s*#([0-9A-Fa-f]{6})/g)) ref.set(+m[1], parseInt(m[2], 16));
    for (const m of hdr.matchAll(/(?:dim|dark)\s+(\d+)\s+#([0-9A-Fa-f]{6})/g)) ref.set(+m[1], parseInt(m[2], 16));
    assert.equal(ref.size, 128);
    for (let i = 0; i < 128; i++) assert.equal(PALETTE_HEX[i], ref.get(i), "index " + i);
});

Deno.test("palette: nearest index", () => {
    assert.equal(to8(127), 255); assert.equal(to8(0), 0); assert.equal(to8(64), 129);
    assert.equal(nearestIndex(0, 0, 0), 0);
    assert.equal(nearestIndex(127, 0, 0), 127);
    assert.equal(nearestIndex(0, 127, 0), 126);
    assert.equal(nearestIndex(0, 0, 127), 125);
    assert.equal(nearestIndex(127, 127, 127), 120);
    assert.equal(nearestIndex(63, 63, 63), 118, "dim white lands on a neutral grey");
    /* every palette colour (7-bit) finds itself or an identical-looking twin */
    for (let i = 1; i < 128; i++) {
        const [r, g, b] = PALETTE[i];
        const j = nearestIndex(r >> 1, g >> 1, b >> 1);
        const d = PALETTE[j].map((c, k) => Math.abs(c - PALETTE[i][k]));
        assert.ok(Math.max(...d) <= 40, `index ${i} -> ${j}`);
    }
    assert.equal(nearestIndex(40, 90, 10), nearestIndex(40, 90, 10), "cached result stable");
});

/* ---------------- LED engine ---------------- */

const OPTS = { anim: "hw", pulseCh: 0x09, blinkCh: 0x0D };

Deno.test("leds: specFor solid / dim / pulse / blink / soft", () => {
    assert.deepEqual(specFor({ r: 127, g: 0, b: 0, anim: 0 }, OPTS), solid(127));
    assert.deepEqual(specFor(null, OPTS), solid(0));
    assert.deepEqual(specFor({ r: 0, g: 0, b: 0, anim: 3 }, OPTS), solid(0));
    const dim = specFor({ r: 127, g: 0, b: 0, anim: 1 }, OPTS);
    assert.equal(dim.ch, 0); assert.notEqual(dim.s, 127); assert.notEqual(dim.s, 0);
    const pulse = specFor({ r: 0, g: 63, b: 0, anim: 2 }, OPTS);
    assert.equal(pulse.ch, 0x09); assert.equal(pulse.a, nearestIndex(0, 63, 0)); assert.equal(pulse.s, nearestIndex(0, 31, 0));
    assert.deepEqual(specFor({ r: 0, g: 0, b: 127, anim: 3 }, OPTS), { s: 0, ch: 0x0D, a: 125 });
    const soft = { anim: "soft", pulseOn: true, blinkOn: false };
    assert.deepEqual(specFor({ r: 0, g: 0, b: 127, anim: 3 }, soft), solid(0));
    assert.deepEqual(specFor({ r: 0, g: 0, b: 127, anim: 3 }, { ...soft, blinkOn: true }), solid(125));
    assert.deepEqual(specFor({ r: 0, g: 127, b: 0, anim: 2 }, soft), solid(126));
});

Deno.test("leds: engine respects the budget and paints everything eventually", () => {
    const keys = [];
    for (let n = 68; n < 100; n++) keys.push(noteKey(n));
    for (let n = 16; n < 32; n++) keys.push(noteKey(n));
    keys.push(ccKey(40), ccKey(85));
    const e = createLedEngine(keys, 8);
    for (const k of keys) e.set(k, solid(5));
    const out = [];
    for (let t = 1; t <= 20; t++) {
        const pk = [];
        const n = e.drain(t, (p) => { pk.push(p); return true; });
        assert.ok(n <= 8 && pk.length <= 8, "tick " + t + ": " + pk.length);
        out.push(...pk);
    }
    assert.equal(e.pending(), 0);
    assert.equal(out.length, keys.length);
    assert.deepEqual(out.find((p) => p[2] === 40), [0x0B, 0xB0, 40, 5]);
    assert.deepEqual(out.find((p) => p[2] === 68 && p[0] === 0x09), [0x09, 0x90, 68, 5]);
    /* nothing changes: nothing sent */
    assert.equal(e.drain(21, () => true), 0);
});

Deno.test("leds: an animation is its base on one tick, the animation on a later one", () => {
    const e = createLedEngine([noteKey(77)], 8);
    e.set(77, { s: 85, ch: 0x09, a: 11 });
    const log = [];
    const send = (t) => (p) => { log.push([t, ...p]); return true; };
    e.drain(1, send(1));
    e.drain(1, send(1));       /* same tick again: still no animation */
    e.drain(2, send(2));
    e.drain(3, send(3));
    assert.deepEqual(log, [[1, 0x09, 0x90, 77, 85], [2, 0x09, 0x99, 77, 11]]);
    /* back to solid: a channel-0 write cancels the animation */
    e.set(77, solid(85));
    e.drain(4, send(4));
    assert.deepEqual(log.at(-1), [4, 0x09, 0x90, 77, 85]);
});

Deno.test("leds: a refused write is retried; invalidate repaints", () => {
    const e = createLedEngine([noteKey(68)], 8);
    e.set(68, solid(3));
    assert.equal(e.drain(1, () => false), 1);
    assert.equal(e.pending(), 1);
    e.drain(2, () => true);
    assert.equal(e.pending(), 0);
    e.invalidate();
    assert.equal(e.pending(), 1);
    let sent = null;
    e.drain(3, (p) => { sent = p; return true; });
    assert.deepEqual(sent, [0x09, 0x90, 68, 3]);
});

/* ---------------- notes layouts ---------------- */

Deno.test("notes: in-key layout is in fourths and stays in the scale", () => {
    const c = N.defaultNotes();
    assert.equal(N.baseNote(c), 48); assert.equal(N.noteName(48), "C2"); assert.equal(N.noteName(60), "C3");
    assert.equal(N.padNote(c, 0), 48);
    assert.equal(N.padNote(c, 1), 50);           /* next degree */
    assert.equal(N.padNote(c, 7), 60);           /* degree 7 = octave */
    assert.equal(N.padNote(c, 8), 53);           /* row up = 3 degrees = F, a fourth */
    assert.equal(N.padNote(c, 31), 76);
    for (let p = 0; p < 32; p++) assert.notEqual(N.padRole(c, p), "out");
    assert.equal(N.padRole(c, 0), "root"); assert.equal(N.padRole(c, 7), "root"); assert.equal(N.padRole(c, 1), "scale");
});

Deno.test("notes: chromatic layout, root, out-of-scale and range", () => {
    const c = { ...N.defaultNotes(), chromatic: true, root: 2 };   /* D major */
    assert.equal(N.padNote(c, 0), 50); assert.equal(N.padNote(c, 1), 51); assert.equal(N.padNote(c, 8), 55);
    assert.equal(N.padRole(c, 0), "root"); assert.equal(N.padRole(c, 1), "out"); assert.equal(N.padRole(c, 2), "scale");
    const hi = { ...N.defaultNotes(), chromatic: true, octave: 10, root: 11 };
    assert.equal(N.padNote(hi, 31), -1); assert.equal(N.padRole(hi, 31), "none");
    const pent = { ...N.defaultNotes(), scale: N.SCALES.findIndex((s) => s.name === "Min Pent") };
    assert.equal(N.padNote(pent, 5), 60);        /* five-note scale wraps after 5 pads */
    assert.equal(N.clampOctave(-3), 0); assert.equal(N.clampOctave(99), 8);
});

/* ---------------- coordinates ---------------- */

Deno.test("layout: protocol coordinate vectors", () => {
    for (const v of VECTORS.coordinates) {
        const p = L.padAt(v.moveRow, v.moveCol);
        assert.equal(p, v.pad);
        assert.equal(L.padIndex(L.padNoteOf(p)), p);
        if (v.mode === 0) assert.deepEqual(L.sessionClip(p), { clipColumn: v.clipColumn, clipRow: v.clipRow });
        if (v.mode === 1) assert.deepEqual(L.rowsClip(p), { clipColumn: v.clipColumn, clipRow: v.clipRow });
        if (v.mode === 2) assert.equal(L.virtualPad(p, v.padBank), v.virtualPad);
    }
    assert.equal(L.rowButtonIndex(43), 0); assert.equal(L.rowButtonIndex(40), 3);
    assert.equal(L.bankLetter(0), "A"); assert.equal(L.bankLetter(7), "H");
});

Deno.test("protocol: QLINK requires a NUL separator, including empty strings", () => {
    assert.equal(P.decode([0xF0, 0x7D, 0x4D, 0x50, 0x47, 0, 65, 0xF7]), null);
    assert.equal(P.decode([0xF0, 0x7D, 0x4D, 0x50, 0x47, 0, 0xF7]), null);
    assert.deepEqual(P.decode([0xF0, 0x7D, 0x4D, 0x50, 0x47, 0, 0, 0xF7]),
        { type: "qlink", knob: 0, name: "", value: "" });
});

Deno.test("Q-Links: all four page mappings match the shared protocol vectors", () => {
    assert.equal(NUM_QLINK_PAGES, 4);
    assert.deepEqual(QLINK_PAGE_LABELS, ["Q1-8", "Q9-16", "Col 1-2", "Col 3-4"]);
    for (let page = 0; page < 4; page++) {
        assert.deepEqual(Array.from({length: 8}, (_, k) => qlinkIndex(page, k)), VECTORS.qlink_pages[page]);
    }
});

Deno.test('protocol v4: mpcMode is the required final STATE byte for all five values', () => {
    const state=vector('mpc_to_move','state: Step Seq in Pads, navigation left+right').wire.slice();
    for (let mpcMode=0;mpcMode<=4;mpcMode++) {
        state[19]=mpcMode;
        assert.equal(P.decode(state).mpcMode,mpcMode);
    }
    state.splice(19,1);
    assert.equal(P.decode(state),null,'v3 STATE is short');
});

Deno.test("palette: sixteen shades of one green keep their hue through dimIndex", () => {
    const bad = [];
    for (let k = 0; k < 16; k++) {
        const g7 = Math.round(8 + k * (127 - 8) / 15);
        const idx = dimIndex(0, g7, 0);
        if (idx === 0) continue;                       /* black: only the very darkest may drop out */
        const [r, g, b] = PALETTE[idx];
        if (!(g >= r && g >= b && g > Math.max(r, b))) bad.push({ g7, idx, rgb: [r, g, b] });
    }
    assert.deepEqual(bad, [], "non-green entries: " + JSON.stringify(bad));
});

Deno.test("protocol: all seven feature bits are independent of existing flags", () => {
    const wire=vector("mpc_to_move","state: Step Seq in Pads, navigation left+right").wire.slice();
    for(let bits=0;bits<128;bits++) {
        wire[14]=bits; const m=P.decode(wire);
        for(const [i,key] of ["armed","noteRepeat","metronome","popup","aux","muted","solo"].entries()) assert.equal(m[key],!!(bits & (1<<i)),key);
    }
});

Deno.test("palette: the MPC's orange is the Move's orange, not a pink; primaries keep their index (Ryan, 2026-11-19)", () => {
    assert.equal(nearestIndex(127, 59, 0), 3, "FF7700 -> index 3 (C93C00), was 1 (FF4032, coral pink)");
    assert.equal(nearestIndex(127, 0, 0), 127);
    assert.equal(nearestIndex(0, 127, 0), 126);
    assert.equal(nearestIndex(0, 0, 127), 125);
    assert.equal(nearestIndex(127, 127, 0), 7);
    assert.equal(nearestIndex(127, 90, 0), 8, "amber");
    assert.equal(nearestIndex(64, 0, 127), 23, "purple");
    assert.equal(nearestIndex(64, 64, 64), 118, "greys still go to the neutral set");
    assert.equal(nearestIndex(127, 120, 118), 120, "near-white is not tinted");
});
