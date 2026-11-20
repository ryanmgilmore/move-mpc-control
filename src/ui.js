// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ryan Gilmore
/* Move MPC Control: the Move as clip launcher, pads and Q-Link knobs for an Akai MPC.
 * The Move half of the wire protocol, version 4. A Schwung overtake tool, JS only.
 *
 * The MPC script is the model and this is the view: it sends raw control
 * events on channel 16 and draws what the MPC tells it. Notes mode is the one
 * place the module decides anything itself (its own note layout).
 *
 * Pure logic lives in lib/*.mjs. QuickJS caches those for the life of the
 * Move process, so a deployed lib change needs a Move restart; ui.js reloads
 * on every fresh tool open. That is why the tunables below live HERE.
 *
 * Every host entry point is wrapped: an exception thrown out of tick() or a
 * MIDI handler makes the host unload the module with nothing on screen. */

import * as P from "./lib/protocol.mjs";
import { NUM_QLINK_PAGES } from "./lib/qlinks.mjs";
import { packetsFor, createAssembler } from "./lib/usb.mjs";
import { createLedEngine, specFor, solid, noteKey, ccKey } from "./lib/leds.mjs";
import * as N from "./lib/notes.mjs";
import * as L from "./lib/layout.mjs";
import { drawScreen, drawMenu, drawSetting } from "./lib/screen.mjs";

/* ================= tunables (ui.js, so they change without a restart) ================= */

const CFG = {
    PING_MS: 1000,              /* §2.4: heartbeat while in the foreground */
    HELLO_TIMEOUT_MS: 3000,     /* §6: "No MPC" after this long without an answer */
    LINK_TIMEOUT_MS: 3500,      /* §6.1: silence from the MPC means lost link */
    HELLO_RETRY_MS: 2000,       /* §6: then retry HELLO this often */
    CLOCK_STYLE: "quarter",
    JOG_TOUCH_LIST: false,      /* previous / current / next track names on jog touch */
    PAGE_LIST_MS: 1500,
    TRANSIENT_MS: 1200,         /* TEXT slot 2 and the module's own feedback */
    REDRAW_MS: 34,              /* animation / dirty redraw cap: below 30 Hz */
    SCREEN: {
        REST_PLAY: 'name', QLINK_LIST_ORDER: 'columns', REST_CLIP: 'name', MENU_STYLE: 'list',
        NAME_FONTS: ['tamzen-20', 'tamzen-16', 'tamzen-14', 'tamzen-12'],
        LABEL_FONTS: ['tamzen-12', 'default'],
        HINT_FONT: 'tamzen-9',
    },
    LED_BUDGET: 8,              /* LED writes per tick (host flushes 16; Move firmware competes) */
    SYSEX_CAP: 64,              /* §5: inbound reassembly cap */
    JOG_MAX_PER_TICK: 4,        /* track steps sent for one batched jog delta */

    /* "hw": the platform's LED animation channels (Push 2 convention, see
     * lib/leds.mjs). "soft": toggle colours from tick() instead, if the bench
     * finds the channels do not animate. */
    ANIM_MODE: "hw",
    PULSE_CH: 0x09,             /* constants.mjs Pulse4th; what Move uses for a playing clip */
    BLINK_CH: 0x0D,             /* constants.mjs Blink8th; Move's queued clip is 0x0E (Blink4th) */
    SOFT_PULSE_MS: 1000,
    SOFT_BLINK_MS: 250,

    /* Palette indices (Schwung constants.mjs). */
    NOTE_ROOT: 16,              /* Azure Blue */
    NOTE_SCALE: 118,            /* Light Grey */
    NOTE_OUT: 0,
    NOTE_PRESSED: 126,          /* Green */
    MODE_COL: [9, 16, 3, 23],   /* Session lime, Rows azure, Pads orange, Notes violet */
    MODE_DIM: [81, 95, 69, 109],
    PLAY_ON: 126, PLAY_OFF: 124,
    REC_ON: 127, OVERDUB_ON: 3, REC_OFF: 124,
    SCENE_LABEL_OFFSET: 0,      /* scene label = originY + this; row 0 is the arrangement row */
    WHITE_OFF: 0x00, WHITE_DIM: 0x10, WHITE_MED: 0x40, WHITE_BRIGHT: 0x7C,
};

/* Move controls (Schwung API.md / constants.mjs). */
const M = {
    JOG_CLICK: 3, JOG: 14, SHIFT: 49, MENU: 50, BACK: 51, CAPTURE: 52,
    DOWN: 54, UP: 55, UNDO: 56, LOOP: 58, COPY: 60, LEFT: 62, RIGHT: 63,
    MUTE: 88, SAMPLE: 118, DELETE: 119,
    KNOB0: 71, MASTER: 79, PLAY: 85, REC: 86,
    ROW_BOTTOM: 40, ROW_TOP: 43,
};

/* Shift + step button shortcuts (step index 0-15; the button label is +1). */
/* Shift + Step, zero-based. Each sits on the printed glyph that says what it
 * does (Ryan): 16 Levels on the star (13), Step Seq on the layout glyph (8). */
const SH = { MAIN: 0, SETUP: 1, ARRANGE: 2, DUP: 13, TEMPO: 4, METRO: 5, STEPSEQ: 7, KEYS: 8, FULL: 9, SIXTEEN: 12, QUANTISE: 15 };
const GLYPH_CC0 = 16;   /* the icon LEDs under the steps: CC 16-31, white */

/* ================= state ================= */

let S = null;      /* everything, rebuilt by init() */
let leds = null;
let asm = null;

const LED_KEYS = (() => {
    const k = [];
    for (let p = 0; p < 32; p++) k.push(noteKey(L.padNoteOf(p)));
    for (let i = 0; i < 16; i++) k.push(noteKey(L.STEP_NOTE0 + i));
    for (let r = 0; r < 4; r++) k.push(ccKey(L.rowButtonCC(r)));
    for (const cc of [M.PLAY, M.REC, M.LEFT, M.RIGHT, M.UP, M.DOWN, M.SHIFT, M.UNDO, M.BACK, M.MENU, M.LOOP, M.SAMPLE, M.MUTE, M.COPY, M.DELETE, M.CAPTURE, ...Array.from({length:8}, (_,i) => M.KNOB0+i), ...Array.from({length:16}, (_,i) => GLYPH_CC0+i)]) k.push(ccKey(cc));
    return k;
})();

