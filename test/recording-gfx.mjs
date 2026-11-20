// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ryan Gilmore
import assert from "node:assert/strict";
/* Deliberately conservative full-cell metrics; bounds include whitespace and
 * final advance, stricter than device ink extents. No reference clone needed. */
export function recordingGfx(failFonts = false) {
  let height = 7, advance = 6;
  const calls = [];
  function rect(x, y, w, h) {
    assert.ok(
      Number.isInteger(x) && Number.isInteger(y) && w > 0 && h > 0,
      `invalid geometry ${[x, y, w, h]}`,
    );
    assert.ok(
      x >= 0 && y >= 0 && x + w <= 128 && y + h <= 64,
      `out of panel ${[x, y, w, h]}`,
    );
  }
  const g = {
    calls,
    clear() {
      calls.length = 0;
    },
    setFont(name) {
      if (failFonts && name !== "default") return false;
      height = name === "default" ? 7 : Number(name.split("-")[1]);
      advance = height === 7
        ? 6
        : ({ 9: 6, 12: 7, 13: 8, 14: 8, 15: 9, 16: 9, 20: 11 }[height]);
      return true;
    },
    fontHeight: () => height,
    textWidth: (s) => s.length * advance,
    print(x, y, text, color) {
      rect(x, y, text.length * advance, height);
      calls.push({
        kind: "text",
        x,
        y,
        text,
        color,
        w: text.length * advance,
        h: height,
      });
    },
    setPixel(x, y, v) {
      rect(x, y, 1, 1);
      calls.push({ kind: "pixel", x, y, v });
    },
    drawRect(x, y, w, h, v) {
      rect(x, y, w, h);
      calls.push({ kind: "rect", x, y, w, h, v });
    },
    fillRect(x, y, w, h, v) {
      rect(x, y, w, h);
      calls.push({ kind: "fill", x, y, w, h, v });
    },
    drawLine(x, y, xx, yy, v) {
      rect(
        Math.min(x, xx),
        Math.min(y, yy),
        Math.abs(xx - x) + 1,
        Math.abs(yy - y) + 1,
      );
      calls.push({ kind: "line", x, y, xx, yy, v });
    },
  };
  return g;
}
