// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ryan Gilmore
import { qlinkIndex } from "../../src/lib/qlinks.mjs";

const base = {
  conn: "connected",
  mode: 2,
  modeName: "Pads",
  context: "Pads A|B",
  trackName: "Drum 001",
  subtitle: "Drum",
  marks: {mute:false, solo:false},
  touched: -1,
  qlinkPage: 0,
  qlinks: [
    "Cutoff",
    "Resonance",
    "Attack",
    "Decay",
    "Sustain",
    "Release",
    "Pan",
    "Volume",
  ].map((name) => ({ name, value: "1.2 kHz" })),
  originX: 0,
  originY: 0,
  globalCols: 8,
  globalRows: 4,
  strip: null,
  pulseOn: true,
  pads: Array.from(
    { length: 32 },
    (_, i) => i % 3 ? { r: 60, g: 0, b: 0, anim: i % 4 === 0 ? 2 : 0 } : null,
  ),
};
export function scenarios() {
  const out = [],
    add = (group, name, vm = {}, opts = {}, kind = "screen") =>
      out.push({ group, name, vm: { ...base, ...vm }, opts, kind });
  for (const variant of ["list", "wrap", "name"]) {
    for (const mode of [2, 3]) {
      for (const long of [false, true]) {
        for (const known of [false, true]) {
          add(
            "rest-play",
            `${variant}-${mode === 2 ? "pads" : "notes"}-${
              long ? "long" : "short"
            }-${known ? "known" : "unknown"}`,
            {
              mode,
              context: mode === 2 ? "Pads A|B" : "C Major",
              noteDetail: mode === 3 ? "Low C2 ch1" : "",
              trackName: long
                ? "An extraordinarily long MPC track name 01"
                : "Drum 001",
              qlinks: base.qlinks.map((q, i) => known || i % 2 ? q : null),
            },
            { REST_PLAY: variant },
          );
        }
      }
    }
  }
  for (const variant of ["list", "wrap", "name"]) {
    for (const mode of [0, 1, 2, 3]) {
      for (const long of [false, true]) {
        add("knob-touch", `${variant}-mode${mode}-${long ? "long" : "short"}`, {
          mode,
          touched: 2,
          qlinkPage: 1,
          qlinks: base.qlinks.map((q) =>
            long
              ? { name: "Very long parameter name", value: "1234567890123456" }
              : q
          ),
        }, { REST_PLAY: variant });
      }
    }
  }
  for (const variant of ["name", "window", "minimap"]) {
    for (const mode of [0, 1]) {
      for (const size of ["small", "large", "edge", "capped"]) {
        for (const pulseOn of [false, true]) {
          const cols = size === "small" ? 8 : size === "capped" ? 127 : 16,
            rows = size === "small" ? 4 : size === "capped" ? 127 : 32;
          // A Rows aperture requires eight scenes; the small Rows matrix is 8x8.
          const globalRows = mode === 1 && rows === 4 ? 8 : rows;
          const originX = size === "edge" || size === "capped"
            ? cols - (mode ? 4 : 8)
            : 0;
          const originY = size === "edge" || size === "capped"
            ? globalRows - (mode ? 8 : 4)
            : 0;
          add(
            "rest-clip",
            `${variant}-${mode ? "rows" : "matrix"}-${size}-${
              pulseOn ? "on" : "off"
            }`,
            {
              mode,
              globalCols: cols,
              globalRows,
              originX,
              originY,
              pulseOn,
              context: `${mode ? "Transp" : "Matrix"} T${originX + 1}-${originX + (mode ? 4 : 8)} S${
                Math.max(1, originY)
              }-${Math.max(1, originY) + (mode ? 8 : 4) - 1}`,
            },
            { REST_CLIP: variant },
          );
        }
      }
    }
  }
  add("jog-touch", "list", {
    jogTouched: true,
    trackList: ["Bass", "Drum 001", "Lead"],
  });
  add("jog-touch", "fallback", { jogTouched: true });
  for (
    const flash of [
      "Mode: Matrix",
      "Banks C|D",
      "Stop all clips",
      "Refresh",
    ]
  ) add("flash", flash.toLowerCase().replace(/[^a-z0-9]+/g, "-"), { flash });
  add("error", "long", { error: "!Unable to launch clip: no clip workflow" });
  for (const conn of ["connecting", "nompc", "version"]) {
    add("link", conn, {
      conn,
      connNote: "MPC script too new; reopen after updating",
    });
  }
  for (
    const variant of ["list", "wrap", "name", "minimap", "window", "clip-name"]
  ) {
    for (const bars of [null, 1, 4, 16, 32]) {
      for (const playing of [false, true]) {
        for (const pos of [0, 0.375, 0.99, 1]) {
          add(
            "strip",
            `${variant}-${bars ?? "null"}-${
              playing ? "playing" : "stopped"
            }-${pos}`,
            {
              mode: ["minimap", "window", "clip-name"].includes(variant)
                ? 0
                : 2,
              context: ["minimap", "window", "clip-name"].includes(variant)
                ? "Matrix T1-8 S1-4"
                : "Pads A|B",
              strip: bars ? { bars, position: bars * pos, playing } : null,
            },
            {
              REST_PLAY: ["list", "wrap"].includes(variant) ? variant : "name",
              REST_CLIP: ["minimap", "window"].includes(variant)
                ? variant
                : "name",
            },
          );
        }
      }
    }
  }
  for (const style of ["move", "list"]) {
    for (const selected of [0, 3, 7]) {
      add(
        "menu",
        `${style}-${selected}`,
        {
          title: "Settings",
          items: Array.from(
            { length: 8 },
            (_, i) => ({
              label: [
                "Clip layout",
                "Link",
                "Version",
                "Refresh",
                "Root",
                "Scale",
                "Channel",
                "Exit",
              ][i],
              value: i === 0 ? "Matrix" : "",
            }),
          ),
          selected,
        },
        { style },
        "menu",
      );
    }
  }
  add("setting", "short", { label: "Root", value: "C" }, {}, "setting");
  add(
    "setting",
    "long",
    { label: "Very long setting label", value: "1234567890123456" },
    {},
    "setting",
  );
  for (const mode of [0, 1, 2, 3]) {
    for (const legendPage of [0, 1]) {
      add("shift", `${mode}-${legendPage}`, {
        shift: true,
        mode,
        modeName: ["Matrix", "Transposed", "Pads", "Notes"][mode],
        globalRows: mode === 1 ? 8 : 4,
        context: mode < 2
          ? (mode === 1 ? "Transp T1-4 S1-8" : "Matrix T1-8 S1-4")
          : mode === 2
          ? "Pads A|B"
          : "C Major",
        legendPage,
        noteDetail: mode === 3 ? "Low C2 ch1" : "",
      });
    }
  }
  for (const variant of ["list", "wrap"]) {
    for (const order of ["columns", "rows"]) {
      for (const strip of [null, { bars: 4, position: 1.5, playing: true }]) {
        for (const [batch, names] of MPC_NAMES.entries()) {
          add(
            "rest-play",
            `${variant}-${order}-mpc${batch}-${strip ? "strip" : "no-strip"}`,
            {
              qlinks: names.map((name) => ({ name, value: "1.2 kHz" })),
              strip,
            },
            { REST_PLAY: variant, QLINK_LIST_ORDER: order },
          );
        }
      }
    }
  }
  add("rest-clip", "window-offset", {
    mode: 0,
    originX: 8,
    originY: 4,
    globalCols: 16,
    globalRows: 32,
  }, { REST_CLIP: "window" });
  add("knob-touch", "full-label", {
    touched: 0,
    qlinks: [{ name: "Filter Envelope Amount", value: "42%" }],
  });
  add("knob-touch", "two-line-label", {
    touched: 0,
    strip: { bars: 4, position: 1, playing: true },
    qlinks: [{ name: "Layer 1 Filter Envelope Amount", value: "42%" }],
  });
  for (const selected of [0, 1, 2, 3, 4, 5, 6]) {
    add("v2-menu", `setup-${selected}`, {
      title: "Setup", selected,
      items: [
        { label: "Clip layout", value: "Matrix" },
        { label: "Clock style", value: "Quarter" },
        { label: "Refresh", value: "" },
        { label: "Link/versions", value: "v4" },
        { label: "Step Seq", value: "Off" },
        { label: "Jog Dial", value: "Bars" },
        { label: "Q-Link list", value: "Off" },
      ],
    }, { style: "list" }, "menu");
  }
  add("v2-menu", "keys-scales", {
    title: "Keys & Scales", selected: 1,
    items: [{ label: "Root", value: "C" }, { label: "Scale", value: "Major" },
      { label: "Layout", value: "In-Key" }],
  }, { style: "list" }, "menu");
  add("v2-setting", "tempo", { label: "Tempo", value: "125.0 BPM" }, {}, "setting");
  for (const flash of ["Automation: Write", "Clip duplicated", "Track column is full", "Clip deleted", "Scene duplicated"]) {
    add("v2-feedback", flash.toLowerCase().replace(/[^a-z0-9]+/g, "-"), { flash });
  }
  add("v2-page", "eight-names", {
    pageList: true,
    qlinks: MPC_NAMES[0].map(name => ({ name, value: "42" })),
    strip: { bars: 2, position: 0.75, playing: true },
  }, { REST_PLAY: "list" });
  add("v2-page", "touch-over-page-list", {
    pageList: true, touched: 2, qlinkPage: 1,
    qlinks: MPC_NAMES[0].map(name => ({name,value:"42%"})),
    strip: {bars:2,position:0.75,playing:true},
  });
  for (const mode of [0,1,2,3]) {
    add("v2-default", `mode-${mode}`, {mode,
      context: mode < 2 ? "Matrix T1-8 S1-4" : mode === 2 ? "Pads A|B" : "C Major",
      strip: {bars:2,position:0.75,playing:true},
    });
  }
  add("v2-jog", "neighbours", {jogTouched:true,trackList:["Bass","Drums","Synth"]});
  const gridNames = [
    "Env 2 Attack", "Env 2 Decay", "Env 1 Release", "Env 2 Release",
    "Env 2 Sustain", "Env 2 Amount", "Env 1 Sustain", "Env 1 Amount",
    "Cutoff", "Resonance", "Env 1 Decay", "LFO Rate",
    "Volume", "Pan", "Env 1 Attack", "LFO Depth",
  ];
  for (let page = 0; page < 4; page++) {
    const vm = {
      qlinkPage: page,
      qlinks: Array.from({length:8}, (_, k) => ({name:gridNames[qlinkIndex(page,k)], value:"42%"})),
      strip: {bars:2,position:0.75,playing:true},
    };
    add("qlink-pages", `page-${page}-names`, {...vm,pageList:true}, {REST_PLAY:"list"});
    add("qlink-pages", `page-${page}-dots`, vm);
    add("qlink-pages", `page-${page}-label`, {...vm,shift:true,legendPage:1});
    for (const variant of ["name","list","wrap"]) {
      for (const k of [0,3,4,7]) {
        add("qlink-pages", `page-${page}-touch-${k}-${variant}`, {...vm,touched:k}, {REST_PLAY:variant});
      }
    }
  }
  add("main", "drum", {marks:{mute:false,solo:false}});
  add("main", "plugin-solo", {mode:3,context:"C Major",trackName:"Lead",subtitle:"Soft Saw",marks:{mute:false,solo:true}});
  add("main", "keygroup-muted", {mode:3,context:"C Major",trackName:"Piano",subtitle:"Keygroup",marks:{mute:true,solo:false}});
  add("main", "matrix", {mode:0,context:"Matrix T1-8 S1-4"});
  add("main", "step-seq", {context:"Step Seq  Pads A|B",footer:{left:"Lane: A01",right:"Jog Dial: Q-Links"},marks:null,qlinkPages:2});
  add("main", "step-seq-bars", {context:"Step Seq  Pads A|B",footer:{left:"Lane: B16",right:"Jog Dial: Bars"},marks:null,qlinkPages:2});
  add("main", "step-seq-no-lane", {context:"Step Seq  Pads A|B",footer:{left:"",right:"Jog Dial: Q-Links"},marks:null,qlinkPages:2});
  add("main", "track-mute", {context:"Pads A|B",marks:{mute:true,solo:false}});
  add("main", "pad-mute", {context:"Pads A|B",marks:{mute:false,solo:false}});
  add("main", "both-on", {marks:{mute:true,solo:true}});
  add("main", "aux", {context:"",trackName:"Reverb",subtitle:"Return",marks:null});
  return out;
}