function freshState() {
    return {
        parked: false, byeSent: false,
        conn: "connecting",          /* connecting | connected | nompc | version */
        connNote: "",
        helloAt: 0, lastHelloAt: 0, lastPingAt: 0, lastMpcAt: 0,
        welcomeFlags: 0,
        gotState: false,
        mode: P.MODES.SESSION, qlinkPage: 0, padBank: 0, mpcMode: 4,
        playing: false, recording: false, overdubbing: false,
        originX: 0, originY: 0, globalCols: 0, globalRows: 0,
        canLeft: true, canRight: true, canUp: true, canDown: true,
        pads: new Array(32).fill(null), rows: new Array(4).fill(null), steps: new Array(16).fill(null),
        text: ["", "", "", "", "", ""], text2Until: 0, lane: "",
        flash: "", flashUntil: 0,
        qlink: new Array(8).fill(null),
        touched: new Array(8).fill(false), touchOrder: [],
        shift: false, jogTouched: false, volumeTouched: false,
        armed: false, noteRepeat: false, repeatDown: false, metronome: false, automation: 0, available: 0, bpm: 120,
        clipLayout: 0, clockStyle: CFG.CLOCK_STYLE, jogDial: "bars", qlinkList: false, quantAlways: false, popup: false, aux: false, pageListUntil: 0, position: null, menu: null, menuSelected: 0,
        moveChanges: null, moveInfoAt: 0, preferencesLoaded: false,
        held: new Map(),             /* pad -> {pad:true} | {ch, note} */
        noteHolders: new Map(),      /* channel:note -> number of held pads */
        pressure: new Map(),         /* pad -> last pressure sent */
        consumed: new Map(),         /* control key -> release message or null */
        notes: N.defaultNotes(),
        tickNo: 0, dirty: true, lastDrawAt: -1e9,
        stats: { tx: 0, refused: 0, errors: 0, rx: 0, ledWrites: 0 },
    };
}

const now = () => Date.now();

/* ================= output ================= */

function sendMsg(msg) {
    try {
        const ok = move_midi_external_send(packetsFor(msg));
        if (ok === false) S.stats.refused++; else S.stats.tx++;
    } catch (_e) { S.stats.errors++; }
}

function sendLed(pkt) {
    S.stats.ledWrites++;
    return move_midi_internal_send(pkt);
}

function flash(text, t) {
    S.flash = text; S.flashUntil = t + CFG.TRANSIENT_MS; S.dirty = true;
}

/* ================= session lifecycle ================= */

function sendHello(t) {
    sendMsg(P.encodeHello());
    S.lastHelloAt = t;
}

/* Module opened or resumed: announce, and repaint everything. */
function startSession(t) {
    S.parked = false;
    S.byeSent = false;
    S.conn = "connecting"; S.connNote = "";
    S.helloAt = t; S.lastPingAt = t;
    S.shift = false; S.jogTouched = false;
    S.touched.fill(false); S.touchOrder = [];
    S.held.clear(); S.noteHolders.clear(); S.pressure.clear(); S.consumed.clear();
    asm.reset();
    sendHello(t);
    leds.invalidate();
    /* The host repaints the surface as it hands it back, after our first
     * writes: pads stayed dark on resume until touched (bench, 2026-11-13).
     * Paint again once it has settled. */
    S.repaintAt = [t + 400, t + 1200];
    S.dirty = true;
}

/* Module parked or exiting: release what we hold, then BYE. Once. */
function endSession() {
    if (S.byeSent) return;
    releaseAllHeld();
    releaseRepeat();
    sendMsg(P.encodeBye());
    S.byeSent = true;
}

function clearMpcView() {
    S.pads.fill(null); S.rows.fill(null); S.steps.fill(null);
    S.qlink.fill(null);
    S.mpcMode = 4; S.position = null; S.armed = S.noteRepeat = false; S.automation = 0;
    S.gotState = false;
    S.dirty = true;
}

/* ================= MPC -> Move ================= */

function handleMsg(m, t) {
    if (!m) return;
    if (S.conn === "version") return;
    S.stats.rx++;
    S.lastMpcAt = t;
    if (m.type === "goodbye") {
        releaseAllHeld(); releaseRepeat();
        S.conn = "nompc"; S.connNote = "MPC script left";
        sendHello(t);
        clearMpcView();
        return;
    }
    if (m.type === "welcome") {
        if (m.ver !== P.PROTOCOL_VERSION) {
            S.conn = "version";
            S.connNote = m.ver > P.PROTOCOL_VERSION ? "MPC script too new" : "MPC script too old";
            releaseRepeat();
            clearMpcView();
            return;
        }
        S.conn = "connected"; S.connNote = "";
        S.lastPingAt = t;
        S.welcomeFlags = m.flags;
        if (!S.preferencesLoaded) {
            loadPreferences(); S.preferencesLoaded = true;
            if (S.clipLayout === 1) sendMsg(P.encodeSetMode(1));
        }
        if (S.shift) sendMsg(P.encodeButton(P.CC.SHIFT, true));
        for (const k of S.touchOrder) sendMsg(P.encodeKnobTouch(k, true));
        S.dirty = true;
        return;
    }
    if (S.conn !== "connected") { S.conn = "connected"; S.connNote = ""; S.dirty = true; }
    switch (m.type) {
        case "state":
            if (m.mode >= 0 && m.mode <= 3) setMode(m.mode);
            if (m.qlinkPage >= 0 && m.qlinkPage < NUM_QLINK_PAGES) {
                if (m.qlinkPage !== S.qlinkPage) { S.qlink.fill(null); if (pageListWanted()) S.pageListUntil = t + CFG.PAGE_LIST_MS; }
                S.qlinkPage = m.qlinkPage;
            }
            if (Math.min(6, m.padBank) !== S.padBank) releaseAllHeld();
            S.padBank = Math.min(6, m.padBank);
            S.armed = m.armed; S.noteRepeat = m.noteRepeat; S.metronome = m.metronome;
            S.popup = !!m.popup; S.aux = !!m.aux; S.muted = !!m.muted; S.solo = !!m.solo;
            /* A mode change on the MPC rewrites many LEDs at once, and step LEDs
             * stayed dark until the tool was reloaded (bench, 2026-11-14): resend
             * them all, now and once the new colours have arrived. */
            if (m.mpcMode !== S.mpcMode) S.repaintAt = [t + 40, t + 250, t + 700];
            S.mpcMode = m.mpcMode; S.automation = m.automation; S.available = m.available; S.bpm = m.bpm;
            if (m.mode < 2 && m.mode !== S.clipLayout) { S.clipLayout = m.mode; savePreferences(); }
            S.playing = m.playing; S.recording = m.recording; S.overdubbing = m.overdubbing;
            S.originX = m.originX; S.originY = m.originY;
            S.globalCols = m.globalCols; S.globalRows = m.globalRows;
            S.canLeft = m.canLeft; S.canRight = m.canRight; S.canUp = m.canUp; S.canDown = m.canDown;
            S.gotState = true;
            break;
        case "position": S.position = { ...m, at: t }; break;
        case "pads":
            for (let i = 0; i < m.pads.length; i++) S.pads[m.first + i] = m.pads[i];
            break;
        case "steps":
            for (let i = 0; i < m.steps.length; i++) S.steps[m.first + i] = m.steps[i];
            break;
        case "rows":
            for (let i = 0; i < 4; i++) S.rows[i] = m.rows[i];
            break;
        case "text":
            /* The lane the Move last picked, for the Step Seq screen; a new track's lane is unknown. */
            if (m.slot === 0 && m.text !== S.text[0]) S.lane = "";
            /* "@Lane A01": the MPC's own lane, read on entering Step Seq; stored, never flashed. */
            if (m.slot === 2 && /^@Lane [A-H]\d\d$/.test(m.text)) { S.lane = m.text.slice(6); S.dirty = true; break; }
            /* A pick from the Move: stored too, and not flashed either; the bottom line says it (Ryan, 2026-11-14). */
            if (m.slot === 2 && /^Lane [A-H]\d\d$/.test(m.text)) { S.lane = m.text.slice(5); S.dirty = true; break; }
            if (m.slot === 2 && m.text === "No lane") S.lane = "";
            S.text[m.slot] = m.text;
            if (m.slot === 2 && m.text.startsWith("Q-Links ")) { if (pageListWanted()) S.pageListUntil = t + CFG.PAGE_LIST_MS; break; }
            /* A bare mode name is never shown: the pads say which mode it is (Ryan). */
            if (m.slot === 2 && P.MODE_NAMES.includes(m.text)) break;
            if (m.slot === 2) S.text2Until = t + CFG.TRANSIENT_MS;
            break;
        case "qlink": {
            const old = S.qlink[m.knob];
            S.qlink[m.knob] = { name: m.name, value: m.value };
            const visible = S.touchOrder[S.touchOrder.length - 1] === m.knob;
            if (!old || old.name !== m.name || (visible && old.value !== m.value)) S.dirty = true;
            return;
        }
    }
    S.dirty = true;
}

