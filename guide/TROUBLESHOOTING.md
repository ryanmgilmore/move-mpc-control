# Troubleshooting

**The Move's display says "No MPC" and stays there.**
The MPC is not answering. In order:

1. Is the cable in a USB-A **host** port on the MPC, and in the Move's
   USB-C port?
2. Was the MPC restarted after the script was copied? Scripts are read
   once, at startup.
3. Are both files in `MPC Documents/Devices/abletonMoveSchwung/` on the MPC's
   internal storage, with their original names?
4. Was `abletonMoveSchwung.lua` edited or re-saved after it was built? The MPC
   ignores a script whose checksum does not match its `.ini`, without
   saying so. Copy the released files again
   ([mpc-control-script-move](https://github.com/ryanmgilmore/mpc-control-script-move#troubleshooting)).
5. Is the MPC on 3.10 or later?

**It connected, then went to "No MPC".**
The cable was disturbed or the MPC software restarted. It reconnects by
itself within a few seconds once the MPC is back.

**A line beginning with `!` appears at the bottom of the display.**
The MPC script asked the MPC for something and was refused. The rest keeps
working. Note the text after the `!` and report it.

**The display says the script is too new or too old.**
The two halves are different versions. Update both.

**Capture does nothing.**
Set the MPC preference *Record and Overdub Shift Behaviour* to
*Retrospective Record*.

**Notes mode is silent.**
With Multi Rec on, only armed tracks sound. Arm the track, or turn Multi
Rec off.

**The Move's lights or display look wrong or out of date.**
Press Back, then open the tool again: the MPC resends everything when the
tool reconnects.

**After changing the tool, the Move behaves as before.**
Restart the Move. Schwung keeps parts of a tool loaded until then.

**I need my Move back, now.**
Back parks the tool. If that fails: hold Shift, touch the volume knob and
click the wheel.
