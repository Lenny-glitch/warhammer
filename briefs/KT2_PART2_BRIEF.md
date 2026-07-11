# KT-2 Part 2 — Drag-to-Shoot Polish + Combat Feel
CLAIMED: 2026-07-11

## Orientation
Monorepo, killteam/. Claim before starting. Builds directly on
the now-closed bonus arc: BON-2b's resolver integration, KT-RS's
picker, and the unlimited-range fix (weaponRange(), null
sentinel) are all live — read killteam/DEVLOG.md's last three
entries before touching the shoot flow.

## Context
KT-2 Part 1 (health arc) shipped and was approved long ago with
"damage visibility could be louder" noted as polish. Part 2 was
always drag-to-shoot; it inherits the polish debts that have
accumulated against the combat presentation since.

## Scope
1. Drag-to-shoot: drag from an active operative onto a target to
   initiate the Shoot flow (weapon picker appears if multiple
   ranged weapons, as today). Keep the existing click flow —
   drag is an addition, not a replacement. LOS/validity feedback
   live during the drag (valid target highlights; invalid shows
   why: no LOS / engaged / concealed, reusing getShootValidity's
   existing reasons).
2. Damage visibility (Part 1's noted debt): lost wounds on the
   health arc need to read at a glance — louder lost-segment
   treatment, and a brief on-token damage flash/floater when
   wounds are applied so hits are SEEN, not just decremented.
3. Injured state: below half wounds must be categorically
   visible (distinct arc color/token treatment + the existing
   INJURED chip), not just a shorter arc.
4. Melee dice drama (parked item from Nox): the fight resolution
   currently lands instantly — restore/add a brief dice-roll
   moment so combat has beats. Small: a roll animation before
   results display, skippable by click. Same treatment for
   shooting if it's currently instant.
5. renderDicePool crit coloring was already fixed in BON-2b —
   verify it holds under drag-initiated shots too.

## Out of scope
Blast/torrent flag enforcement, conditions (BON-3), catch-up
banner (KT-7 era), any 40k work, roster changes.

## Done when
- A full activation done entirely by drag: drag-shoot a valid
  target, see live validity during drag, dice moment plays,
  damage flashes, arc updates loudly
- Injured threshold crossing is unmistakable in one glance
- Old click flow still works identically
- ?dev=true readout unaffected
- DEVLOG, hashes, Nox pushes; Nox click-tests as acceptance