/* ================= Move controls -> MPC ================= */

function setMode(m) {
    if (m === S.mode) return;
    releaseAllHeld();
    S.mode = m;
    S.dirty = true;
}

function releaseAllHeld() {
    for (const p of S.held.keys()) padUp(p);
    S.pressure.clear();
}

function padDown(p, vel) {
    if (S.held.has(p)) padUp(p);
    if (playDark()) return;   /* audio, submix, return, output: nothing to play (Ryan); clips still launch */
    if (S.mode === P.MODES.NOTES) {
        const note = N.padNote(S.notes, p);
        if (note < 0) return;
        const ch = S.notes.channel - 1;
        const key = ch + ":" + note;
        const count = S.noteHolders.get(key) || 0;
        if (count === 0) sendMsg(P.encodeNoteOn(ch, note, vel));
        S.noteHolders.set(key, count + 1);
        S.held.set(p, { ch, note });
    } else {
        sendMsg(P.encodePadDown(p, vel));
        S.held.set(p, { pad: true });
    }
}

/* A track with nothing to play darkens the PLAY side only: the clip side shows
 * the clip matrix whatever track is current (Ryan, 2026-11-19: an audio track
 * left the clip pads dark, a holdover from the play-side rule). */
function playDark() { return S.aux && S.mode >= P.MODES.PADS; }

function padUp(p) {
    const h = S.held.get(p);
    S.held.delete(p);
    S.pressure.delete(p);
    if (!h) {
        /* Pressed before a resume or a mode change we already released. */
        return;
    }
    if (h.pad) sendMsg(P.encodePadUp(p));
    else {
        const key = h.ch + ":" + h.note;
        const count = S.noteHolders.get(key) - 1;
        if (count > 0) S.noteHolders.set(key, count);
        else {
            S.noteHolders.delete(key);
            sendMsg(P.encodeNoteOff(h.ch, h.note));
        }
    }
}

function padPressure(p, v) {
    if (S.mode !== P.MODES.PADS) return;
    const h = S.held.get(p);
    if (!h || !h.pad) return;
    if (S.pressure.get(p) === v) return;
    S.pressure.set(p, v);
    sendMsg(P.encodePadPressure(p, v));
}

function knobTouch(k, on) {
    if (S.touched[k] === on) return;
    S.touched[k] = on;
    S.touchOrder = S.touchOrder.filter((x) => x !== k);
    if (on) S.touchOrder.push(k);
    sendMsg(P.encodeKnobTouch(k, on));
    S.dirty = true;
}

/* Press a button-like command now and remember its release. */
function pressCommand(key, cc) {
    sendMsg(P.encodeButton(cc, true));
    S.consumed.set(key, P.encodeButton(cc, false));
}

function release(key) {
    if (!S.consumed.has(key)) return false;
    const msg = S.consumed.get(key);
    S.consumed.delete(key);
    if (msg) sendMsg(msg);
    return true;
}

function stepDown(i, t) {
    const key = "step" + i;
    if (S.shift) {
        // Local menus own only their native shortcuts. All other shifted
        // steps are deliberately silent; MPC receives the supported actions.
        S.consumed.set(key, null);
        if (i === SH.SETUP) { openMenu("setup"); return; }
        if (i === SH.TEMPO) { openMenu("tempo"); return; }
        if (i === SH.KEYS) { openMenu("keys"); return; }
        if (i === SH.MAIN) { sendMsg(P.encodeButton(P.CC.MAIN, true)); sendMsg(P.encodeButton(P.CC.MAIN, false)); return; }
        if (i === SH.DUP) { sendMsg(P.encodeButton(P.CC.DUP_CLIP, true)); sendMsg(P.encodeButton(P.CC.DUP_CLIP, false)); return; }
        if (i === SH.ARRANGE) { sendMsg(P.encodeButton(P.CC.ARRANGE, true)); sendMsg(P.encodeButton(P.CC.ARRANGE, false)); return; }
        if (i === SH.STEPSEQ) { sendMsg(P.encodeButton(P.CC.STEP_SEQ, true)); sendMsg(P.encodeButton(P.CC.STEP_SEQ, false)); return; }
        const bit = { [SH.METRO]: 1, [SH.SIXTEEN]: 2, [SH.FULL]: 4, [SH.QUANTISE]: 8 }[i];
        /* Setup "Quantise: Always": the MPC turns Timing Correct on for the press if it is off (Ryan). */
        if (i === SH.QUANTISE && S.quantAlways && (S.available & 8)) { sendMsg(P.encodeButton(P.CC.QUANTISE_ALWAYS, true)); sendMsg(P.encodeButton(P.CC.QUANTISE_ALWAYS, false)); return; }
        if (bit && (S.available & bit)) pressCommand(key, P.CC.STEP0 + i);
        return;
    }
    pressCommand(key, P.CC.STEP0 + i);
}

