// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ryan Gilmore
import assert from "node:assert/strict";
import VECTORS from "../protocol/vectors.json" with {type:"json"};
import {
  DEFAULT_OPTIONS,
  drawMenu,
  drawScreen,
  drawSetting,
  drawStrip,
  shortenName,
  stripGeometry,
  truncate,
} from "../src/lib/screen.mjs";
import {
  keyScreens,
  MPC_NAMES,
  scenarios,
} from "../tools/preview/scenarios.mjs";
import { recordingGfx } from "./recording-gfx.mjs";
for (const fail of [false, true]) {
  Deno.test(`screen: every preview scenario stays in panel, font fallback=${fail}`, () => {
    for (const s of scenarios()) {
      const g = recordingGfx(fail);
      try {
        if (s.kind === "menu") drawMenu(g, s.vm, s.opts.style);
        else if (s.kind === "setting") drawSetting(g, s.vm);
        else drawScreen(g, s.vm, s.opts);
      } catch (e) {
        throw new Error(`${s.group}/${s.name}: ${e.message}`);
      }
      assert.ok(g.calls.length > 0);
    }
  });
}
Deno.test("screen: truncation fits every region, including smaller than ellipsis", () => {
  const g = recordingGfx();
  for (const name of ["default", "tamzen-12", "tamzen-20"]) {
    g.setFont(name);
    for (let width = 0; width <= 128; width++) {
      const s = truncate(g, "A long parameter name with units", width);
      assert.ok(g.textWidth(s) <= width);
      if (s) g.print(128 - width, 0, s, 1);
    }
  }
  g.setFont("default");
  assert.equal(truncate(g, "abcdef", 24), "a...");
});
Deno.test("screen: variants and menu styles produce different layouts", () => {
  const vm = scenarios()[0].vm, g = recordingGfx();
  drawScreen(g, vm, { REST_PLAY: "list" });
  const list = structuredClone(g.calls);
  drawScreen(g, vm, { REST_PLAY: "name" });
  assert.notDeepEqual(g.calls, list);
  drawScreen(g, { ...vm, mode: 0 }, { REST_CLIP: "minimap" });
  const map = structuredClone(g.calls);
  drawScreen(g, { ...vm, mode: 0 }, { REST_CLIP: "name" });
  assert.notDeepEqual(g.calls, map);
  const menu = {
    title: "Menu",
    items: Array.from(
      { length: 8 },
      (_, i) => ({ label: "Item " + i, value: String(i) }),
    ),
    selected: 7,
  };
  drawMenu(g, menu, "move");
  const move = structuredClone(g.calls);
  assert.ok(move.some((c) => c.text === "Item 7"));
  assert.ok(!move.some((c) => c.text === "Item 0"));
  drawMenu(g, menu, "list");
  assert.notDeepEqual(g.calls, move);
});
Deno.test("screen: strip widths plus one-pixel gaps fill panel; bar window and marker", () => {
  assert.equal(stripGeometry(null), null);
  for (let bars = 1; bars <= 127; bars++) {
    for (const position of [0, 0.5, bars / 2, bars - 0.01, bars]) {
      const geo = stripGeometry({ bars, position, playing: true });
      assert.equal(
        geo.segments.reduce((n, s) => n + s.w, 0) + geo.count - 1,
        128,
      );
      assert.equal(geo.segments.at(-1).x + geo.segments.at(-1).w, 128);
      assert.equal(
        geo.segments.filter((s) => s.current).length,
        1,
      );
      assert.ok(geo.marker >= 0 && geo.marker < 128);
      assert.equal(
        geo.marker,
        Math.min(127, Math.floor((position - geo.start) / geo.count * 128)),
      );
      const g = recordingGfx();
      drawStrip(g, { bars, position, playing: true });
      assert.ok(
        g.calls.some((c) =>
          c.kind === "line" && c.x === geo.marker && c.y === 59 && c.yy === 63
        ),
      );
    }
  }
  assert.equal(stripGeometry({ bars: 32, position: 16 }).start, 16);
  assert.equal(stripGeometry({ bars: 32, position: 0 }).moreRight, true);
  assert.equal(stripGeometry({ bars: 32, position: 32 }).moreLeft, true);
});
Deno.test("screen: clip pad coordinates follow Session and Rows protocol, pulse hides ink", () => {
  const vm = {
    ...scenarios()[0].vm,
    mode: 0,
    globalCols: 8,
    globalRows: 4,
    pads: [{ r: 1, g: 0, b: 0, anim: 2 }],
    pulseOn: true,
  };
  const g = recordingGfx();
  drawScreen(g, vm, { REST_CLIP: "minimap" });
  const fills = g.calls.filter((c) => c.kind === "fill" && c.w > 2 && c.y > 7); // exclude page dot
  assert.ok(fills.some((c) => c.x === 32 && c.y === 31)); // pad 0: bottom-left
  drawScreen(g, { ...vm, pulseOn: false }, { REST_CLIP: "minimap" });
  assert.equal(g.calls.filter((c) => c.kind === "fill" && c.w > 2 && c.y > 7).length, 0);
  drawScreen(g, { ...vm, mode: 1, globalCols: 4, globalRows: 8 }, {
    REST_CLIP: "minimap",
  });
  assert.ok(g.calls.some((c) => c.kind === "fill" && c.x === 72 && c.y === 10)); // pad 0: fourth track, first scene
});
Deno.test("screen: full-screen link states suppress all other information", () => {
  const vm = scenarios()[0].vm, g = recordingGfx();
  for (const conn of ["connecting", "nompc", "version"]) {
    drawScreen(g, {
      ...vm,
      conn,
      connNote: "MPC script too new",
      flash: "Refresh",
      touched: 1,
      shift: true,
    });
    assert.ok(
      !g.calls.some((c) =>
        c.text?.includes("Banks") || c.text?.includes("Refresh") ||
        c.text?.includes("Q-Link")
      ),
    );
  }
});
Deno.test("screen: values get their own box and error beats flash", () => {
  const g = recordingGfx();
  const vm = scenarios()[0].vm;
  drawScreen(g, { ...vm, touched: 1 });
  const box = g.calls.find((c) => c.kind === "rect" && c.w === 120);
  const value = g.calls.find((c) => c.text === "1.2 kHz");
  assert.ok(value.y > box.y && value.y + value.h < box.y + box.h);
  drawScreen(g, { ...vm, error: "!An error happened", flash: "Refresh" });
  assert.ok(g.calls.some((c) => c.text?.startsWith("!")));
  assert.ok(!g.calls.some((c) => c.text === "Refresh"));
});

