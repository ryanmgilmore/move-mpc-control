// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ryan Gilmore
/* Pure 128x64 drawing. ASCII three-dot ellipsis: the host prints UTF-8 as
 * bytes, and deployed Tamzen atlases contain only ASCII 32..126. */
import { NUM_QLINK_PAGES, QLINK_PAGE_LABELS, qlinkIndex } from "./qlinks.mjs";

export const DEFAULT_OPTIONS = {
  REST_PLAY: "name",
  QLINK_LIST_ORDER: "columns",
  REST_CLIP: "name",
  MENU_STYLE: "list",
  NAME_FONTS: ["tamzen-20", "tamzen-16", "tamzen-14", "tamzen-12"],
  LABEL_FONTS: ["tamzen-12", "default"],
  HINT_FONT: "tamzen-9",
};
const ascii = (s) => String(s ?? "").replace(/[^\x20-\x7e]/g, "?");
function font(g, name = "default") {
  if (!g.setFont(name)) g.setFont("default");
}
export function truncate(g, text, width) {
  let s = ascii(text);
  if (g.textWidth(s) <= width) return s;
  let suffix = "...";
  while (suffix && g.textWidth(suffix) > width) suffix = suffix.slice(1);
  while (s && g.textWidth(s + suffix) > width) s = s.slice(0, -1);
  return s + suffix;
}
const ABBREVIATIONS = {
  filter: "Flt",
  cutoff: "Cut",
  resonance: "Res",
  envelope: "Env",
  env: "Env",
  attack: "Atk",
  decay: "Dcy",
  sustain: "Sus",
  release: "Rel",
  level: "Lvl",
  volume: "Vol",
  velocity: "Vel",
  frequency: "Freq",
  amount: "Amt",
  layer: "Lyr",
  sample: "Smp",
  semitone: "Semi",
  semitones: "Semi",
  parameter: "Param",
  program: "Prog",
  feedback: "Fbk",
  depth: "Dpt",
  rate: "Rate",
};
// Greedy word packing, shared by shortening and rendering. Long words split only
// after abbreviation/vowel reduction has had a chance to make them fit.
function packed(g, s, width) {
  const lines = [""];
  for (const word of s.split(/\s+/).filter(Boolean)) {
    if (g.textWidth(word) > width) return null;
    const i = lines.length - 1, next = lines[i] ? lines[i] + " " + word : word;
    if (g.textWidth(next) <= width) lines[i] = next;
    else lines.push(word);
  }
  return lines;
}
export function shortenName(g, name, width, maxLines = 1) {
  let words = ascii(name).trim().split(/\s+/);
  const fits = () => {
    const lines = packed(g, words.join(" "), width);
    return lines && lines.length <= maxLines;
  };
  if (fits()) return words.join(" ");
  for (let i = words.length - 1; i >= 0; i--) {
    words[i] = ABBREVIATIONS[words[i].toLowerCase()] || words[i];
    if (fits()) return words.join(" ");
  }
  // Last resort: remove internal vowels from only the longest word (rightmost tie).
  let longest = 0;
  words.forEach((w, i) => {
    if (w.length >= words[longest].length) longest = i;
  });
  words[longest] = words[longest][0] +
    words[longest].slice(1).replace(/[aeiou]/gi, "");
  if (fits()) return words.join(" ");
  return wrap(g, words.join(" "), width, maxLines).join("\n");
}
function text(g, s, x, y, w, align = "left", color = 1) {
  s = truncate(g, s, w);
  const dx = align === "center"
    ? Math.floor((w - g.textWidth(s)) / 2)
    : align === "right"
    ? w - g.textWidth(s)
    : 0;
  if (s) g.print(x + dx, y, s, color);
}
function large(g, s, x, y, w, h, fonts) {
  font(g);
  for (const f of fonts) {
    font(g, f);
    if (g.fontHeight() <= h && g.textWidth(ascii(s)) <= w) break;
  }
  if (g.fontHeight() > h) font(g);
  text(g, s, x, y + Math.floor((h - g.fontHeight()) / 2), w, "center");
}
function wrap(g, s, width, max = 2) {
  const lines = [];
  let rest = ascii(s).trim();
  while (rest && lines.length < max) {
    if (g.textWidth(rest) <= width) {
      lines.push(rest);
      break;
    }
    if (lines.length === max - 1) {
      lines.push(truncate(g, rest, width));
      break;
    }
    let n = rest.length;
    while (n > 0 && g.textWidth(rest.slice(0, n)) > width) n--;
    if (!n) break;
    const space = rest.lastIndexOf(" ", n);
    const end = space > 0 ? space : n;
    lines.push(rest.slice(0, end));
    rest = rest.slice(end).trimStart();
  }
  return lines;
}
export function stripGeometry(strip, width = 128) {
  if (!strip || !(strip.bars > 0)) return null;
  const bars = Math.max(1, Math.floor(strip.bars));
  const position = Math.max(0, Math.min(bars, Number(strip.position) || 0));
  const bar = Math.min(bars - 1, Math.floor(position));
  const count = Math.min(16, bars);
  const start = Math.min(Math.floor(bar / 16) * 16, bars - count);
  const available = width - (count - 1);
  const segments = Array.from({ length: count }, (_, i) => {
    const x = Math.floor(i * available / count) + i;
    const w = Math.floor((i + 1) * available / count) -
      Math.floor(i * available / count);
    return { x, w, current: start + i === bar };
  });
  const marker = Math.min(
    width - 1,
    Math.floor((position - start) / count * width),
  );
  return {
    segments,
    marker,
    start,
    count,
    moreLeft: start > 0,
    moreRight: start + count < bars,
  };
}
export function drawStrip(g, strip) {
  const geo = stripGeometry(strip);
  if (!geo) return;
  for (const s of geo.segments) {
    g.fillRect(s.x, s.current ? 60 : 62, s.w, s.current ? 3 : 1, 1);
  }
  g.drawLine(geo.marker, 59, geo.marker, 63, 1);
  const s = geo.segments.find((s) =>
    s.current && geo.marker >= s.x && geo.marker < s.x + s.w
  );
  if (s) g.drawLine(geo.marker, 60, geo.marker, 62, 0);
  if (geo.moreLeft) g.drawLine(0, 59, 0, 60, 1);
  if (geo.moreRight) g.drawLine(127, 59, 127, 60, 1);
}
/* Shared label / boxed value. The value gets the height budget first. */
export function drawSetting(g, { label, value }, options = {}) {
  const o = { ...DEFAULT_OPTIONS, ...options };
  const top = options.top ?? 4, bottom = options.bottom ?? 60;
  // Preserve the full label at the smallest face before considering two lines.
  for (const f of [...o.LABEL_FONTS, "default"]) {
    font(g, f);
    if (g.fontHeight() <= 12 && g.textWidth(ascii(label)) <= 124) break;
  }
  const lines = wrap(g, label, 124, 2), lineH = g.fontHeight() + 1;
  lines.forEach((line, i) => text(g, line, 2, top + i * lineH, 124, "center"));
  const boxY = top + lines.length * lineH + 2, boxH = bottom - boxY;
  g.drawRect(4, boxY, 120, boxH, 1);
  large(g, value, 7, boxY + 2, 114, boxH - 4, o.NAME_FONTS);
}
function qlinkNames(g, vm, o, bottom) {
  const list = o.REST_PLAY === "list";
  font(g, list ? "tamzen-9" : "default");
  const h = g.fontHeight(), rows = list ? 4 : 2, cellH = list ? h : h * 2 + 1;
  const gap = Math.floor((bottom - 11 - rows * cellH) / (rows + 1));
  const start = 10 + gap;
  if (list) g.drawLine(63, 10, 63, bottom - 2, 1);
  for (let k = 0; k < 8; k++) {
    const col = list
      ? (o.QLINK_LIST_ORDER === "rows" ? k % 2 : Math.floor(k / 4))
      : k % 4;
    const row = list
      ? (o.QLINK_LIST_ORDER === "rows" ? Math.floor(k / 2) : k % 4)
      : Math.floor(k / 4);
    const x = col * (list ? 64 : 32) + 1, y = start + row * (cellH + gap);
    const width = list ? 61 : 30, name = vm.qlinks?.[k]?.name;
    if (!name) {
      // Sparse single dash: the panel has only one bit, so dim means less ink.
      for (let dx = 0; dx < 5; dx += 2) {
        g.setPixel(x + dx, y + Math.floor(h / 2), 1);
      }
    } else {
      const label = shortenName(g, name, width, list ? 1 : 2);
      const lines = label.includes("\n")
        ? label.split("\n")
        : wrap(g, label, width, list ? 1 : 2);
      lines.forEach((line, i) => text(g, line, x, y + i * (h + 1), width));
    }
  }
}
function compactContext(vm) {
  if (vm.mode === 2) return (vm.context || "").replace(/^Banks? /, "");
  return (vm.context || "").replace(/ (InKey|Chrom)$/, "")
    .replace(/Major/g, "Maj").replace(/Minor/g, "Min");
}
function clipWindow(g, vm, bottom, o) {
  const tracks = vm.mode === 1 ? 4 : 8, scenes = vm.mode === 1 ? 8 : 4;
  const x = vm.originX || 0, y = vm.originY || 0;
  const height = Math.floor((bottom - 20) / 2);
  large(
    g,
    `Tracks ${x + 1}-${Math.min(x + tracks, vm.globalCols || x + tracks)}`,
    1,
    10,
    126,
    height,
    o.NAME_FONTS,
  );
  large(
    g,
    `Scenes ${y + 1}-${Math.min(y + scenes, vm.globalRows || y + scenes)}`,
    1,
    10 + height,
    126,
    height,
    o.NAME_FONTS,
  );
  font(g);
  text(
    g,
    `of ${vm.globalCols || 0} x ${vm.globalRows || 0}`,
    1,
    bottom - 8,
    126,
    "center",
  );
}
function minimap(g, vm, bottom) {
  // At least 2x2 per cell. Cap at 60 tracks x 16 scenes; pan this overview
  // to contain the aperture. Outside-window occupancy is unknown, not empty.
  const cols = Math.max(1, vm.globalCols || 8),
    rows = Math.max(1, vm.globalRows || 4);
  const nc = Math.min(60, cols), nr = Math.min(16, rows);
  const tw = vm.mode === 1 ? 4 : 8, sh = vm.mode === 1 ? 8 : 4;
  const ox = Math.max(0, Math.min(cols - nc, vm.originX || 0));
  const oy = Math.max(0, Math.min(rows - nr, vm.originY || 0));
  const cw = Math.max(2, Math.min(8, Math.floor(120 / nc)));
  const ch = Math.max(2, Math.min(7, Math.floor((bottom - 29) / nr)));
  const x = Math.floor((128 - nc * cw) / 2), y = 10;
  g.drawRect(x, y, nc * cw, nr * ch, 1);
  for (let p = 0; p < 32; p++) {
    const e = vm.pads?.[p];
    if (!e || !(e.r || e.g || e.b) || (e.anim >= 2 && !vm.pulseOn)) continue;
    const row = Math.floor(p / 8), col = p % 8;
    const cx = (vm.originX || 0) + (vm.mode === 1 ? 3 - row : col) - ox;
    const cy = (vm.originY || 0) + (vm.mode === 1 ? col : 3 - row) - oy;
    if (cx >= 0 && cx < nc && cy >= 0 && cy < nr) {
      g.fillRect(
        x + cx * cw,
        y + cy * ch,
        Math.max(1, cw - 1),
        Math.max(1, ch - 1),
        1,
      );
    }
  }
  const wx = Math.max(0, (vm.originX || 0) - ox),
    wy = Math.max(0, (vm.originY || 0) - oy);
  g.drawRect(
    x + wx * cw,
    y + wy * ch,
    Math.min(tw, nc - wx) * cw,
    Math.min(sh, nr - wy) * ch,
    1,
  );
  font(g);
  text(g, vm.trackName, 2, y + nr * ch + 2, 124, "center");
  const dimensions = `${cols}x${rows}${
    cols > nc || rows > nr ? " (cropped)" : ""
  }`;
  text(g, dimensions, 2, bottom - 7, 124, "right");
}
export function drawMenu(g, { title, items, selected = 0 }, style = "move") {
  g.clear();
  font(g);
  text(g, title, 2, 0, 124);
  if (!items.length) return;
  selected = Math.max(0, Math.min(items.length - 1, selected));
  const count = style === "list" ? 5 : 3;
  const first = Math.max(
    0,
    Math.min(items.length - count, selected - Math.floor(count / 2)),
  );
  for (let i = first; i < Math.min(items.length, first + count); i++) {
    const y = 10 + (i - first) * (style === "list" ? 10 : 18),
      active = i === selected;
    font(g, style === "list" ? "default" : "tamzen-16");
    if (g.fontHeight() > (style === "list" ? 9 : 17)) font(g);
    if (style === "list" && active) g.fillRect(0, y - 1, 128, 10, 1);
    if (style !== "list" && active) g.drawLine(2, y + 7, 7, y + 7, 1);
    const value = ascii(items[i].value),
      vw = value ? Math.min(48, g.textWidth(value)) : 0;
    text(
      g,
      items[i].label,
      10,
      y,
      116 - (vw ? vw + 4 : 0),
      "left",
      style === "list" && active ? 0 : 1,
    );
    if (value) {
      text(
        g,
        value,
        126 - vw,
        y,
        vw,
        "right",
        style === "list" && active ? 0 : 1,
      );
    }
  }
}
export function drawScreen(g, vm, options = {}) {
  const o = { ...DEFAULT_OPTIONS, ...options };
  g.clear();
  font(g);
  if (vm.conn && vm.conn !== "connected") {
    if (vm.conn === "version") {
      const lines = wrap(g, vm.connNote, 124, 3);
      lines.forEach((l, i) => text(g, l, 2, 20 + i * 9, 124, "center"));
    } else {
      large(
        g,
        vm.conn === "connecting" ? "MPC..." : "No MPC",
        2,
        10,
        124,
        30,
        o.NAME_FONTS,
      );
      if (vm.conn === "nompc") {
        font(g, o.HINT_FONT);
        wrap(g, "check cable, restart MPC", 124).forEach((l, i) =>
          text(g, l, 2, 43 + i * (g.fontHeight() + 2), 124, "center")
        );
      }
    }
    return;
  }
  const bottom = vm.strip ? 58 : 64;
  if (vm.error || vm.flash) {
    if (vm.error) {
      font(g);
      const lines = wrap(g, vm.error, 124);
      lines.forEach((l, i) =>
        text(
          g,
          l,
          2,
          Math.floor((bottom - lines.length * 9) / 2) + i * 9,
          124,
          "center",
        )
      );
    } else large(g, vm.flash, 2, 8, 124, bottom - 16, o.NAME_FONTS);
  } else if (vm.pageList && vm.touched < 0 && !vm.shift && !vm.jogTouched) {
    text(g, vm.trackName || "Q-Links", 2, 0, 110);
    qlinkNames(g, vm, {...o, REST_PLAY:"list"}, bottom);
  } else if (vm.shift) {
    // Two wall-clock pages keep the Shift legend and context details reachable.
    const legend = vm.legendPage
      ? [
        vm.modeName,
        vm.context,
        vm.subtitle,
        vm.noteDetail,
        `${QLINK_PAGE_LABELS[vm.qlinkPage]}  ${vm.globalCols || 0}x${
          vm.globalRows || 0
        }`,
      ]
      : [
        "SHIFT + STEP",
        "2 Setup 5 Tempo",
        "6 Metro 8 16 Levels",
        "9 Keys 10 Full Level",
        "16 Quantise",
        "Mode: clip layout",
      ];
    legend.filter(Boolean).forEach((l, i) => text(g, l, 2, i * 9, 124));
  } else if (vm.touched >= 0) {
    const k = vm.touched;
    const footer = o.REST_PLAY === "list" || o.REST_PLAY === "wrap";
    if (!footer) text(g, "Q-Link " + (qlinkIndex(vm.qlinkPage, k) + 1), 2, 0, 124);
    drawSetting(g, {
      label: vm.qlinks?.[k]?.name || "...",
      value: vm.qlinks?.[k]?.value || "-",
    }, {
      ...o,
      top: footer ? 2 : 10,
      bottom: footer ? bottom - 11 : bottom - 2,
    });
    if (footer) {
      font(g);
      text(
        g,
        `Q-Link ${qlinkIndex(vm.qlinkPage, k) + 1} of 16`,
        2,
        bottom - 8,
        124,
        "center",
      );
    }
  } else if (vm.jogTouched) {
    if (vm.trackList) {
      for (let i = 0; i < 3; i++) {
        const y = 9 + i * 16;
        if (i === 1) g.fillRect(0, y, 128, 16, 1);
        font(g, "tamzen-14");
        text(
          g,
          vm.trackList[i] || "",
          3,
          y + 1,
          122,
          "center",
          i === 1 ? 0 : 1,
        );
      }
    } else large(g, vm.trackName, 2, 9, 124, bottom - 12, o.NAME_FONTS);
  } else {
    const clip = vm.mode === 0 || vm.mode === 1;
    const labels = !clip && ["list", "wrap"].includes(o.REST_PLAY);
    if (labels) {
      const context = truncate(g, compactContext(vm), 52),
        cw = g.textWidth(context);
      text(g, vm.trackName || "Untitled", 1, 0, 95 - cw - 4);
      text(g, context, 96 - cw, 0, cw, "right");
    } else {
      text(
        g,
        clip && o.REST_CLIP === "window" ? vm.trackName : vm.context,
        2,
        0,
        vm.qlinkPages === 2 ? 110 : 96,
      );
    }
    for (let page = 0; page < NUM_QLINK_PAGES; page++) {
      if (vm.qlinkPages && page >= vm.qlinkPages) break;
      const x = (vm.qlinkPages === 2 ? 114 : 100) + page * 7;
      g.drawRect(x, 1, 6, 6, 1);
      if (page === vm.qlinkPage) g.fillRect(x + 1, 2, 4, 4, 1);
    }
    if (
      clip && o.REST_CLIP === "minimap" && vm.globalCols > 0 &&
      vm.globalRows > 0
    ) minimap(g, vm, bottom);
    else if (clip && o.REST_CLIP === "window") clipWindow(g, vm, bottom, o);
    else if (labels) qlinkNames(g, vm, o, bottom);
    else {
      // Main screen (Ryan, 2026-11-14): the track's name, one line saying
      // what it is, and in Main only three fixed boxes, filled when on.
      if (vm.footer) {
        // Step Seq (Ryan, 2026-11-14): the name centred, and one bottom line
        // above the bar strip: the lane left, the jog setting right.
        large(g, vm.trackName || "Untitled", 2, 9, 124, bottom - 20, o.NAME_FONTS);
        // Both in full when they fit; else the right one drops " Dial".
        const left = ascii(vm.footer.left || "");
        let right = ascii(vm.footer.right || "");
        const fits = () => g.textWidth(left) + g.textWidth(right) + (left ? 3 : 0) <= 126;
        font(g);
        if (!fits()) right = right.replace(/^Jog Dial:/, "Jog:");
        if (!fits()) font(g, o.HINT_FONT);
        const y = bottom - g.fontHeight() - 1, rw = Math.min(126, g.textWidth(right));
        text(g, right, 127 - rw, y, rw, "right");
        text(g, left, 1, y, 126 - rw - 3);
        drawStrip(g, vm.strip);
        font(g);
        return;
      }
      large(g, vm.trackName || "Untitled", 2, 9, 124, 22, o.NAME_FONTS);
      const detail = ascii(vm.subtitle || vm.noteDetail || "");
      font(g);
      for (const f of o.LABEL_FONTS) {
        font(g, f);
        if (g.textWidth(detail) <= 124) break;
      }
      text(g, detail, 2, 33, 124, "center");
      font(g);
      if (vm.marks) {
        let x = 2;
        for (const [label, on] of [["M", vm.marks.mute], ["S", vm.marks.solo]]) {
          const w = 11;   // little squares (Ryan); arm is on its own button
          if (on) {
            g.fillRect(x, 48, w, 11, 1);
            g.print(x + 3, 50, label, 0);
          } else {
            g.drawRect(x, 48, w, 11, 1);
            g.print(x + 3, 50, label, 1);
          }
          x += w + 3;
        }
      }
      // The clip window's tracks and scenes, bottom right on the row of the
      // M and S squares (Ryan, 2026-11-19).
      if (vm.window) {
        const s = ascii(vm.window), w = Math.min(96, g.textWidth(s));
        text(g, s, 126 - w, 50, w, "right");
      }
    }
  }
  drawStrip(g, vm.strip);
  font(g); // Leave the host's global font predictable.
}