function stepUp(i) {
    release("step" + i);
}

function notesArrow(cc, t) {
    const n = S.notes;
    if (cc === M.UP || cc === M.DOWN) {
        const d = cc === M.UP ? 1 : -1;
        if (S.shift) {
            n.channel = Math.max(1, Math.min(15, n.channel + d));
            flash("Note channel " + n.channel, t);
        } else {
            n.octave = N.clampOctave(n.octave + d);
            flash("Low note " + N.noteName(N.baseNote(n)), t);
        }
    } else {
        const d = cc === M.RIGHT ? 1 : -1;
        if (S.shift) {
            n.scale = (n.scale + d + N.SCALES.length) % N.SCALES.length;
        } else {
            n.root = (n.root + d + 12) % 12;
        }
        flash(N.describe(n), t);
    }
}

const NAV_OF = { [M.LEFT]: P.CC.NAV_LEFT, [M.RIGHT]: P.CC.NAV_RIGHT, [M.UP]: P.CC.NAV_UP, [M.DOWN]: P.CC.NAV_DOWN };

function arrow(cc, pressed, t) {
    const key = "cc" + cc;
    if (!pressed) { release(key); return; }
    if (S.mpcMode === 1 && !({[M.LEFT]:S.canLeft,[M.RIGHT]:S.canRight,[M.UP]:S.canUp,[M.DOWN]:S.canDown})[cc]) { S.consumed.set(key, null); return; }
    if (S.mpcMode !== 1 && S.mode === P.MODES.NOTES) { notesArrow(cc, t); S.consumed.set(key, null); return; }
    if (S.mpcMode !== 1 && S.mode === P.MODES.PADS && ((cc === M.LEFT && S.padBank > 0)
        || (cc === M.RIGHT && S.padBank < 6))) releaseAllHeld();
    pressCommand(key, NAV_OF[cc]);
}

function setQlinkPage(pg, t) {
    sendMsg(P.encodeSetQlinkPage(pg));
    if (pg !== S.qlinkPage) S.qlink.fill(null);
    S.text2Until = 0;
    S.qlinkPage = pg;
    /* The eight-name list is a setting, off by default, and never shows in
     * Step Seq: the page marks say which page it is (Ryan, 2026-11-14). */
    S.pageListUntil = pageListWanted() ? t + CFG.PAGE_LIST_MS : 0; S.flashUntil = 0; S.dirty = true;
}
function pageListWanted() { return S.qlinkList && S.mpcMode !== 1; }

function jog(v, t) {
    const d = v >= 1 && v <= 63 ? v : (v >= 65 && v <= 127 ? v - 128 : 0);
    if (d === 0) return;
    if (S.menu === "tempo") { sendMsg(P.encodeValue(P.CC.TEMPO, v)); S.dirty = true; return; }
    if (S.menu) { S.menuSelected = Math.max(0, Math.min(menuItems().length - 1, S.menuSelected + (d > 0 ? 1 : -1))); S.dirty = true; return; }
    /* Step Seq (Ryan): the jog moves between bars, or between knob pages 1
     * and 2, by the "Jog Dial" setting; Shift + jog changes the setting. */
    if (S.mpcMode === 1) {
        if (S.shift) { S.jogDial = S.jogDial === "bars" ? "qlinks" : "bars"; savePreferences(); S.dirty = true; return; }
        if (S.jogDial === "qlinks") {
            const pg = d > 0 ? 1 : 0;
            if (pg !== S.qlinkPage) setQlinkPage(pg, t);
            return;
        }
        const nav = d > 0 ? P.CC.NAV_RIGHT : P.CC.NAV_LEFT;
        const steps = Math.min(Math.abs(d), CFG.JOG_MAX_PER_TICK);
        for (let i = 0; i < steps; i++) { sendMsg(P.encodeButton(nav, true)); sendMsg(P.encodeButton(nav, false)); }
        return;
    }
    /* One page per detent, clamped at both ends (including batched deltas). */
    if (S.shift) {
        const pg = Math.max(0, Math.min(NUM_QLINK_PAGES - 1, S.qlinkPage + d));
        if (pg !== S.qlinkPage) setQlinkPage(pg, t);
        return;
    }
    const cc = d > 0 ? P.CC.TRACK_NEXT : P.CC.TRACK_PREV;
    const n = Math.min(Math.abs(d), CFG.JOG_MAX_PER_TICK);
    for (let i = 0; i < n; i++) { sendMsg(P.encodeButton(cc, true)); sendMsg(P.encodeButton(cc, false)); }
}

/* Back is ours (capabilities.suspend_self_managed, as dAVEBOx uses it): the
 * host forwards plain Back and keeps Shift+Back as its full exit. So Back
 * first closes whatever is open, as on Move, and only parks the tool when
 * nothing is. On a host without the capability Back never reaches us and the
 * host parks: menus then close with Mode or Play only. */
function backPressed() {
    if (S.menu) { S.menu = null; S.dirty = true; return; }
    /* Out of Main (Step Seq, the mute modes, 16 Levels, Arrange), Back takes
     * the MPC back to Main (Ryan). A second Back inside 1.5 s parks anyway,
     * so the tool can always be left. */
    const now = Date.now();
    if (!S.shift && S.conn === "connected" && S.gotState && (S.mpcMode !== 0 || S.popup) && !(S.backAt && now - S.backAt < 1500)) {
        S.backAt = now;
        sendMsg(P.encodeButton(P.CC.MAIN, true)); sendMsg(P.encodeButton(P.CC.MAIN, false));
        return;
    }
    endSession();
    try {
        if (!S.shift && typeof host_suspend_overtake === "function") {
            S.parked = true;
            host_suspend_overtake();
        } else if (typeof host_exit_module === "function") {
            host_exit_module();
        }
    } catch (_e) { S.stats.errors++; }
}

