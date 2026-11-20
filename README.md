# Move MPC Control

Use an **Ableton Move** as a pad controller, clip launcher, step sequencer, and
Q-Link surface for an **Akai MPC**, over one USB cable.

There are two halves, and you need both:

| Half | What it is | Where it goes |
|---|---|---|
| **MPC controller script** ([mpc-control-script-move](https://github.com/ryanmgilmore/mpc-control-script-move)) | **Ableton Move (Schwung)**: `abletonMoveSchwung.ini` + `.lua`, for the Lua controller scripting MPC 3.10 added | `MPC Documents/Devices/abletonMoveSchwung/` on the MPC's internal drive |
| **Schwung module** (this repository) | **Move MPC Control**, a Schwung tool (JavaScript only) | `modules/tools/move-mpc-control/` on the Move |

The MPC script does the work: it reads the MPC's clips, pads, Q-Links, and
transport, and acts on them. The Move module is the surface: it sends what
you press and draws what the MPC tells it. Neither half needs root access, a
plugin, or patched firmware on the MPC.

> **Status: early.** Developed and tested on an **MPC Live II** running
> **MPC 3.10.1**, with a Move on **Schwung 1.9.4**. It needs nothing beyond
> stock MPC 3.10.1: it has been run with no other add-ons in the MPC
> process. Other MPC models are untested. Controls are still changing. See [Known limitations](#known-limitations).

## Contents

- [What you need](#what-you-need)
- [Install](#install)
- [The two sides: clips and play](#the-two-sides-clips-and-play)
- [Controls](#controls)
- [The display](#the-display)
- [Setup menu](#setup-menu)
- [How it works](#how-it-works)
- [Known limitations](#known-limitations)
- [More help](#more-help)
- [About this project](#about-this-project)

## What you need

- An Akai MPC on **MPC 3.10.1 or later**. 3.10.0 has the scripting engine but
  is untested.
- An Ableton Move with **[Schwung](https://github.com/charlesvestal/schwung)**
  installed.
- A USB cable from the **Move's USB-C port** to a **USB-A host port on the
  MPC**.
- For the clip modes: an MPC project using the **clip workflow**. Without it
  the Move stays on the play side.
- For **Capture**: the MPC's Preferences, "Record and Overdub Shift
  Behaviour", set to **Retrospective Record**. Capture works by pressing the
  MPC's own Shift + Rec.

## Install

Two pieces, one for each device. This repository is the Move's.

### 1. The Move module (this repository)

Any one of these:

- **Schwung's Module Store** (once it is listed), on the Move or in Schwung
  Manager (`http://move.local:7700`): install **Move MPC Control**.
- **Schwung Manager, without the store:** on its Modules page, open
  **Install Custom Module** and either enter `ryanmgilmore/move-mpc-control`
  under *From GitHub URL*, or download `move-mpc-control-module.tar.gz` from
  this repository's [releases](https://github.com/ryanmgilmore/move-mpc-control/releases)
  and upload it under *From Tarball*.
- **By hand:** unpack that tarball into `/data/UserData/schwung/modules/tools/`
  on the Move (over SSH), then restart the Move.

Through Schwung (the store or Schwung Manager), the tool appears in the Tools
menu straight away, with no restart.

### 2. The MPC script: Ableton Move (Schwung)

The MPC needs its half from
**[ryanmgilmore/mpc-control-script-move](https://github.com/ryanmgilmore/mpc-control-script-move)**:
two files that go in `MPC Documents/Devices/abletonMoveSchwung/` on the
MPC's internal storage. On an MPC Live II, that means the MPC's **developer
mode** (3.10.1+), because its internal storage is not reachable from a
computer (and the MPC browser cannot copy the files itself):

1. Download the latest release of `mpc-control-script-move` and unzip it.
2. On the MPC, turn on developer mode under Preferences > Enhancements.
3. Find the MPC's IP address: Preferences > Wi-Fi, hold Shift, and press Info.
4. On a Mac or Linux computer on the same network, in the unzipped folder:
   `sh install.sh <the MPC's IP address>`, and let it restart the MPC. On
   **Windows**, two commands in PowerShell, or the free WinSCP app, do the same:
   see [the script's README](https://github.com/ryanmgilmore/mpc-control-script-move#on-windows).
5. Turn developer mode off again, or set an SSH password in the MPC's
   developer settings: by default, its SSH has no password.

The full steps, and what to do if the script does not load, are in that
repository's README.

### 3. Connect

1. Connect the Move's USB-C port to a USB-A port on the MPC.
2. On the Move, open **Move MPC Control** from Schwung's **Tools** menu.
3. Within a few seconds, the display shows the MPC's current track. If it says
   **No MPC**, the MPC script is not loaded: see
   [the script's troubleshooting](https://github.com/ryanmgilmore/mpc-control-script-move#troubleshooting).

The two halves check each other's protocol version when they connect. If
they do not match, the display says "MPC script too old" or "too new".

## The two sides: clips and play

The **Mode** button (the Move's Menu button) switches between two sides.

**The clip side** shows the MPC's clip matrix on the 32 pads, in two layouts.
**Shift + Mode** switches between them.

| Layout | The pads |
|---|---|
| **Matrix** | 8 tracks across, 4 scenes down, top row first, as the MPC draws it |
| **Transposed** | 4 tracks down, 8 clips across, as Move lays out its own clips |

The window can be moved around the matrix, and the MPC outlines it on its own
clip screen, labelled **Move**. Pads show each clip in its own color.
Playing clips pulse, queued clips blink, and recording clips are red.

**The play side** follows the MPC's current track:

| Track | The pads |
|---|---|
| **Drum** | **Pads**: two of the MPC's 4x4 pad banks side by side (A\|B, B\|C, ... G\|H), in the MPC's pad colours. Pads rest dim and light while played. Pressure is sent as aftertouch |
| **Keygroup, plugin, or MIDI** | **Notes**: an isomorphic keyboard in fourths, in key or chromatic |
| **Audio, submix, return, or output** | Dark: there is nothing to play |

Changing track with the jog wheel switches between Pads and Notes as needed.

## Controls

**Shift + a step button** runs the shortcut printed on or near it. While
Shift is held, the step lights and the glyphs under the steps show which
shortcuts are available.

### Everywhere

| Control | Does |
|---|---|
| **Play** | Play from the start / stop |
| **Shift + Play** | While playing: stop all clips. While stopped: continue from where it stopped |
| **Rec** | Overdub |
| **Shift + Rec** | Record |
| **Capture** | Retrospective record (see [What you need](#what-you-need)) |
| **Undo** / **Shift + Undo** | Undo / redo |
| **Loop** (hold) | Note Repeat while held |
| **Shift + Loop** | Latch Note Repeat on; press Loop again to release |
| **Sample** | Record-arm the current track |
| **Mute** | Track Mute, then Pad Mute on a drum track, then back to Main. In Track Mute, with the pads on banks A\|B, the left block is tracks 1-16 and the right block tracks 17-32 |
| **Shift + touch the volume knob** | Automation Read / Write |
| **Jog wheel** | Previous / next track |
| **Shift + jog** | Q-Link page: 1-8 or 9-16. When 4 pages are shown, the third and fourth pages have the Move knobs grouped to Q-Link columns (rather than rows). |
| **The eight knobs** | The MPC's Q-Links, on the current page |
| **Touch a knob** | Shows that Q-Link's parameter and value |
| **Back** | Closes a menu; outside Main, takes the MPC back to Main. When on Main, leaves the tool running in the background. Press twice to leave from anywhere |
| **Shift + Back** | Quits the tool |

### Shift + step shortcuts

| Step | Does |
|---|---|
| 1 | MPC Main |
| 2 | Setup menu |
| 3 | MPC Arrange |
| 5 | Tempo: the jog changes the BPM (hold Shift for 0.1 BPM steps) |
| 6 | Metronome on / off |
| 8 | Step Seq mode|
| 9 | Keys & Scales (Notes mode) |
| 10 | Full Level |
| 13 | 16 Levels |
| 14 | Duplicate the selected clip into the next empty slot below, and select the copy. If the original was playing, the copy is launched |
| 16 | Quantise, with the MPC's Timing Correct settings (see Setup, "Quantise") |

### Clip side

| Control | Does |
|---|---|
| **Pad** | Select and launch that clip |
| **Arrows** | Move the window by one. **Shift + arrows**: by a page. In Transposed, Left / Right move through clips and Up / Down through tracks |
| **Row buttons** | Matrix: launch that scene. Transposed: select that track; **Shift**: stop it. The current track's button is white |
| **Steps** | Matrix: odd steps select a track and even steps stop it (1-2 are the first track, through 15-16 for the eighth). Transposed: each odd step launches the scene in the pad column above it (step 1 the first, through step 15 the eighth), and step 16 stops all clips |
| **Copy** | Duplicate the selected clip into the next empty slot in its track |
| **Shift + Copy** | Duplicate the selected clip's scene |
| **Delete** | Delete the selected clip |

### Play side

While the MPC plays, the 16 steps show a beat clock on both kinds of track
(see Setup, "Clock style").

**Pads** (drum tracks):

| Control | Does |
|---|---|
| **Left / Right** | The pad-bank pair, from A\|B to G\|H |

**Notes** (keygroup, plugin, and MIDI tracks):

| Control | Does |
|---|---|
| **Up / Down** | Octave |
| **Left / Right** | Root note |
| **Shift + Left / Right** | Scale |
| **Shift + Up / Down** | MIDI channel, 1-15 |
| **Shift + Step 9** | Keys & Scales: root, scale, and In-Key or Chromatic layout |

Twelve scales: Major, Minor, Dorian, Mixolydian, Lydian, Phrygian, Locrian,
Harmonic Minor, Melodic Minor, Major and Minor Pentatonic, and Blues. In In-Key
layout only scale notes are on the pads. Root notes are blue, other scale
notes grey, and a played note green. Notes mode follows the Move set's own key
and scale when those change.

Notes mode is a **MIDI keyboard** to the MPC, where Pads mode presses the
MPC's own pads. With **Multi Rec** on, notes sound only on armed tracks, and
on all of them at once: arm the current track with **Sample**, or turn Multi
Rec off.

### Step Seq

**Shift + Step 8** puts the MPC in its Step Sequencer mode
and makes the Move's 16 steps its steps. Q-Links can turn on
steps and/or adjust their velocity.

| Control | Does |
|---|---|
| **Steps** | Turn that step on or off for the current lane. The playhead shows on the steps. Pressing a step in 1-8 or 9-16 also selects Q-Link page 1 or 2 |
| **Pad** | Pick the lane, from the MPC's current pad bank. Pads in other banks are dark |
| **Left / Right** | Previous / next bar |
| **Jog** | Bars, or Q-Link pages 1 and 2, by the StepSeqJog setting. **Shift + jog** switches the setting |
| **Q-Links** | Velocity for the associated step |
| **Back** | Back to the MPC's Main |

### 16 Levels and Full Level

**Shift + Step 13** opens the MPC's 16 Levels and **Shift + Step 10** toggles
Full Level. In 16 Levels, a pad held on the Move lights white.

## The display

- The **current track's name** and what the track is: its plugin preset, or
  its kind.
- **M** and **S** boxes for the track's mute and solo.
- The **view** on the top line: Matrix or Transposed, the pad banks in Pads
  mode, or the key and scale in Notes mode. On the clip side the window's
  tracks and scenes show bottom right, beside M and S (for example `T1-8 S1-4`).
- **Touch a knob** to see its Q-Link's parameter and value. A knob's light is
  white when its Q-Link is assigned, and red in automation Write.
- A **strip** showing the playing position in the sequence.
- In Step Seq: the lane, bottom left, and the StepSeqJog setting, bottom right (shown as "Jog Dial").
- Short messages from the MPC, such as "Clip duplicated".

## Setup menu

**Shift + Step 2.** Jog or Up / Down chooses a row, Left / Right or a jog
click changes it, and Mode or Play closes the menu. Settings are kept on the
Move.

| Setting | Does |
|---|---|
| **Clip layout** | Matrix or Transposed |
| **Clock style** | The beat clock on the steps: **Quarter** lights the four steps of the current beat, **Sixteenth** a single step |
| **Quantise** | **TC only** (default): Shift + Step 16 does what the MPC's Quantise does, which is nothing while Timing Correct is off. **Always**: Timing Correct is turned on for the press if it is off |
| **StepSeqJog** | In Step Seq: the jog changes bars or Q-Link pages |
| **Q-Link list** | Show all eight parameter names briefly when the Q-Link page changes |

Q-Link pages: **Q1-8**, **Q9-16**, **Col 1-2**, and **Col 3-4**. The last two
take the MPC's 4x4 Q-Links by column, so the eight knobs match two columns of
the MPC's knobs.

## How it works

The Move appears to the MPC as a USB MIDI device, the **Ableton Move
Standalone Port**. The MPC loads `abletonMoveSchwung.lua` for that port, as it loads
Akai's own scripts for their keyboards.

The two halves talk on **MIDI channel 16** only. Pads, knobs, and buttons go
to the MPC as notes and controllers, and the MPC sends colours, names, and
state back as short System Exclusive messages. Channels 1 to 15 are left
alone, so Notes mode plays the MPC like any MIDI keyboard.

The script uses only MPC 3.10's controller-scripting interface: the clip
matrix, pads, Q-Links, transport, tracks, and modes. It does not change the
project unless you ask it to, and removing its folder and restarting the MPC
removes it completely.

The module is a Schwung tool that takes over the Move's pads, buttons and
display while it is open. **Back** leaves it running in the background, so
the link to the MPC is picked up again when you reopen it.

## Known limitations

- **Tested only on an MPC Live II** on 3.10.1. Other models should work in
  principle, but their port names and storage paths are unverified.
- **Step Seq lanes come from the MPC's current pad bank only.** Changing bank
  inside Step Seq is not reliable yet, so pads outside the bank are dark.
- **In Pad Mute, a pad whose own colour is the MPC's mute orange can change
  late on the Move when muted while the MPC is playing**, by up to about half
  a second. With the transport stopped it changes at once, as other colours
  do.
- **Notes mode follows the MPC's MIDI input rules**, not the current track
  directly: with Multi Rec on, it plays whatever tracks are armed.
- **Not reachable from MPC 3.10.1's scripting**, so not offered:
  - doubling a clip's length;
  - the metronome's play mode;
  - the plugin's name on a plugin track;
  - pads brightening as they play in Main.

## Removing

On the MPC, `sh install.sh --remove <address>` from the script's release (or
delete `MPC Documents/Devices/abletonMoveSchwung`) and restart it. Remove
**Move MPC Control** from the Move with the Module Store, or delete
`modules/tools/move-mpc-control`.

## More help

- [guide/CONTROLS.md](guide/CONTROLS.md): every control, and what the lights mean.
- [guide/TROUBLESHOOTING.md](guide/TROUBLESHOOTING.md): when something does not work.

Tests: `deno test --allow-read --allow-env` (the palette check also wants a
Schwung checkout in `.schwung/`). Release tarball: `sh scripts/package.sh`.

## About this project

Move MPC Control and its MPC script are designed and tested by Ryan Gilmore, on the real hardware, and
written with AI assistance. The design and the way it feels to use are his
decisions; every feature is tried by a person on an MPC and a Move before it
is called done.

It is not affiliated with or endorsed by Akai Professional, inMusic, or
Ableton. MPC, Q-Link, Ableton, and Move are trademarks of their owners.

## Licence

The code is licensed under the **GNU General Public License, version 3 or
later** (`LICENSE`). Copyright (C) 2026 Ryan Gilmore. The Move's LED palette
values come from Schwung (MIT); see `THIRD_PARTY_NOTICES.md`.
