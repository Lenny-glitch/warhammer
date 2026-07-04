# Phase 16 Brief — Bug Fixes (Post-Playtest)

## Context
These bugs were confirmed in real cross-machine playtesting. Fix all
of them before any new features are added. Investigate each one
before patching — don't assume the cause, find it.

---

## Bug 1 — Single-model units flagged as out of coherency

### Symptom
Characters (Cadian Castellan, Commissar, Farseer) and vehicles
(Leman Russ, Chimera, Wraithlord) are showing red coherency
indicators even though coherency is a multi-model rule that doesn't
apply to single-model units at all.

### Fix
Before running any coherency check on a unit group, check whether
that group has more than 1 alive model. If modelCount === 1, skip
the coherency check entirely and never show a red/green coherency
indicator for that unit. Single-model units are always "in coherency"
by definition.

This applies to: coherency dots on tokens, coherency rings on the
board, the soft-block prompt on Confirm Movement, and anywhere else
coherency status is displayed or enforced.

---

## Bug 2 — Movement stat (M) not being used correctly

### Symptom
Units may not be moving their full Movement characteristic, or the
movement clamp isn't reading the M stat correctly from the loaded
gameData unit definition.

### Investigate first
- Find where the movement clamp value is currently set during a drag
- Confirm whether it's reading from gameData (the Firebase unit
  definition loaded from the roster) or from the old hardcoded
  UNIT_STATS fallback
- Check units with different M values (Guard M6", Eldar M7",
  Wraithlord M8") — do they actually get different movement ranges
  on the board?

### Fix
Movement clamp must read the M stat from the unit's gameData
definition, not a hardcoded fallback. If UNIT_STATS is still being
used as the source for movement, replace that lookup with the
gameData path for all roster-loaded units.

---

## Bug 3 — Attacks (A) attribute not included in fight resolution

### Symptom
Melee attacks may not be using the correct Attacks value from the
weapon profile. This would mean every model fights with 1 attack
regardless of their actual A stat (e.g. Sergeant's chainsword should
be A3, not A1).

### Investigate first
- Find where melee attack count is calculated in the fight resolution
  code
- Confirm whether it reads the A value from the weapon profile in
  gameData or falls back to a hardcoded 1
- Test specifically with the Sergeant model — it should contribute
  3 attacks in melee, visibly different from a regular Guardsman's 1

### Fix
Fight resolution must read Attacks from the weapon profile in
gameData, same as shooting already does. If there's a hardcoded
fallback anywhere in the melee path, replace it.

---

## Bug 4 — Dice log overflows and breaks screen layout

### Symptom
After 2-3 shots, the dice log panel grows long enough to push other
UI elements out of position or overflow its container, making the
game screen hard to use.

### Fix
- Give the dice log panel a fixed max-height with overflow-y: auto
  (scrollable, not layout-breaking)
- Most recent entry should be at the top (already the case per
  earlier implementation) so the player sees current results without
  scrolling
- The panel must not affect the height or position of the board,
  unit cards panel, or phase bar regardless of how many entries
  it contains
- Test with 5+ shots worth of entries to confirm layout stays stable

---

## Bug 5 — Multi-weapon units (vehicles and some infantry)

### Symptom
Units with multiple weapon profiles (e.g. Leman Russ Battle Tank has
a battle cannon + heavy bolters + potentially other weapons; some
infantry have both a ranged and melee weapon shown separately) are
either only firing one weapon or not correctly selecting which weapon
to use.

### The real rule (RAW simplified)
In a shooting activation, a unit selects ONE enemy unit to shoot at,
then ALL models in the unit shoot ALL of their eligible ranged weapons
at that target. So a Leman Russ fires its battle cannon AND its
sponson weapons in the same shooting action, all at the same target.

### Investigate first
- Check what weapons the Leman Russ and Chimera actually have in
  gameData (Firebase) — list all weapon profiles on those units
- Check how the current shooting resolution handles units with
  multiple ranged weapon entries — does it pick one, use all, or
  error?
- Check what "multi-weapon" looks like in the gameData schema
  (is it an array of weapon objects, or a single weapon field?)

### Fix
For shooting resolution:
- A unit with multiple ranged weapons fires ALL of them at the
  chosen target in one activation
- Each weapon profile resolves its own hit/wound/save chain
  separately (different S/AP/D values matter)
- Show each weapon's contribution separately in the dice log
  (e.g. "Battle Cannon: 1 hit, 1 wound, 1 unsaved" then
  "Heavy Bolter: 3 hits, 2 wounds, 1 unsaved") rather than
  lumping them together
- The shooting estimate should also show per-weapon breakdown

For the unit cards panel:
- Show all weapon profiles for a unit in the expanded card view,
  not just the first one

---

## Done when
- Single-model units never show coherency indicators (confirmed on
  Castellan, Commissar, Farseer, Leman Russ, Chimera, Wraithlord)
- Moving a Guardsman (M6"), Eldar model (M7"), and Wraithlord (M8")
  gives visibly different movement ranges on the board
- Sergeant contributes 3 melee attacks, regular Guardsmen contribute
  1 — confirmed in a real fight resolution
- Dice log can accumulate 10+ entries without affecting board or
  panel layout
- Leman Russ fires all its weapons at a target in one shooting
  activation, with per-weapon breakdown in the dice log

Report back: for Bug 5, list the actual weapon profiles found on
the Leman Russ and Chimera in gameData before describing the fix —
confirm what's actually there before assuming the schema shape.