function handleInternal(data, t) {
    const st = data[0] & 0xF0, d1 = data[1] | 0, d2 = data[2] | 0;
    if (st === 0x90 || st === 0x80) {
        const on = st === 0x90 && d2 > 0;
        if (d1 <= 7) { knobTouch(d1, st === 0x90 && d2 >= 64); return; }
        /* Jog touch shows nothing: the track list was rejected at the bench (Ryan,
         * 2026-11-13). CFG.JOG_TOUCH_LIST brings it back. */
        if (d1 === 9) { if (CFG.JOG_TOUCH_LIST) { S.jogTouched = on; sendMsg(P.encodeButton(P.CC.JOG_TOUCH, on)); S.dirty = true; } return; }
        if (d1 === 8) {
            /* Master touch is the host's modifier with Shift (its escape needs a jog
             * click as well). Shift + touch, released with no click, is ours:
             * automation Read / Write (Ryan). The host puts the glyph LEDs out on
             * release, so everything is redrawn after it. */
            if (on) S.volClicked = false;
            else if (S.volumeTouched && S.shift && !S.volClicked && !S.menu) {
                sendMsg(P.encodeButton(P.CC.AUTOMATION, true)); sendMsg(P.encodeButton(P.CC.AUTOMATION, false));
            }
            if (!on) S.repaintAt = [t + 60, t + 400];
            S.volumeTouched = on; return;
        }
        if (L.isPadNote(d1)) { if (on) padDown(L.padIndex(d1), d2); else padUp(L.padIndex(d1)); S.dirty = true; return; }
        if (d1 >= L.STEP_NOTE0 && d1 < L.STEP_NOTE0 + 16) {
            if (on) stepDown(d1 - L.STEP_NOTE0, t); else stepUp(d1 - L.STEP_NOTE0);
            return;
        }
        return;
    }
    if (st === 0xA0) {
        if (L.isPadNote(d1)) padPressure(L.padIndex(d1), d2);
        return;
    }
    if (st !== 0xB0) return;
    const pressed = d2 > 0;
    /* The host takes the click only while Shift + volume touch are held (its
     * escape; schwung docs/API.md, "Jog click (CC 3)"); any other click is
     * ours. In a menu it runs the selected item, like Right. */
    if (d1 === M.JOG_CLICK) {
        if (pressed && S.volumeTouched) S.volClicked = true;
        if (S.menu && pressed && !(S.shift && S.volumeTouched)) { changeMenu(1, t); S.dirty = true; }
        return;
    }
    if (S.menu && pressed && [M.LEFT, M.RIGHT, M.UP, M.DOWN].includes(d1)) {
        if (d1 === M.UP || d1 === M.DOWN) S.menuSelected = Math.max(0, Math.min(menuItems().length-1, S.menuSelected + (d1 === M.DOWN ? 1 : -1)));
        else changeMenu(d1 === M.RIGHT ? 1 : -1, t);
        S.dirty = true; return;
    }
    if (S.menu && !pressed && [M.LEFT, M.RIGHT, M.UP, M.DOWN].includes(d1)) return;
    if (S.menu && (d1 === M.MENU || d1 === M.PLAY)) {
        if (pressed) { S.menu = null; S.dirty = true; }
        return;
    }
    if (d1 >= M.KNOB0 && d1 < M.KNOB0 + 8) {
        if (d2 !== 0 && d2 !== 64) sendMsg(P.encodeKnobDelta(d1 - M.KNOB0, d2));
        return;
    }
    if (d1 >= M.ROW_BOTTOM && d1 <= M.ROW_TOP) {
        sendMsg(P.encodeButton(P.CC.ROW0 + L.rowButtonIndex(d1), pressed));
        return;
    }
    switch (d1) {
        case M.SHIFT:
            if (S.shift !== pressed) { S.shift = pressed; S.dirty = true; }
            sendMsg(P.encodeButton(P.CC.SHIFT, pressed));
            return;
        case M.LEFT: case M.RIGHT: case M.UP: case M.DOWN:
            arrow(d1, pressed, t); return;
        case M.PLAY: sendMsg(P.encodeButton(P.CC.PLAY, pressed)); return;
        case M.REC: sendMsg(P.encodeButton(P.CC.REC, pressed)); return;
        case M.UNDO: sendMsg(P.encodeButton(P.CC.UNDO, pressed)); return;
        case M.MENU: releaseAllHeld(); sendMsg(P.encodeButton(P.CC.MODE, pressed)); return;
        case M.LOOP: S.repeatDown = pressed; sendMsg(P.encodeButton(P.CC.NOTE_REPEAT, pressed)); return;
        case M.SAMPLE: sendMsg(P.encodeButton(P.CC.ARM, pressed)); return;
        case M.MUTE: sendMsg(P.encodeButton(P.CC.MUTE, pressed)); return;
        case M.COPY: if (S.mode < 2) sendMsg(P.encodeButton(P.CC.COPY, pressed)); return;
        case M.DELETE: if (S.mode < 2 && !S.shift) sendMsg(P.encodeButton(P.CC.DELETE, pressed)); return;
        case M.CAPTURE: sendMsg(P.encodeButton(P.CC.CAPTURE, pressed)); return;
        case M.JOG: jog(d2, t); return;
        case M.BACK: if (pressed) backPressed(); return;
        default: return;   /* jog click (host escape), master knob, the rest: not ours */
    }
}

/* ================= LEDs ================= */

function shiftStepSpec(i) {
    if ([SH.MAIN, SH.SETUP, SH.ARRANGE, SH.DUP, SH.TEMPO, SH.KEYS].includes(i)) return solid(118);
    if (i === SH.STEPSEQ) return solid(S.mpcMode === 1 ? 126 : 118);
    const bit = { [SH.METRO]: 1, [SH.SIXTEEN]: 2, [SH.FULL]: 4, [SH.QUANTISE]: 8 }[i];
    return solid(bit && (S.available & bit) ? (i === SH.METRO && S.metronome ? 126 : 118) : 0);
}

function positionPulses(t) {
    const p = S.position;
    if (!p || !(p.length > 0)) return 0;
    return (p.position + (S.playing ? Math.max(0,t-p.at) * S.bpm * 960 / 60000 : 0)) % p.length;
}
function clockStepSpec(i,t) {
    if (!S.playing || !S.position) return solid(0);
    const sixteenth = Math.floor(positionPulses(t) / 240) % 16;
    return solid(S.clockStyle === "sixteenth" ? (i === sixteenth ? 118 : 0)
        : (Math.floor(i/4) === Math.floor(sixteenth/4) ? 118 : 0));
}

function notesPadSpec(p, pressedNotes) {
    const note = N.padNote(S.notes, p);
    if (note < 0) return solid(0);
    if (pressedNotes.has(note)) return solid(CFG.NOTE_PRESSED);
    const role = N.padRole(S.notes, p);
    return solid(role === "root" ? CFG.NOTE_ROOT : role === "scale" ? CFG.NOTE_SCALE : CFG.NOTE_OUT);
}

