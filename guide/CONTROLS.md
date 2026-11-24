# Controls

**Shift + a step button** runs a shortcut. While Shift is held, the steps and
the glyphs under them light for the shortcuts that do something on the
current track.

The **Mode** button is the Move's Menu button. It switches between the
**clip side** (the MPC's clip matrix) and the **play side** (the current
track's pads or notes).

## Everywhere

| Control | Does |
|---|---|
| Mode | Clip side / play side |
| Shift + Mode | On the clip side: Matrix / Transposed (remembered) |
| Play | Play from the start / stop |
| Shift + Play | Playing: stop all clips. Stopped: continue from where it stopped |
| Rec | Overdub |
| Shift + Rec | Record (replaces) |
| Capture | Retrospective record: keeps what you just played |
| Undo / Shift + Undo | Undo / redo |
| Loop | Note Repeat while held |
| Shift + Loop | Latch Note Repeat on; plain Loop releases it |
| Sample | Record-arm the current track. Lit while armed |
| Mute | Track Mute, then Pad Mute on a drum track, then back to Main. Lit in Track Mute, bright in Pad Mute |
| Shift + touch the volume knob | Automation Read / Write. Release without clicking the jog |
| Jog wheel | Previous / next MPC track |
| Shift + jog | Q-Link page |
| Knobs 1-8 | The MPC's Q-Links on the current page |
| Touch a knob | Shows that Q-Link's parameter and value |
| Back | Closes a menu. Outside the MPC's Main (Step Seq, the mute modes, 16 Levels, Arrange), returns the MPC to Main. Otherwise parks the tool: it keeps running in the background and reconnects when reopened. A second Back within 1.5 s always parks |
| Shift + Back | Quits the tool |

Capture needs the MPC preference *Record and Overdub Shift Behaviour* set to
*Retrospective Record*. Choose the Note Repeat rate, and the 16 Levels type and
pad, on the MPC.

## Shift + step

| Step | Does |
|---|---|
| 1 | MPC Main |
| 2 | Setup menu (see below) |
| 3 | MPC Arrange |
| 5 | Tempo: the jog changes the BPM by 1, or by 0.1 with Shift held. Back or Shift + Step 5 closes it |
| 6 | Metronome on / off. Its step is green while on |
| 8 | MPC Step Seq on / off. Its step is green while on |
| 9 | Keys & Scales, for Notes mode |
| 10 | Full Level |
| 13 | 16 Levels |
| 14 | Duplicate the selected clip into the next empty slot below it, and select the copy. If the original was playing, the copy is launched |
| 16 | Quantise the track, with the MPC's Timing Correct settings. See Setup, "Quantise" |

Steps 4, 7, 11, 12 and 15 do nothing.

## Clip side

### Matrix and Transposed

| Layout | The 32 pads |
|---|---|
| Matrix | 8 tracks across, 4 scenes down; the top pad row is the first scene |
| Transposed | 4 tracks down, the top pad row first; 8 clips across |

The MPC outlines the Move's window on its own clip screen, labelled **Move**.
The top line names the layout, Matrix or Transposed, and the bottom right
names the window's tracks and scenes, for example `T1-8 S1-4`.

| Control | Does |
|---|---|
| Pad | Select and launch that clip |
| Pad twice, quickly | On an empty slot: make a new clip there, at the MPC's default clip length (as on the MPC's own clip matrix) |
| Left / Right / Up / Down | Move the window by one track or scene. In Transposed, Left / Right go through clips and Up / Down through tracks |
| Shift + arrows | Move the window by a whole page |
| Row buttons | Matrix: launch that scene. Transposed: select that track |
| Shift + row button | Transposed: stop that track's clips |
| Steps, Matrix | Two per track, in order: the odd step selects the track, the even step stops its clips. 8 tracks on all 16 steps |
| Steps, Transposed | Each odd step launches the scene in the pad column above it, lit in the scene's colour (step 1 the first scene, through step 15 the eighth). Even steps do nothing |
| Step 16 | Transposed: stop all clips (it is lit dim red) |
| Copy | Duplicate the selected clip into the next empty slot in its track |
| Shift + Copy | Duplicate the selected clip's scene: a new scene is inserted below it |
| Delete | Delete the selected clip |

An arrow lights only when the window can move that way.

### What the lights mean

| Light | Means |
|---|---|
| Dark | Empty slot |
| Dim white | The selected slot, empty |
| Dim, in the clip's colour | A stopped clip |
| Bright, in the clip's colour | The selected clip |
| Pulsing | Playing |
| Blinking | Queued to start or stop |
| Red, pulsing / blinking | Recording / queued to record |

Row buttons and steps use the same rules for scenes and tracks. The **current
track's** select button (its odd step in Matrix, its row button in Transposed)
is **white** instead of the track's colour, with the same animation.

## Play side

The play side follows the current track:

| Track | The pads |
|---|---|
| Drum | **Pads** |
| Keygroup, plugin, MIDI | **Notes** |
| Audio, submix, return, output | Dark, and they do nothing |

While the MPC plays, the 16 steps show a beat clock (Setup, "Clock style").

### Pads

The 32 pads are two of the MPC's 4x4 pad banks side by side, A|B to G|H. Pad 1
of each bank is at its bottom left, as on the MPC. The pads show the MPC's
pad colours, rest dim and light while held. Pressure is sent as aftertouch.

| Control | Does |
|---|---|
| Left / Right | The bank pair |

