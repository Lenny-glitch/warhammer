# KT-2 Part 3 Brief — Drag-to-Fight (Melee Resolution)

## Context
Kill Team melee is simultaneous — both sides roll their melee
weapon's ATK dice, then alternate resolving one die at a time
(Strike to deal damage, or Block to cancel an opponent die).
This is NOT like 40k where only the attacker rolls. Both
operatives contribute dice and both can take damage.

Per the KT-2 brief, auto-resolve was approved for this pass
(attacker always strikes, defender blocks crits first then
normals). Flag in DEVLOG. Player-choice alternating resolve
is deferred to KT-3.

---

## Rules (RAW — implement these exactly)

### Valid fight target
- Must be within CONTROL RANGE (1") of the active operative
- The active operative must have enough AP remaining (1AP)
- Fight can be performed regardless of Engage/Conceal order
  (unlike Shoot — Fight has no order restriction)

### Fight sequence
1. Both sides roll their equipped melee weapon's ATK dice
   - Result ≥ weapon's HIT stat = normal success
   - Result of 6 = critical success (always, regardless of HIT)
   - Result of 1 = always fail
   - INJURED penalty: if the operative is injured (wounds ≤ half
     maxWounds), worsen HIT by 1 (e.g. 3+ becomes 4+) for their
     dice roll
2. Auto-resolve (approved simplification):
   - Attacker: use all dice as Strikes (deal damage)
   - Defender: use critical dice to Block attacker criticals first,
     then normal dice to Block attacker normals, remainder Strike
3. Resolve attacker Strikes:
   - Each unblocked normal Strike: deal weapon's Normal DMG to
     defender
   - Each unblocked critical Strike: deal weapon's Critical DMG
     to defender
4. Resolve defender Strikes (the retaliation — defender fights back):
   - Each unblocked normal Strike: deal defender weapon's Normal
     DMG to attacker
   - Each unblocked critical Strike: deal defender weapon's
     Critical DMG to attacker
5. Apply all damage simultaneously after resolution
6. Update wounds in Firebase for both operatives
7. Check incapacitation: if either operative's wounds reach 0,
   mark as incapacitated

### Melee weapon stats
Each operative's melee weapon has: ATK, HIT, DMG (Normal/Critical)
These come from the operative's weapons array on their Firebase
instance (same source as ranged weapons, just type: 'melee').
If an operative has multiple melee weapons, show a weapon selector
before the fight (same pattern as ranged weapon selector in Part 2).

---

## Interaction model

### Drag-to-fight trigger
Fight action is available in the radial menu and action bar when:
- Operative has ≥1 AP remaining
- At least one enemy operative is within 1" (control range)
- (No order restriction — Fight works on Engage or Conceal)

When player selects Fight from the radial/action bar:
1. Highlight all enemy operatives within 1" with a RED ring
   (distinct from the amber ring used for shooting targets)
2. Player drags FROM active operative toward a valid target —
   same drag pattern as drag-to-shoot but with red drag line
3. Distance indicator shows during drag (confirm target is within
   1" — line should snap to "FIGHT" state when over a valid target)
4. Release on valid target confirms the fight

### If no valid targets within 1"
Fight button/radial item is greyed out with tooltip
"No enemies in control range (1")"

### Weapon selector
If the operative has multiple melee weapons, show a weapon
selector panel (same style as shooting weapon selector) before
the drag. Player picks which melee weapon to use.

### Resolution display
Show two dice pools side by side (different from shooting's
single attacker pool):

LEFT side — ATTACKER dice:
- Label: operative name + weapon name
- Show ATK dice as pip dice (reuse dieFaceSVG)
- Group: ⚔ STRIKE (crit) | ⚔ strike (normal) | ✗ miss

RIGHT side — DEFENDER dice (their retaliation):
- Label: defender name + their melee weapon name
- Show defender's ATK dice as pip dice
- Group: ⚔ STRIKE (crit) | ⚔ strike (normal) | ✗ miss

Resolution summary below both pools:
- "Attacker blocked X of Y dice by defender"
- "Attacker deals: X normal dmg + Y critical dmg = Z total to [defender]"
- "Defender deals: X normal dmg + Y critical dmg = Z total to [attacker]"
- Final wounds remaining for both operatives

### AP deduction
Deduct 1AP from active operative on fight confirmation (when
target is selected, before dice roll — same timing as Shoot).

### After fight resolves
- Write updated wounds to Firebase for BOTH operatives
- Check both for incapacitation (wounds ≤ 0)
- Mark incapacitated operatives in Firebase (alive: false or
  equivalent)
- The fight resolution is written to turn.lastFight (or appended
  to a fight log) so both players see the result — same pattern
  as turn.shotLog for shooting
- Retaliation does NOT cost the defender AP and does NOT count
  as the defender's Fight action — it's part of the attacker's
  Fight action resolution

---

## Visual during drag
- RED dashed line from active operative to drag position
  (distinguishes from shooting's green/red/amber lines)
- When hovering over a valid target (within 1"): target gets
  a pulsing RED ring, line goes solid red, label shows "FIGHT"
- When hovering over an out-of-range operative: red X label
  showing distance ("3.2" — out of control range")
- No LOS check needed (melee is point-blank by definition)

---

## Explicitly OUT of scope for Part 3
- Player-choice alternating resolve (auto-resolve only, flagged
  in DEVLOG)
- Charge action (movement part was stubbed in KT-1, linking
  charge to fight is KT-2 Part 4 scope or later)
- Weapon special rules (Balanced, Rending, Lethal, etc.) — stub
  these, basic ATK/HIT/DMG only
- Overwatch

## Done when
- Fight action activates when enemy is within 1", greyed out
  when no valid targets
- Drag shows red line, valid targets get red ring, releases to
  confirm
- Both sides' melee dice roll and display as pip dice in the
  resolution panel
- Auto-resolve correctly: attacker strikes with everything,
  defender blocks crits first then normals, remainder strikes
- Damage applies to BOTH operatives simultaneously
- Incapacitation fires correctly if either reaches 0 wounds
- Resolution is visible to both players via Firebase sync
- Retaliation does NOT cost the defender AP

Report back: show one complete fight resolution example (both
dice pools, auto-resolve breakdown, damage applied to both
sides), confirm retaliation damage is applying to the ATTACKER
not just the defender, and confirm the DEVLOG entry for
auto-resolve is updated.