Deno.test("screen: list order, padding, divider and font fallback", () => {
  assert.equal(DEFAULT_OPTIONS.REST_PLAY, "name");
  assert.equal(DEFAULT_OPTIONS.REST_CLIP, "name");
  for (const fail of [false, true]) {
    for (const order of ["columns", "rows"]) {
      const g = recordingGfx(fail),
        vm = {
          ...scenarios()[0].vm,
          qlinks: Array.from(
            { length: 8 },
            (_, i) => ({ name: `Knob ${i + 1}` }),
          ),
        };
      drawScreen(g, vm, { REST_PLAY: "list", QLINK_LIST_ORDER: order });
      const labels = g.calls.filter((c) => c.text?.startsWith("Knob"));
      assert.equal(labels.length, 8);
      labels.forEach((c, i) => {
        assert.equal(
          c.x,
          1 + 64 * (order === "rows" ? i % 2 : Math.floor(i / 4)),
        );
        assert.ok(c.x + c.w <= (c.x < 64 ? 62 : 126));
        assert.equal(c.h, fail ? 7 : 9);
        if (i) {
          assert.equal(
            c.y === labels[0].y,
            order === "rows" ? i === 1 : i === 4,
          );
        }
      });
      assert.ok(
        g.calls.some((c) => c.kind === "line" && c.x === 63 && c.xx === 63),
      );
    }
  }
});
Deno.test("screen: shortening uses rightmost known words first, then one longest word, then ellipsis", () => {
  const g = recordingGfx();
  g.textWidth = (s) => s.length * 5;
  assert.equal(shortenName(g, "Filter Cutoff", 61), "Filter Cut");
  assert.equal(shortenName(g, "Amp Env Attack", 61), "Amp Env Atk");
  assert.equal(shortenName(g, "Layer 1 Level", 61), "Layer 1 Lvl");
  assert.equal(shortenName(g, "Filter Env Amount", 61), "Flt Env Amt");
  assert.equal(shortenName(g, "Extraordinary Resonance", 65), "Extrrdnry Res");
  assert.equal(shortenName(g, "abcdefghijklmnopqrstuvwxyz", 40), "abcdf...");
  assert.equal(shortenName(g, "Pad A05 Tune", 61), "Pad A05 Tune");
  assert.equal(shortenName(g, "Filter Cutoff", 30, 2), "Filter Cutoff");
  for (const names of MPC_NAMES) {
    for (const name of names) {
      for (const width of [30, 61]) {
        const label = shortenName(g, name, width, width === 30 ? 2 : 1);
        if (width === 61) assert.ok(g.textWidth(label) <= width);
      }
    }
  }
});
Deno.test("screen: wrap uses at most two lines per 32-pixel cell", () => {
  const g = recordingGfx();
  drawScreen(g, {
    ...scenarios()[0].vm,
    qlinks: MPC_NAMES[0].map((name) => ({ name })),
  }, { REST_PLAY: "wrap" });
  const labels = g.calls.filter((c) => c.kind === "text" && c.y >= 10);
  assert.ok(labels.length >= 8 && labels.length <= 16);
  for (const c of labels) assert.ok(c.x % 32 === 1 && c.w <= 30 && c.h === 7);
});
Deno.test("screen: touch preserves full labels, wraps only past smallest font, footer replaces cells", () => {
  for (const variant of ["list", "wrap", "name"]) {
    for (
      const name of ["Filter Env Amount", "Layer 1 Filter Envelope Amount"]
    ) {
      const g = recordingGfx();
      drawScreen(g, {
        ...scenarios()[0].vm,
        touched: 0,
        qlinks: [{ name, value: "42%" }],
        strip: { bars: 4, position: 1 },
      }, { REST_PLAY: variant });
      const labels = g.calls.filter((c) =>
        c.kind === "text" && !c.text.startsWith("Q-Link") && c.text !== "42%"
      );
      assert.equal(labels.map((c) => c.text).join(" "), name);
      assert.equal(labels.length, name.length * 6 <= 124 ? 1 : 2);
      assert.equal(
        g.calls.filter((c) => c.text?.startsWith("Q-Link")).length,
        1,
      );
      if (variant !== "name") {
        assert.ok(
          g.calls.some((c) => c.text === "Q-Link 1 of 16" && c.y === 50),
        );
      }
    }
  }
});
Deno.test("screen: window shows correct Matrix and Transposed ranges", () => {
  for (const mode of [0, 1]) {
    const g = recordingGfx();
    drawScreen(g, {
      ...scenarios()[0].vm,
      mode,
      originX: 8,
      originY: 4,
      globalCols: 16,
      globalRows: 32,
    }, { REST_CLIP: "window" });
    for (
      const value of [
        "Drum 001",
        mode ? "Tracks 9-12" : "Tracks 9-16",
        mode ? "Scenes 5-12" : "Scenes 5-8",
        "of 16 x 32",
      ]
    ) {
      assert.ok(g.calls.some((c) => c.text === value), value);
    }
  }
  assert.equal(keyScreens().length, 23);
});
Deno.test("screen: all setFont calls can fail when default is already active", () => {
  const g = recordingGfx();
  g.setFont = () => false;
  drawScreen(g, scenarios()[0].vm);
  assert.ok(g.calls.filter((c) => c.kind === "text").every((c) => c.h === 7));
});
Deno.test("screen: unbroken long errors wrap into two bounded lines", () => {
  const g = recordingGfx();
  drawScreen(g, {
    ...scenarios()[0].vm,
    error: "!123456789012345678901234567890123456789",
  });
  const lines = g.calls.filter((c) => c.kind === "text");
  assert.equal(lines.length, 2);
  assert.equal(
    lines.map((c) => c.text).join(""),
    "!123456789012345678901234567890123456789",
  );
});