function updateLeds(t) {
    const opts = {
        anim: CFG.ANIM_MODE, pulseCh: CFG.PULSE_CH, blinkCh: CFG.BLINK_CH,
        pulseOn: (t % CFG.SOFT_PULSE_MS) < CFG.SOFT_PULSE_MS / 2,
        blinkOn: (t % CFG.SOFT_BLINK_MS) < CFG.SOFT_BLINK_MS / 2,
    };
    const notes = S.mode === P.MODES.NOTES;
    const pressedNotes = new Set();
    if (notes) for (const h of S.held.values()) if (!h.pad) pressedNotes.add(h.note);
    for (let p = 0; p < 32; p++) {
        let e = S.pads[p];
        /* Pads mode, as on the MPC: a pad rests dim and is bright while held. */
        /* Not in the mute modes: there the MPC's own brightness carries meaning (it dims unmuted pads while any pad is muted) and a muted pad arrives as a steady dim orange. */
        if (e && S.mode === P.MODES.PADS && S.mpcMode !== 2 && S.mpcMode !== 3) e = { r: e.r, g: e.g, b: e.b, anim: S.held.has(p) ? 0 : 1 };
        /* 16 Levels: the MPC's pressed colour is lost on the brighter levels, so a pad held on the Move is white (Ryan, 2026-11-14). */
        const held16 = S.popup && S.mode === P.MODES.PADS && S.held.has(p);
        leds.set(noteKey(L.padNoteOf(p)), playDark() ? solid(0) : held16 ? solid(120) /* palette white */ : notes ? notesPadSpec(p, pressedNotes) : specFor(e, opts));
    }
    for (let i = 0; i < 16; i++) {
        const o = S.shift ? shiftStepSpec(i) : S.mode >= 2 && S.mpcMode !== 1 ? clockStepSpec(i,t) : specFor(S.steps[i], opts);
        leds.set(noteKey(L.STEP_NOTE0 + i), o);
    }
    for (let r = 0; r < 4; r++) leds.set(ccKey(L.rowButtonCC(r)), specFor(S.rows[r], opts));
    /* The glyphs replace the Shift legend screen: lit while Shift is held,
     * for the steps that do something. */
    for (let i = 0; i < 16; i++) leds.set(ccKey(GLYPH_CC0 + i), solid(S.shift && shiftStepSpec(i).s ? CFG.WHITE_BRIGHT : CFG.WHITE_OFF));

    const live = S.conn === "connected";
    leds.set(ccKey(M.PLAY), solid(!live ? 0 : S.playing ? CFG.PLAY_ON : CFG.PLAY_OFF));
    leds.set(ccKey(M.REC), solid(!live ? 0 : S.recording ? CFG.REC_ON : S.overdubbing ? CFG.OVERDUB_ON : CFG.REC_OFF));

    /* Every usable button is lit (Ryan): Loop is Note Repeat on the play
     * side; Delete and Copy work on the clip side and are dim elsewhere. */
    const clipSide = S.mode < 2;
    leds.set(ccKey(M.LOOP), solid(!live ? 0 : S.noteRepeat ? CFG.WHITE_BRIGHT : clipSide ? CFG.WHITE_DIM : CFG.WHITE_MED));
    leds.set(ccKey(M.COPY), solid(!live ? 0 : clipSide ? CFG.WHITE_MED : CFG.WHITE_DIM));
    leds.set(ccKey(M.DELETE), solid(!live ? 0 : clipSide ? CFG.WHITE_MED : CFG.WHITE_DIM));
    leds.set(ccKey(M.CAPTURE), solid(live ? CFG.WHITE_MED : 0));
    leds.set(ccKey(M.SAMPLE), solid(live && S.armed ? 127 : 0));
    /* Mute follows the MPC: Track Mute lit, Pad Mute bright. */
    leds.set(ccKey(M.MUTE), solid(!live ? 0 : S.mpcMode === 3 ? CFG.WHITE_BRIGHT : S.mpcMode === 2 ? CFG.WHITE_MED : CFG.WHITE_DIM));
    leds.set(ccKey(M.MENU), solid(live ? CFG.WHITE_MED : 0));
    for (let k=0;k<8;k++) leds.set(ccKey(M.KNOB0+k), solid(live && S.qlink[k]?.name.trim() ? (S.automation === 2 ? 127 : 120) : 0));
    let l, r, u, d;
    if (S.mpcMode === 1) {
        l = S.canLeft; r = S.canRight; u = S.canUp; d = S.canDown;
    } else if (notes) {
        l = r = true;
        u = S.notes.octave < N.OCTAVE_MAX; d = S.notes.octave > N.OCTAVE_MIN;
    } else if (S.mode === P.MODES.PADS) {
        l = S.padBank > 0; r = S.padBank < 6; u = d = false;
    } else {
        l = S.canLeft; r = S.canRight; u = S.canUp; d = S.canDown;
    }
    const w = (on) => solid(on ? CFG.WHITE_MED : CFG.WHITE_OFF);
    leds.set(ccKey(M.LEFT), w(l)); leds.set(ccKey(M.RIGHT), w(r));
    leds.set(ccKey(M.UP), w(u)); leds.set(ccKey(M.DOWN), w(d));
    leds.set(ccKey(M.SHIFT), solid(S.shift ? CFG.WHITE_BRIGHT : CFG.WHITE_DIM));
    leds.set(ccKey(M.UNDO), solid(live ? CFG.WHITE_MED : CFG.WHITE_DIM));
    leds.set(ccKey(M.BACK), solid(CFG.WHITE_DIM));
}

