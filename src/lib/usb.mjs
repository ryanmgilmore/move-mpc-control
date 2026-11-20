// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ryan Gilmore
/* USB-MIDI framing for move_midi_external_send, and the inbound SysEx
 * assembler. Pure: no host globals.
 *
 * Outbound shapes are the ones the probe tool proved on the device
 *: channel voice on cable 2 ([0x29, 0x9F, p, vel]),
 * SysEx with cable nibble 0 and CIN 4-7 (the host forces the cable). */

const CABLE_VOICE = 0x20;

/* One channel-voice message -> one 4-byte packet. */
export function voicePacket(msg) {
    const st = msg[0] & 0xFF;
    const cin = st >> 4;                     /* 8..E: the CIN equals the status nibble */
    return [CABLE_VOICE | cin, st, (msg[1] | 0) & 0x7F, (msg[2] | 0) & 0x7F];
}

/* A SysEx wire message (F0..F7) -> flat 4-byte packets, concatenated. */
export function sysexPackets(bytes) {
    const out = [];
    let i = 0;
    while (i < bytes.length) {
        const remain = bytes.length - i;
        if (remain > 3) { out.push(0x04, bytes[i], bytes[i + 1], bytes[i + 2]); i += 3; }
        else if (remain === 3) { out.push(0x07, bytes[i], bytes[i + 1], bytes[i + 2]); i += 3; }
        else if (remain === 2) { out.push(0x06, bytes[i], bytes[i + 1], 0); i += 2; }
        else { out.push(0x05, bytes[i], 0, 0); i += 1; }
    }
    return out;
}

/* Wire message -> packets, whichever kind it is. */
export function packetsFor(msg) {
    return msg[0] === 0xF0 ? sysexPackets(msg) : voicePacket(msg);
}

/* Inverse of the above, for tests and diagnostics: flat packets -> wire
 * messages. CIN 4 continues SysEx, 5/6/7 end it; 8-E are channel voice. */
export function depacketize(flat) {
    const msgs = [];
    let sx = null;
    for (let i = 0; i + 3 < flat.length; i += 4) {
        const cin = flat[i] & 0x0F;
        const b = [flat[i + 1], flat[i + 2], flat[i + 3]];
        if (cin === 0x4) { if (sx === null) sx = []; sx.push(...b); }
        else if (cin >= 0x5 && cin <= 0x7) {
            if (sx === null) sx = [];
            sx.push(...b.slice(0, cin - 0x4));
            msgs.push(sx); sx = null;
        } else if (cin === 0xC || cin === 0xD) msgs.push(b.slice(0, 2));
        else if (cin >= 0x8 && cin <= 0xE) msgs.push(b);
        else if (cin === 0xF) msgs.push(b.slice(0, 1));
    }
    return msgs;
}

/* Inbound SysEx reassembly: onMidiMessageExternal hands over
 * 1-3 byte fragments with the CIN stripped, so F7 is the only terminator and
 * any bytes after it in a fragment are padding. Start on F0 (a second F0
 * restarts), finish on F7, skip realtime bytes (>= F8), abort on any other
 * status byte, and discard a message that grows past `cap` bytes. */
export function createAssembler(cap = 64) {
    let buf = null;
    const stats = { complete: 0, aborted: 0, overflow: 0 };
    return {
        stats,
        get active() { return buf !== null; },
        reset() { buf = null; },
        /* Feed bytes; returns an array of complete wire messages (F0..F7). */
        feed(bytes) {
            const done = [];
            for (let i = 0; i < bytes.length; i++) {
                const b = bytes[i] & 0xFF;
                if (b === 0xF0) { if (buf !== null) stats.aborted++; buf = [0xF0]; continue; }
                if (buf === null) continue;
                if (b === 0xF7) {
                    buf.push(0xF7); done.push(buf); buf = null; stats.complete++;
                    continue;
                }
                if (b >= 0xF8) continue;
                if (b >= 0x80) { buf = null; stats.aborted++; continue; }
                if (buf.length >= cap - 1) { buf = null; stats.overflow++; continue; }
                buf.push(b);
            }
            return done;
        },
        /* An interrupting channel-voice message: abandon any partial message. */
        abort() { if (buf !== null) { buf = null; stats.aborted++; } },
    };
}