Deno.test("screen: fitting names keep every word, including known abbreviations", () => {
  const g=recordingGfx();
  for (const name of ["Filter Cutoff", "Layer 1 Level", "Master Volume", "Envelope Amount"]) {
    assert.equal(shortenName(g,name,g.textWidth(name)),name);
    assert.equal(shortenName(g,name,g.textWidth(name)+10),name);
  }
});

Deno.test("screen: every page shows mapped Q-Link numbers, page label and four dots", () => {
  const base = scenarios()[0].vm;
  for (let page = 0; page < 4; page++) {
    const vm = {...base, qlinkPage:page};
    for (let k = 0; k < 8; k++) {
      for (const variant of ["name", "list", "wrap"]) {
        const g = recordingGfx();
        drawScreen(g, {...vm,touched:k}, {REST_PLAY:variant});
        const n = VECTORS.qlink_pages[page][k]+1;
        assert.ok(g.calls.some(c => c.text === `Q-Link ${n}${variant === "name" ? "" : " of 16"}`));
      }
    }
    const g = recordingGfx();
    drawScreen(g, {...vm,shift:true,legendPage:1});
    const label = ["Q1-8", "Q9-16", "Col 1-2", "Col 3-4"][page];
    assert.ok(g.calls.some(c => c.text?.startsWith(label)));
    g.clear(); drawScreen(g, vm);
    assert.deepEqual(g.calls.filter(c => c.kind === "rect" && c.y === 1 && c.w === 6 && c.h === 6).map(c => c.x), [100,107,114,121]);
    assert.deepEqual(g.calls.filter(c => c.kind === "fill" && c.y === 2 && c.w === 4 && c.h === 4).map(c => c.x), [101+page*7]);
  }
});