// Tool-local persistence. No stock/global Move settings are changed.
const PREFS_PATH = "/data/UserData/schwung/modules/tools/move-mpc-control/config.json";
/* An earlier name's folder (movepads): read once if this tool has no settings of its own yet. */
const OLD_PREFS_PATH = "/data/UserData/schwung/modules/tools/movepads/config.json";
function loadPreferences() {
    try {
        if (typeof host_read_file !== "function") return;
        let raw = null;
        try { raw = host_read_file(PREFS_PATH); } catch (_e) { raw = null; }
        if (!raw) { try { raw = host_read_file(OLD_PREFS_PATH); } catch (_e) { raw = null; } }
        const p = JSON.parse(raw || "{}");
        S.clipLayout = p.clipLayout === 1 ? 1 : 0;
        if (["quarter","sixteenth"].includes(p.clockStyle)) S.clockStyle=p.clockStyle;
        if (["bars","qlinks"].includes(p.jogDial)) S.jogDial=p.jogDial;
        S.qlinkList = p.qlinkList === true;
        S.quantAlways = p.quantAlways === true;
    } catch (_e) { /* missing/invalid config keeps session defaults */ }
}
function savePreferences() {
    try { if (typeof host_write_file === "function") host_write_file(PREFS_PATH, JSON.stringify({clipLayout:S.clipLayout,clockStyle:S.clockStyle,jogDial:S.jogDial,qlinkList:S.qlinkList,quantAlways:S.quantAlways})); }
    catch (_e) { /* no write support: remembered for this session */ }
}
function followMoveInfo(t) {
    if (t < S.moveInfoAt) return;
    S.moveInfoAt=t+250;
    try {
        if (typeof host_get_move_info !== "function") return;
        const m=host_get_move_info();
        if (!m?.valid || m.changes === S.moveChanges) return;
        S.moveChanges=m.changes;
        const scale=N.SCALES.findIndex(s => s.name.toLowerCase() === String(m.scale).toLowerCase());
        if (Number.isInteger(m.rootNote) && m.rootNote>=0 && m.rootNote<12) S.notes.root=m.rootNote;
        if (scale>=0) S.notes.scale=scale;
        releaseAllHeld(); S.dirty=true;
    } catch (_e) { /* older hosts do not publish set information */ }
}
function releaseRepeat() {
    if (S.repeatDown || S.noteRepeat) sendMsg(P.encodeButton(P.CC.NOTE_REPEAT,false));
    S.repeatDown=false; S.noteRepeat=false;
}
function openMenu(name) { S.menu=S.menu===name ? null : name; S.menuSelected=0; S.flashUntil=0; S.dirty=true; }
function menuItems() {
    if (S.menu === "keys") return [
        {label:"Root",value:N.NOTE_NAMES[S.notes.root]},
        {label:"Scale",value:N.SCALES[S.notes.scale].name},
        {label:"Layout",value:S.notes.chromatic ? "Chromatic" : "In-Key"}];
    /* Order and names: Ryan, 2026-11-19 (Step Seq is Shift + Step 8 only). */
    return [{label:"Clip layout",value:S.clipLayout ? "Transposed" : "Matrix"},
        {label:"Clock style",value:S.clockStyle === "quarter" ? "Quarter" : "Sixteenth"},
        {label:"Quantise",value:S.quantAlways ? "Always" : "TC only"},
        {label:"StepSeqJog",value:S.jogDial === "bars" ? "Bars" : "Q-Links"},
        {label:"Q-Link list",value:S.qlinkList ? "On" : "Off"}];
}
function changeMenu(d,t) {
    const i=S.menuSelected;
    if (S.menu === "keys") {
        releaseAllHeld();
        if (i===0) S.notes.root=(S.notes.root+d+12)%12;
        if (i===1) S.notes.scale=(S.notes.scale+d+N.SCALES.length)%N.SCALES.length;
        if (i===2) S.notes.chromatic=!S.notes.chromatic;
    } else if (S.menu === "setup") {
        /* By label, not position, so an item can come or go without shifting
         * the others (Refresh went, 2026-11-19: reopening the tool resends
         * everything, as Refresh did). */
        const label = (menuItems()[i] || {}).label;
        if (label === "Clip layout") { S.clipLayout=1-S.clipLayout; sendMsg(P.encodeSetMode(S.clipLayout)); savePreferences(); }
        if (label === "Clock style") { S.clockStyle=S.clockStyle === "quarter" ? "sixteenth" : "quarter"; savePreferences(); }
        if (label === "StepSeqJog") { S.jogDial=S.jogDial === "bars" ? "qlinks" : "bars"; savePreferences(); }
        if (label === "Q-Link list") { S.qlinkList=!S.qlinkList; savePreferences(); }
        if (label === "Quantise") { S.quantAlways=!S.quantAlways; savePreferences(); }
    }
    S.dirty=true;
}

/* ================= screen ================= */

const gfx = {
    clear: () => clear_screen(), print: (...a) => print(...a),
    textWidth: s => text_width(s), setPixel: (...a) => set_pixel(...a),
    drawRect: (...a) => draw_rect(...a), fillRect: (...a) => fill_rect(...a),
    drawLine: (...a) => draw_line(...a), fontHeight: () => get_font_height(),
    setFont: name => set_font(name === 'default' ? '/data/UserData/schwung/host/font.png'
        : '/data/UserData/schwung/host/fonts/' + name + '.png'),
};
function draw(t) {
    const n = S.notes, clip = S.mode === P.MODES.SESSION || S.mode === P.MODES.ROWS;
    const tw = S.mode === P.MODES.SESSION ? 8 : 4, sh = S.mode === P.MODES.SESSION ? 4 : 8;
    /* Rows as the MPC numbers them (Ryan): the arrangement row, when it is
     * shown in the clip matrix, is row 0; clip slot 1 is always 1. */
    const s0 = S.originY + CFG.SCENE_LABEL_OFFSET;
    /* The layout's name in full on the top line, the window's tracks and
     * scenes bottom right beside M and S (Ryan, 2026-11-19: "never enough
     * room to show the whole word"). Step Seq's top line is shorter. */
    const layout = S.mode === P.MODES.SESSION ? 'Matrix' : 'Transposed';
    const shortLayout = S.mode === P.MODES.SESSION ? 'Matrix' : 'Transp';
    const clipWindow = clip && S.gotState ? `T${S.originX + 1}-${S.originX + tw} S${s0}-${s0 + sh - 1}` : '';
    const view = clip ? (S.gotState ? layout : '')
        : S.mode === P.MODES.PADS ? 'Pads ' + L.bankLetter(S.padBank) + '|' + L.bankLetter(S.padBank + 1)
        : N.describe(n);   /* no InKey / Chrom: the pads show the layout (Ryan) */
    const context = clip ? view
        : S.mode === P.MODES.PADS ? 'Banks ' + L.bankLetter(S.padBank) + '|' + L.bankLetter(S.padBank + 1)
        : N.describe(n);   /* no InKey / Chrom: the pads show the layout (Ryan) */
    const feedback = S.text2Until > t ? S.text[2] : '';
    if (S.menu === "tempo" && !S.touchOrder.length) {
        gfx.clear(); drawSetting(gfx, {label:"Tempo",value:S.bpm.toFixed(1)+" BPM"}, {...CFG.SCREEN,top:3,bottom:61}); return;
    }
    if (S.menu && !S.touchOrder.length) { drawMenu(gfx,{title:S.menu === "setup" ? "Setup" : "Keys & Scales",items:menuItems(),selected:S.menuSelected},CFG.SCREEN.MENU_STYLE); return; }
    const pos = S.position, barPulses = pos ? pos.numerator * 3840 / pos.denominator : 3840;
    const pageList = S.pageListUntil > t;
    drawScreen(gfx, {
        conn: S.conn, connNote: S.connNote, mode: S.mode, modeName: P.MODE_NAMES[S.mode],
        context: playDark() ? "" : S.mpcMode === 1 ? "Step Seq  " + (clip ? shortLayout : view) : view,
        window: S.mpcMode === 1 || S.popup ? "" : clipWindow,
        trackName: S.text[0],
        subtitle: S.text[1],
        /* Step Seq: the lane bottom left once the Move has picked one (the MPC's own lane is not readable), the jog setting bottom right (Ryan). */
        footer: S.mpcMode === 1 ? {left: S.lane ? "Lane: " + S.lane : "", right: "Jog Dial: " + (S.jogDial === "bars" ? "Bars" : "Q-Links")} : null,
        /* M and S stay in the mute modes (Ryan); Step Seq has the bottom line instead. */
        marks: S.conn === "connected" && S.mpcMode !== 1 && !S.popup && (!S.aux || (S.available & 16)) ? {mute: S.muted, solo: S.solo} : null,
        qlinkPages: S.mpcMode === 1 ? 2 : 0,
        noteDetail: S.mode === P.MODES.NOTES ? 'Low ' + N.noteName(N.baseNote(n)) + ' ch' + n.channel : '',
        qlinkPage: S.qlinkPage, qlinks: S.qlink,
        touched: S.touchOrder.length ? S.touchOrder[S.touchOrder.length - 1] : -1,
        jogTouched: S.jogTouched, trackList: S.text.slice(3,6).some(Boolean) ? S.text.slice(3,6) : null,
        strip: pos && pos.length > 0 ? {bars:pos.length/barPulses,position:positionPulses(t)/barPulses,playing:S.playing} : null,
        pageList,
        originX: S.originX, originY: S.originY, globalCols: S.globalCols, globalRows: S.globalRows,
        pads: S.pads, pulseOn: t % 500 < 250,
        error: feedback.startsWith('!') ? feedback : '',
        flash: S.flashUntil > t ? S.flash : feedback,
        shift: false, legendPage: 0,   /* no Shift legend: the glyph LEDs say it, and it hid Q-Link page feedback (Ryan) */
    }, pageList ? {...CFG.SCREEN,REST_PLAY:"list",REST_CLIP:"name"} : CFG.SCREEN);
}

