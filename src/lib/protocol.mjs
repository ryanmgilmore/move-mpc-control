// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ryan Gilmore
/* Move MPC Control wire protocol v4, the Move side. The wire protocol is the contract;
 * this file only encodes what it says. Pure: no host globals.
 *
 * Every function here returns WIRE bytes (a full MIDI message, F0..F7 for
 * SysEx). Turning them into USB-MIDI packets is usb.mjs's job. */

export const PROTOCOL_VERSION = 4;
export const HEADER = [0x7D, 0x4D, 0x50];          /* 7D non-commercial, "MP" */
export const MOVE_CH = 0x0F;                        /* channel 16, 0-based */

/* ---- Move -> MPC SysEx commands (§2.4) ---- */
export const CMD_HELLO = 0x01;
export const CMD_PING = 0x02;
export const CMD_BYE = 0x03;

/* ---- MPC -> Move SysEx commands (§3) ---- */
export const CMD_WELCOME = 0x41;
export const CMD_STATE = 0x42;
export const CMD_PADS = 0x43;
export const CMD_ROWS = 0x44;
export const CMD_STEPS = 0x45;
export const CMD_TEXT = 0x46;
export const CMD_QLINK = 0x47;
export const CMD_GOODBYE = 0x48;
export const CMD_PONG = 0x49;
export const CMD_POSITION = 0x4A;

/* ---- Move -> MPC command CCs (§2.3) ---- */
export const CC = Object.freeze({
    NAV_LEFT: 0x01, NAV_RIGHT: 0x02, NAV_UP: 0x03, NAV_DOWN: 0x04,
    SHIFT: 0x05, PLAY: 0x06, REC: 0x07, UNDO: 0x08,
    STOP_ALL: 0x09, TRACK_PREV: 0x0A, TRACK_NEXT: 0x0B, CAPTURE: 0x0C,
    MODE: 0x0D, NOTE_REPEAT: 0x0E, ARM: 0x0F,
    COPY: 0x14, DELETE: 0x15, AUTOMATION: 0x16, JOG_TOUCH: 0x17, STEP_SEQ: 0x18, MUTE: 0x19, ARRANGE: 0x1A, DUP_CLIP: 0x1B, MAIN: 0x1C, QUANTISE_ALWAYS: 0x1D,
    ROW0: 0x10,          /* + r, r = 0 top .. 3 bottom */
    STEP0: 0x20,         /* + s, s = 0 .. 15 */
    SET_MODE: 0x30, SET_QLINK_PAGE: 0x31, SET_PAD_BANK: 0x32, REFRESH: 0x33, TEMPO: 0x34,
    KNOB0: 0x47,         /* + k, k = 0 .. 7: relative delta */
    MASTER: 0x4F,        /* reserved, unused in v4 */
});
export const TOUCH_NOTE0 = 0x40;                    /* + k: knob touch notes */

export const MODES = Object.freeze({ SESSION: 0, ROWS: 1, PADS: 2, NOTES: 3 });
export const MODE_NAMES = ["Matrix", "Transposed", "Pads", "Notes"];

/* ---------------- encoders: Move -> MPC ---------------- */

function sysex(cmd, data) {
    return [0xF0, ...HEADER, cmd, ...(data || []), 0xF7];
}
export const encodeHello = (caps = 0) => sysex(CMD_HELLO, [PROTOCOL_VERSION, caps & 0x7F]);
export const encodePing = () => sysex(CMD_PING);
export const encodeBye = () => sysex(CMD_BYE);

const d7 = (v) => Math.max(0, Math.min(127, v | 0));

export const encodePadDown = (p, vel) => [0x90 | MOVE_CH, d7(p), Math.max(1, d7(vel))];
export const encodePadUp = (p) => [0x80 | MOVE_CH, d7(p), 0];
export const encodePadPressure = (p, v) => [0xA0 | MOVE_CH, d7(p), d7(v)];
export const encodeKnobDelta = (k, delta) => [0xB0 | MOVE_CH, CC.KNOB0 + (k & 7), d7(delta)];
export const encodeKnobTouch = (k, on) =>
    on ? [0x90 | MOVE_CH, TOUCH_NOTE0 + (k & 7), 0x7F] : [0x80 | MOVE_CH, TOUCH_NOTE0 + (k & 7), 0];