Deno.test("screen: Step Seq limits the 6x6 page marks to two", () => {
  for(let page=0;page<2;page++) {
    const g=recordingGfx(); drawScreen(g,{...scenarios()[0].vm,qlinkPages:2,qlinkPage:page});
    assert.deepEqual(g.calls.filter(c=>c.kind==='rect' && c.y===1 && c.w===6 && c.h===6).map(c=>c.x),[114,121]);
    assert.deepEqual(g.calls.filter(c=>c.kind==='fill' && c.y===2 && c.w===4 && c.h===4).map(c=>c.x),[115+7*page]);
  }
});

Deno.test("screen: main name band, centred description and fixed inverted status boxes", () => {
  for (const fail of [false,true]) for (let bits=0;bits<8;bits++) {
    const g=recordingGfx(fail);
    drawScreen(g,{...scenarios()[0].vm,trackName:"Drums",subtitle:"Drum",marks:{mute:!!(bits&1),solo:!!(bits&2),arm:!!(bits&4)}});
    const name=g.calls.find(c=>c.text==="Drums");
    assert.ok(name.y>=9 && name.y+name.h<=31);
    const detail=g.calls.find(c=>c.text==="Drum");
    assert.equal(detail.y,33); assert.ok(Math.abs(detail.x+detail.w/2-64)<=1);
    assert.ok(!g.calls.some(c=>c.text==="ARM"));
    let x=2;
    for (const [i,label] of ["M","S"].entries()) {
      const on=!!(bits&(1<<i)), w=11;
      assert.ok(g.calls.some(c=>c.kind===(on?"fill":"rect") && c.x===x && c.y===48 && c.w===w && c.h===11));
      assert.ok(g.calls.some(c=>c.text===label && c.x===x+3 && c.y===50 && c.color===(on?0:1)));
      x+=w+3;
    }
  }
  const g=recordingGfx(); drawScreen(g,{...scenarios()[0].vm,marks:null});
  assert.ok(!g.calls.some(c=>["M","S","ARM"].includes(c.text)));
});