/* ================= timers ================= */

function timers(t) {
    if (S.conn === "connected" && t - S.lastMpcAt >= CFG.LINK_TIMEOUT_MS) {
        S.conn = "nompc"; S.connNote = "";
        releaseAllHeld(); releaseRepeat();
        sendMsg(P.encodeBye());
        clearMpcView();
        sendHello(t);
    }
    if (S.conn === "connected" && t - S.lastPingAt >= CFG.PING_MS) {
        sendMsg(P.encodePing());
        S.lastPingAt = t;
    }
    if (S.conn === "connecting" && t - S.helloAt >= CFG.HELLO_TIMEOUT_MS) {
        S.conn = "nompc"; S.connNote = "";
        S.dirty = true;
        sendHello(t);
    } else if (S.conn === "nompc" && t - S.lastHelloAt >= CFG.HELLO_RETRY_MS) {
        sendHello(t);
    }
    followMoveInfo(t);
    if (S.pageListUntil && S.pageListUntil <= t) { S.pageListUntil=0; S.dirty=true; }
    if ((S.flashUntil && S.flashUntil <= t) || (S.text2Until && S.text2Until <= t)) {
        if (S.flashUntil <= t) S.flashUntil = 0;
        if (S.text2Until <= t) S.text2Until = 0;
        S.dirty = true;
    }
}

/* ================= host entry points ================= */

globalThis.init = function () {
    try {
        S = freshState();
        asm = createAssembler(CFG.SYSEX_CAP);
        leds = createLedEngine(LED_KEYS, CFG.LED_BUDGET);
        startSession(now());
    } catch (_e) { if (S) S.stats.errors++; }
};

globalThis.tick = function () {
    try {
        if (!S) return;
        const t = now();
        if (globalThis.overtakeParked === true) {
            /* The host parks us (Back, or the Tools menu) without a hook of
             * its own; the first parked tick is where we learn of it. Drawing
             * and internal MIDI are no-ops here, so do nothing else. */
            if (!S.parked) { endSession(); S.parked = true; }
            return;
        }
        if (S.parked) startSession(t);     /* foreground again without onResume */
        S.tickNo++;
        if (S.repaintAt && S.repaintAt.length && t >= S.repaintAt[0]) { S.repaintAt.shift(); leds.invalidate(); }
        timers(t);
        updateLeds(t);
        leds.drain(S.tickNo, sendLed);
        const animated = S.playing && !!S.position || S.shift || ((S.mode === 0 || S.mode === 1) && CFG.SCREEN.REST_CLIP === 'minimap'
            && S.pads.some(p => p && p.anim >= 2));
        const phase = S.playing && S.position ? Math.floor(t / CFG.REDRAW_MS) : S.shift ? Math.floor(t / 2000) : Math.floor(t / 250);
        if ((S.dirty || (animated && phase !== S.drawPhase)) && t - S.lastDrawAt >= CFG.REDRAW_MS) {
            draw(t);
            S.dirty = false;
            S.lastDrawAt = t;
            S.drawPhase = phase;
        }
    } catch (_e) { if (S) S.stats.errors++; }
};

globalThis.onResume = function () {
    try { if (S) startSession(now()); } catch (_e) { if (S) S.stats.errors++; }
};

globalThis.onUnload = function () {
    /* Shift+Back, the host escape, or eviction while parked (then BYE has
     * already gone and endSession is a no-op). */
    try { if (S) endSession(); } catch (_e) { /* exiting anyway */ }
};

globalThis.onMidiMessageInternal = function (data) {
    try {
        if (!S || S.parked || !data || data.length < 3) return;
        handleInternal(data, now());
    } catch (_e) { if (S) S.stats.errors++; }
};

globalThis.onMidiMessageExternal = function (data) {
    try {
        if (!S || S.parked || !data || data.length < 1) return;
        const t = now();
        for (const msg of asm.feed(data)) handleMsg(P.decode(msg), t);
    } catch (_e) { if (S) S.stats.errors++; }
};

/* For the test harness only; the host never reads it. */
globalThis.__moveMpcControl = { get state() { return S; }, get leds() { return leds; }, CFG };
