// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ryan Gilmore
// Reproduces the glyph placement of Schwung's font tools (MIT, Charles Vestal;
// THIRD_PARTY_NOTICES.md) and reads Schwung's own font files at run time.
/* Reproduce generate_font.py cell placement, then js_display.c's alpha
 * trimming, blank-cell advance, ink-only print and one-pixel charSpacing. */
export async function loadFonts() {
  const ref = Deno.env.get("SCHWUNG_REF") ||
    new URL("../../.schwung", import.meta.url).pathname;
  try {
    const source = await Deno.readTextFile(`${ref}/scripts/generate_font.py`);
    const fonts = {};
    const glyphs = {};
    const dict = source.slice(
      source.indexOf("FONT = {"),
      source.indexOf("\ndef parse_bdf"),
    );
    for (const m of dict.matchAll(/(['"])(.*?)\1:\s*\[([\s\S]*?)\]/g)) {
      const ch = m[2].replace(/\\(['"\\])/g, "$1");
      const rows = [...m[3].matchAll(/['"]([.#]{5})['"]/g)].map((m) =>
        [...m[1]].map((c) => c === "#" ? 1 : 0)
      );
      if (rows.length === 7) glyphs[ch] = rows;
    }
    // generate_deployment_png supplies a solid DEL glyph.
    glyphs[String.fromCharCode(127)] = Array.from(
      { length: 7 },
      () => Array(5).fill(1),
    );
    for (let cp = 32; cp < 127; cp++) {
      if (!glyphs[String.fromCharCode(cp)]) {
        throw new Error(`Default font parser missed ASCII ${cp}`);
      }
    }
    fonts.default = trimFont(5, 7, glyphs);
    for (
      const [w, h] of [[5, 9], [6, 12], [7, 13], [7, 14], [8, 15], [8, 16], [
        10,
        20,
      ]]
    ) {
      const bdf = await Deno.readTextFile(
        `${ref}/fonts/tamzen/Tamzen${w}x${h}r.bdf`,
      );
      const [, cw, ch, cx, cy] = bdf.match(
        /FONTBOUNDINGBOX (\d+) (\d+) (-?\d+) (-?\d+)/,
      ).map(Number);
      const glyphs = {};
      for (const block of bdf.split("STARTCHAR ").slice(1)) {
        const cp = Number(block.match(/ENCODING (\d+)/)?.[1]);
        if (cp < 32 || cp > 126) continue;
        const [, bw, bh, bx, by] = block.match(
          /BBX (\d+) (\d+) (-?\d+) (-?\d+)/,
        ).map(Number);
        const rows = block.split("BITMAP\n")[1].split("ENDCHAR")[0].trim()
          .split("\n");
        const cell = Array.from({ length: ch }, () => Array(cw).fill(0));
        rows.forEach((r, i) => {
          const y = ch + cy - by - bh + i, v = parseInt(r, 16);
          for (let j = 0; j < bw; j++) {
            const x = bx - cx + j;
            if (
              y >= 0 && y < ch && x >= 0 && x < cw &&
              (v & (1 << (r.length * 4 - 1 - j)))
            ) cell[y][x] = 1;
          }
        });
        glyphs[String.fromCharCode(cp)] = cell;
      }
      fonts[`tamzen-${h}`] = trimFont(cw, ch, glyphs);
    }
    return fonts;
  } catch (e) {
    throw new Error(
      `Cannot load Schwung font reference at ${ref}. Set SCHWUNG_REF to the reference clone (scripts/generate_font.py and fonts/tamzen required). ${e.message}`,
    );
  }
}
function trimFont(w, h, glyphs) {
  const result = {};
  for (const [c, rows] of Object.entries(glyphs)) {
    const xs = Array.from({ length: w }, (_, x) => x).filter((x) =>
      rows.some((row) => row[x])
    );
    const left = xs.length ? xs[0] : 0, right = xs.length ? xs.at(-1) : w - 1;
    result[c] = {
      rows: rows.map((r) => r.slice(left, right + 1)),
      width: right - left + 1,
    };
  }
  return { h, glyphs: result };
}
export function framebuffer(fonts, width = 128, height = 64) {
  const pixels = new Uint8Array(width * height);
  let font = fonts.default;
  const g = {
    pixels,
    width,
    height,
    clear: () => pixels.fill(0),
    setFont: (name) => {
      if (!fonts[name]) return false;
      font = fonts[name];
      return true;
    },
    fontHeight: () => font.h,
    textWidth: (s) =>
      [...s].reduce((n, c) => n + (font.glyphs[c]?.width || 0) + 1, 0),
    setPixel(x, y, v) {
      if (x >= 0 && y >= 0 && x < width && y < height) {
        pixels[y * width + x] = v ? 1 : 0;
      }
    },
    print(x, y, s, color = 1) {
      for (const c of s) {
        const glyph = font.glyphs[c];
        if (glyph) {
          glyph.rows.forEach((row, dy) =>
            row.forEach((v, dx) => {
              if (v) g.setPixel(x + dx, y + dy, color);
            })
          );
        }
        x += (glyph?.width || 0) + 1;
      }
    },
    fillRect(x, y, w, h, v) {
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) g.setPixel(x + dx, y + dy, v);
      }
    },
    drawRect(x, y, w, h, v) {
      g.drawLine(x, y, x + w - 1, y, v);
      g.drawLine(x, y + h - 1, x + w - 1, y + h - 1, v);
      g.drawLine(x, y, x, y + h - 1, v);
      g.drawLine(x + w - 1, y, x + w - 1, y + h - 1, v);
    },
    drawLine(x, y, xx, yy, v) {
      const dx = Math.abs(xx - x),
        sx = x < xx ? 1 : -1,
        dy = -Math.abs(yy - y),
        sy = y < yy ? 1 : -1;
      let err = dx + dy;
      while (true) {
        g.setPixel(x, y, v);
        if (x === xx && y === yy) break;
        const e = 2 * err;
        if (e > dy) {
          err += dy;
          x += sx;
        }
        if (e < dx) {
          err += dx;
          y += sy;
        }
      }
    },
  };
  return g;
}
/* Dependency-free PNG: grayscale, filter 0, zlib stored DEFLATE blocks. */
export function png(pixels, width, height, scale = 4) {
  const w = width * scale,
    h = height * scale,
    raw = new Uint8Array((w + 1) * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      raw[y * (w + 1) + 1 + x] =
        pixels[Math.floor(y / scale) * width + Math.floor(x / scale)] ? 255 : 0;
    }
  }
  const parts = [new Uint8Array([0x78, 0x01])];
  for (let i = 0; i < raw.length; i += 65535) {
    const n = Math.min(65535, raw.length - i);
    parts.push(
      new Uint8Array([
        i + n === raw.length ? 1 : 0,
        n & 255,
        n >> 8,
        (~n) & 255,
        ((~n) >> 8) & 255,
      ]),
      raw.slice(i, i + n),
    );
  }
  let a = 1, b = 0;
  for (const v of raw) {
    a = (a + v) % 65521;
    b = (b + a) % 65521;
  }
  parts.push(u32(((b << 16) | a) >>> 0));
  return concat([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", concat([u32(w), u32(h), new Uint8Array([8, 0, 0, 0, 0])])),
    chunk("IDAT", concat(parts)),
    chunk("IEND", new Uint8Array()),
  ]);
}
const u32 = (n) =>
  new Uint8Array([n >>> 24, n >>> 16 & 255, n >>> 8 & 255, n & 255]);
function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}
function chunk(type, data) {
  const body = concat([new TextEncoder().encode(type), data]);
  let crc = 0xffffffff;
  for (const v of body) {
    crc ^= v;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return concat([u32(data.length), body, u32((crc ^ 0xffffffff) >>> 0)]);
}