/* A button-like command: 7F on press, 00 on release (§2.3). */
export const encodeButton = (cc, pressed) => [0xB0 | MOVE_CH, cc & 0x7F, pressed ? 0x7F : 0x00];
export const encodeValue = (cc, value) => [0xB0 | MOVE_CH, cc & 0x7F, d7(value)];
export const encodeSetMode = (m) => encodeValue(CC.SET_MODE, m);
export const encodeSetQlinkPage = (pg) => encodeValue(CC.SET_QLINK_PAGE, pg);
export const encodeSetPadBank = (b) => encodeValue(CC.SET_PAD_BANK, b);
export const encodeRefresh = () => encodeValue(CC.REFRESH, 0x7F);

/* Notes mode: ordinary notes on the user's channel (0-based 0..14). */
export const encodeNoteOn = (ch, note, vel) => [0x90 | (ch & 0x0F), d7(note), Math.max(1, d7(vel))];
export const encodeNoteOff = (ch, note) => [0x80 | (ch & 0x0F), d7(note), 0];

/* ---------------- decoder: MPC -> Move ---------------- */

function ascii(bytes) {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b >= 0x20 && b < 0x7F ? b : 0x3F);
    return s;
}

function colours(body, at, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
        const o = at + i * 4;
        out.push({ r: body[o], g: body[o + 1], b: body[o + 2], anim: body[o + 3] & 3 });
    }
    return out;
}

/* Decode one complete wire message (F0 ... F7). Returns an object with a
 * `type`, or null for anything that is not ours, unknown, reserved (60-6F) or
 * short. Never throws on malformed input. */
export function decode(msg) {
    if (!msg || msg.length < 6) return null;
    if (msg[0] !== 0xF0 || msg[msg.length - 1] !== 0xF7) return null;
    if (msg[1] !== HEADER[0] || msg[2] !== HEADER[1] || msg[3] !== HEADER[2]) return null;
    const cmd = msg[4];
    const d = msg.slice(5, msg.length - 1);
    for (const b of d) if (b > 0x7F) return null;
    switch (cmd) {
        case CMD_WELCOME:
            if (d.length < 2) return null;
            return { type: "welcome", ver: d[0], flags: d[1], clipWorkflow: (d[1] & 1) !== 0 };
        case CMD_STATE:
            if (d.length < 15) return null;
            return {
                type: "state",
                mode: d[0], qlinkPage: d[1], padBank: d[2],
                playing: (d[3] & 1) !== 0, recording: (d[3] & 2) !== 0, overdubbing: (d[3] & 4) !== 0,
                originX: d[4], originY: d[5], globalCols: d[6], globalRows: d[7],
                canLeft: (d[8] & 1) !== 0, canRight: (d[8] & 2) !== 0,
                canUp: (d[8] & 4) !== 0, canDown: (d[8] & 8) !== 0,
                armed: !!(d[9] & 1), noteRepeat: !!(d[9] & 2), metronome: !!(d[9] & 4), popup: !!(d[9] & 8), aux: !!(d[9] & 16), muted: !!(d[9] & 32), solo: !!(d[9] & 64),
                mpcMode: d[14], automation: d[10], available: d[11], bpm: (d[12] + d[13] * 128) / 10,
            };
        case CMD_PADS:
        case CMD_STEPS: {
            if (d.length < 2) return null;
            const first = d[0], n = d[1];
            const limit = cmd === CMD_PADS ? 32 : 16;
            if (n < 1 || n > 8 || first + n > limit || d.length < 2 + 4 * n) return null;
            const list = colours(d, 2, n);
            return cmd === CMD_PADS
                ? { type: "pads", first, pads: list }
                : { type: "steps", first, steps: list };
        }
        case CMD_ROWS:
            if (d.length < 16) return null;
            return { type: "rows", rows: colours(d, 0, 4) };
        case CMD_TEXT:
            if (d.length < 1 || d[0] > 5) return null;
            return { type: "text", slot: d[0], text: ascii(d.slice(1, 41)) };
        case CMD_QLINK: {
            if (d.length < 1 || d[0] > 7) return null;
            const rest = d.slice(1);
            const z = rest.indexOf(0);
            if (z < 0) return null;
            const name = rest.slice(0, z);
            const value = rest.slice(z + 1);
            return { type: "qlink", knob: d[0], name: ascii(name.slice(0, 20)), value: ascii(value.slice(0, 16)) };
        }
        case CMD_POSITION:
            if (d.length < 10 || !d[8] || !d[9]) return null;
            return { type: "position", position: d[0] + d[1]*128 + d[2]*16384 + d[3]*2097152,
                length: d[4] + d[5]*128 + d[6]*16384 + d[7]*2097152,
                numerator: d[8], denominator: d[9] };
        case CMD_PONG:
            return { type: "pong" };
        case CMD_GOODBYE:
            return { type: "goodbye" };
        default:
            return null;   /* unknown, or reserved 0x60-0x6F */
    }
}
