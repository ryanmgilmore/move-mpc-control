# Display review on the Mac

From the repository root:

```sh
deno run --allow-read --allow-write --allow-env tools/preview/render.mjs
open tools/preview/out/index.html
```

No device connection, installation, Python, npm packages or network needed.
It reads Schwung's fonts from a Schwung checkout in `.schwung/`
(`git clone https://github.com/charlesvestal/schwung .schwung`); `SCHWUNG_REF` overrides that. The reference must have
`scripts/generate_font.py` and `fonts/tamzen/Tamzen*x*r.bdf`. Missing files
produce an error naming that directory. The reference is read only; no font
files or third-party source are copied into this repository.

The ignored `out/` directory contains the individual scenario PNGs at 4×,
a grouped HTML index with captions, and a numbered contact sheet at 2×. `scenarios.mjs` is
the shared scenario inventory used by the renderer and bounds tests. Rendering
replaces matching files and removes obsolete `knobs` scenario PNGs; it does
not remove unrelated files in `out/`. `key-screens.png` is a captioned,
three-column sheet at 4× with these 17 selections: list columns, list rows,
wrap, play name, knob touch, clip name, clip window, small 8×4 minimap, jog
list, flash, No MPC, Move menu, list menu, four-bar playing strip, both column assignment lists, and a mapped Q15 touch.
Realistic MPC names are previewed for list and wrap, both list orders, and
with/without the strip, including Filter Cutoff, Amp Env Attack, Layer 1 Level,
Send 1, Pad A05 Tune, Master Vol, Pan, LFO Rate and Filter Env Amount.

Scenarios cover:

- Pads and Notes, all three resting variants, short/very long track names, all
  eight assignments known or alternating unknown assignments.
- Knob touch in all four modes, all three play variants, short and long names/values.
- Matrix and Transposed, all three clip variants, small matrices (8×4 Matrix,
  8×8 Transposed), 16×32, bottom/right edges, capped 127×127, pulse on/off.
- All four Q-Link pages: numeric and column assignment lists, four page dots,
  page labels, and mapped knob touches in name/list/wrap variants.
- Jog touch with previous/current/next tracks and without a track list.
- Mode, bank, page, stop-all and refresh feedback; long error feedback;
  connecting, missing MPC and version mismatch.
- Strip absent or 1/4/16/32 bars; stopped/playing; start, fractional middle,
  near end and exact end; in list, wrap, name, window, minimap and clip-name views.
- Both menu styles at first/middle/last selection; short and long settings;
  both Shift overlay pages in all four modes.

## Fonts and layout choices

Play defaults to `list`: Tamzen 5×9 (`tamzen-9`), eight Q-Link names in two
64-pixel columns of four, with 1-pixel padding and a thin divider. Each label
has 61 usable pixels: about 12 characters (15 narrow `i`s), depending on glyph
width; the default 5×7 fallback guarantees 10 full-width characters. Set
`QLINK_LIST_ORDER` to `columns` (default: 1–4 left, 5–8 right) or `rows`
(1,2 / 3,4 / 5,6 / 7,8). `wrap` uses four columns and two knob rows with
up to two word-aware default-font lines per name, 30 pixels per line (about
five characters). Both use a small track-name header and compact context
(`A|B`, `C Maj`) before the page dots. Without a strip, row spacing expands.
`name` retains the large track name and footer.

Names are measured in the active font. Only when needed, known abbreviations
are applied right to left, stopping as soon as the text fits. Last resort:
remove internal vowels from just the longest word, then ASCII `...` truncation.
The exported `shortenName` helper also measures two-line word packing for wrap.

Clip defaults to `name`; `window` shows large Tracks/Scenes ranges with a small
`of 16 x 32` dimension line and the track name in the header. Transposed uses
four tracks and eight scenes. `minimap` remains an optional overview.

Default 5×7: context, detail/Shift overlays, subtitles, errors and compact menus.
Tamzen 20 → 16 → 14 → 12: track names, feedback and boxed values, selecting
the largest that fits both height and width, then ASCII `...` truncation at
12 if necessary. Touch labels try Tamzen 12 then default 5×7, preserving the
full name on one line when possible, then two lines if it exceeds panel width
at the smallest font. List/wrap touch views show only a small `Q-Link N of 16`
footer below the value box. Move menu: Tamzen 16. Jog list: Tamzen 14.
No-MPC hint: Tamzen 9 (default-font fallback may wrap to two lines).
`CFG.SCREEN` holds the device font ladders and resting/menu variant choices.
Each failed custom font request restores the default font and remeasures;
these layouts also work entirely in 5×7. The default font itself must exist.
The renderer restores the default global font after connected screens.