In Track Mute and Pad Mute the pads show the MPC's own mute lights, and a
muted pad is a steady dim orange. In Track Mute, with the pads on banks A|B,
the left block is tracks 1-16 and the right block tracks 17-32. In 16 Levels a pad held on the Move is
white.

### Notes

An isomorphic layout in fourths, like Move's own: each pad to the right is
the next note, and each row up is a fourth higher. The bottom-left pad is the
root.

- **In-Key:** only notes of the scale, three scale degrees a row.
- **Chromatic:** every semitone, five semitones a row.

Root notes are blue, other scale notes grey, notes outside the scale dark,
and a played note green. Notes go out on MIDI channels 1-15.

**Notes mode is a MIDI keyboard to the MPC**, unlike Pads mode, which presses
the MPC's own pads. So the MPC treats it as it treats any external keyboard:
with **Multi Rec** on, the notes sound only on armed tracks, and on every
armed track at once. Arm the current track with **Sample**, or turn Multi Rec
off, and the notes follow the current track.


| Control | Does |
|---|---|
| Up / Down | Octave |
| Left / Right | Bar for step entry, 1-8 (shown bottom right) |
| Shift + Left / Right | Root note |
| Shift + Up / Down | MIDI channel, 1-15 |
| Shift + Step 9 | Keys & Scales: root, scale, In-Key or Chromatic |

### Putting notes on steps

The 16 steps are the sixteenths of the bar shown bottom right. Notes go into
the MPC's selected clip (in the sequence workflow, the track's sequence).

| Control | Does |
|---|---|
| Hold a step, play pads | Put those notes on that step, one step long, at the velocity you played |
| Hold pads, then press a step | The same |
| Hold a step, turn the jog | Length, one step per click |
| Hold a step, press a later step | The note lasts to that step |
| Tap a step | Clear the notes put there from the Move |

Steps with notes from the Move light white, and the steps a long note covers
dim. Only notes put there from the Move this MPC session can be lengthened or
cleared from the Move, and notes changed on the MPC afterwards no longer
answer. Every note is its own MPC Undo. A note past the clip's end is written
but does not play: the Move cannot read a clip's length.

Scales: Major, Minor, Dorian, Mixolydian, Lydian, Phrygian, Locrian, Harmonic
Minor, Melodic Minor, Major Pentatonic, Minor Pentatonic, Blues. When the
Move set's key or scale changes, Notes mode follows it.

## Step Seq

**Shift + Step 8** puts the MPC in its Step Sequencer.
The pads stay drum pads and the 16 steps become the MPC's steps for the
current lane. Each step is lit in the MPC's colour for it, and the playhead
shows on the steps.

| Control | Does |
|---|---|
| Step | Turn that step on or off. A step in 1-8 also selects Q-Link page 1, and one in 9-16 page 2: the MPC's step parameters |
| Pad | Pick the lane. Only the MPC's current pad bank: other pads are dark |
| Left / Right | Previous / next bar |
| Jog | Bars, or Q-Link pages 1 and 2: the StepSeqJog setting (shown on the Step Seq screen as "Jog Dial") |
| Shift + jog | Switch the StepSeqJog setting |
| Back | MPC Main |

The display shows `Lane: A01` bottom left once a lane is picked, and the Jog
Dial setting bottom right.

### Velocity, ratchet, and probability

In Step Seq the knobs set one parameter for each step: knobs 1-8 for steps
1-8 on Q-Link page 1, and for steps 9-16 on page 2. **Which parameter is
chosen on the MPC's own Step Seq screen** (Velocity, Ratchet, Probability,
and others); the Move cannot change it. The top line of the Move's screen names
it, for example `Step Seq  Ratchet`, and touching a knob shows its step and
value.

- **Velocity:** how hard the step plays.
- **Ratchet:** the step plays several times in quick succession instead of
  once (OFF, or a count up to 8): rolls and stutters.
- **Probability:** how likely the step is to play each time round (100% always).

Ratchet and probability work on any drum kit, since the MPC itself edits the
step.

## Knobs

The eight knobs are the MPC's Q-Links, whatever the MPC's current Q-Link
mode assigns to them. There are four pages:

| Page | Knobs 1-8 are |
|---|---|
| Q1-8 | Q-Links 1-8 |
| Q9-16 | Q-Links 9-16 |
| Col 1-2 | The MPC's first two Q-Link columns, top to bottom |
| Col 3-4 | The last two columns |

Touch a knob to see its parameter and value. A knob's light is white when its
Q-Link has an assignment, and red while automation is in Write. A knob turned
during playback in Write records automation.

## Menus

Setup (Shift + Step 2) and Keys & Scales (Shift + Step 9):

| Control | Does |
|---|---|
| Jog, Up / Down | Choose a row |
| Left / Right, jog click | Change it |
| Mode, Play, Back | Close the menu |

### Setup

| Setting | Does |
|---|---|
| Clip layout | Matrix or Transposed |
| Clock style | Quarter: the four steps of the current beat light. Sixteenth: one step |
| Quantise | TC only (default): Shift + Step 16 does what the MPC's own Quantise does, which is nothing while Timing Correct is off. Always: Timing Correct is turned on for the press if it is off |
| StepSeqJog | In Step Seq, the jog changes bars or Q-Link pages |
| Q-Link list | Show all eight parameter names briefly when the page changes (off by default) |

Settings are kept on the Move, in the tool's own folder.
