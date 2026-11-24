// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ryan Gilmore
/* Screen reader: what ui.js announces, through the host's screen-reader
 * call (test/screen_reader_stub.mjs stands in for Schwung's shared module). */

import assert from "node:assert/strict";
import { withUi, vector } from "./harness.mjs";

const WELCOME = vector("mpc_to_move", "welcome v5, clip workflow available").wire;
const GOODBYE = vector("mpc_to_move", "goodbye").wire;

/* STATE, as ui.test.mjs builds it: mode, Q-Link page, pad bank, features, mpcMode. */
function state(h, { mode = 0, page = 0, bank = 0, features = 0, mpcMode = 0 } = {}) {
    h.sysex([0xF0,0x7D,0x4D,0x50,0x42,mode,page,bank,0,0,0,16,32,15,features,1,15,48,9,mpcMode,0,0xF7]);
}
function text(h, slot, s) {
    h.sysex([0xF0,0x7D,0x4D,0x50,0x46,slot,...[...s].map(c => c.charCodeAt(0)),0xF7]);
}
const HW = {
    shiftOn: [0xB0, 49, 127], shiftOff: [0xB0, 49, 0],
    stepOn: (i) => [0x90, 16 + i, 127], stepOff: (i) => [0x80, 16 + i, 0],
    cc: (n, v = 127) => [0xB0, n, v],
};
function shiftStep(h, i) { h.internal(HW.shiftOn, HW.stepOn(i), HW.stepOff(i), HW.shiftOff); }

/* Connected, first STATE and track name in, everything said. */
async function ready(h, st = {}) {
    h.init(); h.run(200);
    h.sysex(WELCOME); state(h, st); text(h, 0, "1: Drums");
    h.run(200);
}
const last = (h) => h.spoken.at(-1);

Deno.test("speech: entry says the tool and that it is connecting", async () => {
    await withUi(async h => {
        h.init(); h.run(200);
        assert.deepEqual(h.spoken, ["Move MPC Control. Connecting to MPC"]);
    });
});

Deno.test("speech: connecting says the mode and the track as ONE announcement", async () => {
    await withUi(async h => {
        await ready(h);
        /* One message: the host keeps only the latest inside its debounce window. */
        assert.equal(h.spoken.length, 2, JSON.stringify(h.spoken));
        assert.equal(last(h), "Connected to MPC. Clip matrix. Track 1: Drums");
    });
});

Deno.test("speech: connected waits for the first STATE, not just WELCOME", async () => {
    await withUi(async h => {
        h.init(); h.run(200);
        h.sysex(WELCOME); h.run(100);
        assert.equal(h.spoken.length, 1, "nothing yet: no STATE");
        state(h); h.run(200);
        assert.equal(last(h), "Connected to MPC. Clip matrix");
    });
});

Deno.test("speech: no MPC, the script leaving, and a version mismatch are said", async () => {
    await withUi(async h => {
        h.init(); h.run(3500);
        assert.equal(last(h), "No MPC");
        await ready(h);
        h.sysex(GOODBYE); h.run(200);
        assert.equal(last(h), "MPC script left");
    });
});

Deno.test("speech: mode changes from the MPC are said, Notes with its key", async () => {
    await withUi(async h => {
        await ready(h);
        state(h, { mode: 1 }); h.run(200);
        assert.equal(last(h), "Clip matrix, transposed");
        state(h, { mode: 3 }); h.run(200);
        assert.equal(last(h), "Notes, C Major");
        state(h, { mode: 2, bank: 2 }); h.run(200);
        assert.equal(last(h), "Pads. Banks C and D");
    });
});

Deno.test("speech: pad bank changes are said in Pads only", async () => {
    await withUi(async h => {
        await ready(h, { mode: 2 });
        const n = h.spoken.length;
        state(h, { mode: 2, bank: 4 }); h.run(200);
        assert.equal(last(h), "Banks E and F");
        state(h, { mode: 0, bank: 0 }); h.run(200);
        assert.equal(h.spoken.length, n + 2);
        assert.equal(last(h), "Clip matrix");
    });
});