## Decisions where the specification leaves room

- A one-bit panel cannot show a grey unknown label: a sparse dotted dash
  denotes an unknown Q-Link. Page dots are 4×4 squares with filled centres.
- Plain ASCII three dots replace a Unicode ellipsis: deployed Tamzen contains
  ASCII only and native printing consumes bytes, not Unicode codepoints.
- Matrix overview cells have at least 2×2 pixels and at most 8×7. Draw at
  most 60 tracks × 16 scenes, panning the cropped overview to include the
  window; say `(cropped)` in its dimensions. This cap is necessary to retain
  the header and track label at the minimum cell size. No occupancy is
  invented outside the visible aperture. Only the visible pads have state.
- Pulse/blink clips alternate ink every 250 ms. The renderer receives the
  wall-clock phase; the gallery shows both phases. This is independent of
  the LED hardware pulse waveform and not synced to the MPC's tempo.
- The strip uses groups of up to 16 bars, shifting the last window back
  when needed to keep 16 bars visible. Exact loop end
  places the marker at the last pixel. Stopped strips retain their supplied
  position and use the same appearance. No transport status text is added.
- Subtitle remains in the rest-name/play footer when space permits; holding
  Shift also exposes it, the full mode name, page range, matrix dimensions,
  and Notes low note/channel. Shift alternates shortcut/detail pages every
  two wall-clock seconds. Long detail lines use the same bounded truncation
  as the old screen. Ordinary feedback temporarily
  replaces rest/touch screens; errors take precedence over local feedback.
- Jog touch sends JOG_TOUCH (note 9 edges); protocol v3 returns guarded track
  neighbours and sequence timing. The tool leaves jog click and master volume
  to the host escape. Setup, Tempo and Keys & Scales have live input bindings.

## What hardware can still differ

The preview reproduces `generate_font.py` BDF baseline/cell placement and
`js_display.c` alpha-based horizontal trimming, blank-glyph width, one-pixel
spacing and ink-only printing. It reads the reference's actual default 5×7
rows and Tamzen BDFs, without executing the generator. It uses integer
pixel primitives, inclusive line endpoints and nearest-neighbour scaling.
A different installed font atlas, generator or host revision can differ.
Device paths are `/data/UserData/schwung/host/font.png` and
`/data/UserData/schwung/host/fonts/tamzen-{size}.png` with adjacent `.png.dat`
files. Failed custom-font loads fall back; a missing default atlas cannot be
repaired by drawing code. OLED brightness, physical legibility, host clipping,
font-cache behaviour and actual on-device path availability need a later
bench review. Nothing in this task installs or probes them.

## Validation for this change

```text
deno test --allow-read test/
ok | 117 passed | 0 failed

cd mpc && lua test/run.lua
70 passed, 0 failed, 1531 checks

deno run --allow-read --allow-run=lua tools/e2e/run.mjs
e2e: 125 checks passed; 262 Move -> MPC messages, 248 MPC -> Move messages
```

The palette/reference cross-check passes and the font reference loads
successfully. All 460 gallery scenarios are also exercised with normal and
failed Tamzen loads in the bounds-recording tests. The MPC main chunk has
110 locals (guard threshold 150; Lua limit 200). No device validation was
performed.


## Control map v2 scenarios

`v2-default` exercises the name defaults in all four effective modes with the
sequence measure strip. `v2-page` shows the transient eight-name page list and
knob touch taking priority; `v2-jog` shows track neighbours. `v2-menu` and
`v2-setting` exercise Setup, Keys & Scales and Tempo, while `v2-feedback`
uses the live automation/clip-edit messages. Shift legends use only the
stock Move labels. The menu default is the compact list.


## Protocol v3 Q-Link pages

`qlink-pages` previews all four pages with assignment lists, page dots, the
page label and touches of the first/last knobs in each group of four. Column
page samples put Env 1 Attack/Decay/Sustain/Release on page 3 knobs 1–4.
The shared mapping is `src/lib/qlinks.mjs` in the Move module; the renderer
uses it to build the sample assignments. The key-screen sheet includes both
column lists and page 3 knob 1 labelled Q-Link 15.