export const MPC_NAMES = [
  [
    "Filter Cutoff",
    "Amp Env Attack",
    "Layer 1 Level",
    "Send 1",
    "Pad A05 Tune",
    "Master Vol",
    "Pan",
    "LFO Rate",
  ],
  [
    "Filter Env Amount",
    "Resonance",
    "Envelope Release",
    "Velocity Amount",
    "Sample Semitones",
    "Program Volume",
    "Feedback Depth",
    "Frequency Rate",
  ],
];
export function keyScreens(cases = scenarios()) {
  const keys = [
    ...["drum","plugin-solo","keygroup-muted","matrix","step-seq","aux"].map(name => ["main",name,name]),
    ["rest-play", "list-columns-mpc0-strip", "rest-play list (columns)"],
    ["rest-play", "list-rows-mpc0-strip", "rest-play list (rows)"],
    ["rest-play", "wrap-columns-mpc0-strip", "rest-play wrap"],
    ["rest-play", "name-pads-short-known", "rest-play name"],
    ["knob-touch", "full-label", "knob-touch"],
    ["rest-clip", "name-matrix-small-on", "rest-clip name"],
    ["rest-clip", "window-offset", "rest-clip window"],
    ["rest-clip", "minimap-matrix-small-on", "rest-clip minimap (8x4)"],
    ["jog-touch", "list", "jog-touch list"],
    ["flash", "banks-c-d", "flash"],
    ["link", "nompc", "No MPC"],
    ["menu", "move-3", "menu move"],
    ["menu", "list-3", "menu list"],
    ["strip", "list-4-playing-0.375", "strip 4 bars playing"],
    ["qlink-pages", "page-2-names", "Col 1-2 assignments (list enabled)"],
    ["qlink-pages", "page-3-names", "Col 3-4 assignments (list enabled)"],
    ["qlink-pages", "page-3-touch-0-list", "Col 3-4 knob 1 = Q15"],
  ];
  return keys.map(([group, name, caption]) => {
    const scenario = cases.find((s) => s.group === group && s.name === name);
    if (!scenario) throw new Error(`Missing key screen ${group}/${name}`);
    return { ...scenario, caption };
  });
}