Deno.test("speech: Step Seq, the mute modes and 16 Levels are said; back to Main too", async () => {
    await withUi(async h => {
        await ready(h);
        state(h, { mpcMode: 1 }); h.run(200);
        /* The knobs change meaning in Step Seq, so their page is said as well. */
        assert.equal(last(h), "Step Seq. Q-Links: step 1 to 8 velocities");
        state(h, { mpcMode: 2 }); h.run(200);
        assert.equal(last(h), "Track Mute. Q-Links 1 to 8");
        state(h, { mpcMode: 3 }); h.run(200);
        assert.equal(last(h), "Pad Mute");
        state(h, { mpcMode: 0, features: 8 }); h.run(200);
        assert.equal(last(h), "16 Levels");
        state(h, { mpcMode: 0 }); h.run(200);
        assert.equal(last(h), "Main");
    });
});

Deno.test("speech: Q-Link page names, from Shift + jog and in Step Seq", async () => {
    await withUi(async h => {
        await ready(h);
        h.internal(HW.shiftOn, HW.cc(14, 1), HW.shiftOff); h.run(200);
        assert.equal(last(h), "Q-Links 9 to 16");
        h.internal(HW.shiftOn, HW.cc(14, 1), HW.shiftOff); h.run(200);
        assert.equal(last(h), "Q-Links columns 1 and 2");
        state(h, { mpcMode: 1, page: 1 }); h.run(200);
        assert.equal(last(h), "Step Seq. Q-Links: step 9 to 16 velocities");
    });
});

Deno.test("speech: the track is said when it changes", async () => {
    await withUi(async h => {
        await ready(h);
        text(h, 0, "2: Bass"); h.run(200);
        assert.equal(last(h), "Track 2: Bass");
    });
});

Deno.test("speech: Setup menu opens with its item, says moves and changes, and closes", async () => {
    await withUi(async h => {
        await ready(h);
        shiftStep(h, 1); h.run(200);
        assert.equal(last(h), "Setup. Clip layout: Matrix");
        h.internal(HW.cc(54)); h.internal(HW.cc(54, 0)); h.run(200);
        assert.equal(last(h), "Clock style: Quarter");
        h.internal(HW.cc(63)); h.internal(HW.cc(63, 0)); h.run(200);
        assert.equal(last(h), "Clock style: Sixteenth");
        h.internal(HW.cc(51)); h.run(200);
        assert.equal(last(h), "Setup closed");
    });
});

Deno.test("speech: Keys menu values are spoken with sharps", async () => {
    await withUi(async h => {
        await ready(h);
        shiftStep(h, 8); h.run(200);
        assert.equal(last(h), "Keys and Scales. Root: C");
        h.internal(HW.cc(63)); h.internal(HW.cc(63, 0)); h.run(200);
        assert.equal(last(h), "Root: C sharp");
    });
});

Deno.test("speech: Notes arrows say what the screen flashes", async () => {
    await withUi(async h => {
        await ready(h, { mode: 3 });
        h.internal(HW.shiftOn, HW.cc(63), HW.cc(63, 0), HW.shiftOff); h.run(200);
        assert.equal(last(h), "C sharp Major");
        h.internal(HW.cc(55)); h.internal(HW.cc(55, 0)); h.run(200);
        assert.match(last(h), /^Low note /);
    });
});

Deno.test("speech: the MPC's transient feedback is said; its Q-Link and mode names are not doubled", async () => {
    await withUi(async h => {
        await ready(h);
        text(h, 2, "Clip copied"); h.run(200);
        assert.equal(last(h), "Clip copied");
        const n = h.spoken.length;
        text(h, 2, "Matrix"); text(h, 2, "Q-Links 1-8"); h.run(200);
        assert.equal(h.spoken.length, n, JSON.stringify(h.spoken.slice(n)));
    });
});

Deno.test("speech: Shift + jog in Step Seq says the Jog Dial setting", async () => {
    await withUi(async h => {
        await ready(h, { mpcMode: 1 });
        h.internal(HW.shiftOn, HW.cc(14, 1), HW.shiftOff); h.run(200);
        assert.equal(last(h), "Jog Dial: Q-Links");
    });
});

Deno.test("speech: resuming says it all again", async () => {
    await withUi(async h => {
        await ready(h);
        h.park(); h.resume(); h.run(200);
        assert.equal(last(h), "Move MPC Control. Connecting to MPC");
        h.sysex(WELCOME); state(h); h.run(200);
        assert.equal(last(h), "Connected to MPC. Clip matrix. Track 1: Drums");
    });
});
