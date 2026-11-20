// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ryan Gilmore
import {
  drawMenu,
  drawScreen,
  drawSetting,
} from "../../src/lib/screen.mjs";
import { framebuffer, loadFonts, png } from "./framebuffer.mjs";
import { keyScreens, scenarios } from "./scenarios.mjs";
const out = new URL("./out/", import.meta.url);
const fonts = await loadFonts(), cases = scenarios();
await Deno.mkdir(out, { recursive: true });
const columns = 6, tileW = 144, tileH = 83;
const sheet = framebuffer(
  fonts,
  columns * tileW,
  Math.ceil(cases.length / columns) * tileH,
);
// Remove only obsolete generated previews from the rejected layout.
for await (const file of Deno.readDir(out)) {
  if (/^(rest-play|knob-touch|strip)-knobs-.*\.png$/.test(file.name)) {
    await Deno.remove(new URL(file.name, out));
  }
}
const keys = keyScreens(cases), keyW = 160, keyH = 83;
const keySheet = framebuffer(
  fonts,
  3 * keyW,
  Math.ceil(keys.length / 3) * keyH,
);
const groups = new Map();
for (const [i, s] of cases.entries()) {
  const g = framebuffer(fonts);
  if (s.kind === "menu") drawMenu(g, s.vm, s.opts.style);
  else if (s.kind === "setting") {
    g.clear();
    drawSetting(g, s.vm);
  } else drawScreen(g, s.vm, s.opts);
  const keyIndex = keys.findIndex((k) =>
    k.group === s.group && k.name === s.name
  );
  if (keyIndex >= 0) {
    const kx = keyIndex % 3 * keyW + 16,
      ky = Math.floor(keyIndex / 3) * keyH + 3;
    for (let dy = 0; dy < 64; dy++) {
      for (let dx = 0; dx < 128; dx++) {
        keySheet.setPixel(kx + dx, ky + dy, g.pixels[dy * 128 + dx]);
      }
    }
    keySheet.setFont("default");
    keySheet.print(keyIndex % 3 * keyW + 3, ky + 67, keys[keyIndex].caption, 1);
  }
  const filename = `${s.group}-${s.name}.png`;
  await Deno.writeFile(new URL(filename, out), png(g.pixels, 128, 64));
  const x = i % columns * tileW + 8, y = Math.floor(i / columns) * tileH + 4;
  for (let dy = 0; dy < 64; dy++) {
    for (let dx = 0; dx < 128; dx++) {
      sheet.setPixel(x + dx, y + dy, g.pixels[dy * 128 + dx]);
    }
  }
  sheet.setFont("default");
  sheet.print(x, y + 67, `${i + 1} ${s.group}`, 1);
  if (!groups.has(s.group)) groups.set(s.group, []);
  groups.get(s.group).push(
    `<figure><img src="${filename}" alt="${s.name}"><figcaption>${
      i + 1
    }. ${s.name}</figcaption></figure>`,
  );
}
await Deno.writeFile(
  new URL("contact-sheet.png", out),
  png(sheet.pixels, sheet.width, sheet.height, 2),
);
await Deno.writeFile(
  new URL("key-screens.png", out),
  png(keySheet.pixels, keySheet.width, keySheet.height, 4),
);
await Deno.writeTextFile(
  new URL("index.html", out),
  `<!doctype html><meta charset="utf-8"><title>Move MPC Control screen preview</title><style>body{background:#242424;color:#eee;font:14px system-ui;margin:24px}section{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0;width:512px}img{image-rendering:pixelated;width:512px;height:256px}figcaption{padding:8px 0 20px}a{color:#aee}</style><h1>Move MPC Control · 128 × 64</h1><p>${cases.length} scenarios · <a href="contact-sheet.png">Contact sheet</a> · <a href="key-screens.png">Key screens</a> · Black/white pixels at 4×. Strip and track list use sample data.</p>${
    [...groups].map(([group, figures]) =>
      `<h2>${group}</h2><section>${figures.join("")}</section>`
    ).join("")
  }`,
);
console.log(
  `Rendered ${cases.length} scenarios to ${out.pathname} (index.html + contact-sheet.png + key-screens.png).`,
);
