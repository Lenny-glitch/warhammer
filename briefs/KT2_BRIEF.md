# KT-2 Brief — Shoot, Fight, Health Arc & Firing Arc Projection

## Overview
KT-2 replaces the stubbed Shoot/Fight/Charge buttons with real
mechanics. The interaction model is drag-to-attack — same feel as
movement drag. Health is displayed as a Jet Force Gemini style
segmented arc around each token. Firing arc is projected during
movement so players see threat ranges before committing.

Four pieces, build in this order:
1. Jet Force Gemini health arc (token visual, needed before anything
   else so wound state is visible as soon as shooting resolves)
2. Drag-to-shoot (ranged attack resolution)
3. Drag-to-fight (melee resolution — different dice system)
4. Firing arc projection during movement drag

---

## Kill Team Combat Rules Summary (RAW — implement these exactly)

### Shooting sequence
1. Attacker selects one ranged weapon (one weapon per Shoot action)
2. Attacker rolls ATK dice (count = weapon's ATK stat)
   - Result ≥ weapon's HIT stat = normal success
   - Result of 6 = critical success (always, regardless of HIT stat)
   - Result of 1 = always a fail (always, regardless of HIT stat)
3. Defender rolls Defence dice (count = operative's DEF stat, usually 3)
   - Result ≥ operative's SAVE stat = normal save
   - Result of 6 = critical save
   - Cover option: before rolling, defender may convert ONE defence
     die to an automatic normal success (they do NOT roll that die)
     — this is a choice made BEFORE seeing attack dice results
4. Resolve hits vs saves:
   - Each NORMAL hit: cancelled by ONE normal save OR one critical save
   - Each CRITICAL hit: cancelled by TWO normal saves OR one critical save
   - Uncancelled normal hit → deals weapon's Normal DMG (first Dmg value)
   - Uncancelled critical hit → deals weapon's Critical DMG (second Dmg value)
5. Reduce target's wounds by total damage dealt
6. If wounds reach 0 → operative incapacitated, removed after action completes

### Valid shooting target
- Must be VISIBLE (LOS from attacker to target — reuse existing
  rayResult() logic from the 40k terrain system already in the codebase)
- Must NOT have a CONCEAL order (Conceal = untargetable by shooting)
- Must NOT have a friendly operative within its control range (1")
  — don't shoot into melee

### Cover
- Target is in cover if intervening terrain is between attacker and
  target within the target's control range (1") — same cover logic
  as existing LOS system, terrain tier chestHigh or tall counts
- Cover gives the defender the OPTION to convert one defence die to
  auto-success — it's their choice, not automatic

### Fight sequence (both sides roll, then alternate resolve)
1. Attacker selects melee weapon, rolls ATK dice
   - Same crit rules: ≥ HIT = normal success, 6 = critical, 1 = fail
2. Defender (the target operative) ALSO rolls their melee weapon's
   ATK dice as defence dice (they retaliate — this is NOT a save roll,
   it's their own attack)
   - Same crit rules apply to defence dice
3. Starting with attacker, ALTERNATE resolving one die at a time:
   - STRIKE: deal damage to opponent (normal die = Normal DMG,
     critical die = Critical DMG)
   - BLOCK: cancel one of opponent's unresolved dice (normal die
     blocks one normal opponent die; critical die blocks one normal
     OR one critical opponent die)
   - Player can choose strike or block for each of their dice
4. Continue alternating until all dice resolved
5. Apply all damage after resolution complete
6. Both operatives can be incapacitated in the same fight —
   resolve all dice first, then remove incapacitated operatives

### Valid fight target
- Must be within CONTROL RANGE (1") of attacker
- Cannot perform Fight while NOT within control range of any enemy

### Wounded / Injured states
- WOUNDED: current wounds < maxWounds (take any damage)
- INJURED: current wounds < maxWounds / 2 (below half starting wounds)
  Effect: Move stat -2", weapon HIT stat worsened by 1 (e.g. 3+ becomes 4+)
  The injured penalty applies to BOTH shooting and fighting while injured

---

## Part 1 — Jet Force Gemini Health Arc

### Visual design
Segmented curved arc around the outside of each token circle.
Sits between the token circle and any rings/indicators that already
exist (don't overlap the token face or existing UI elements).

- Arc spans roughly 270° (leaving a gap at the bottom so it reads
  as a health bar, not a full ring)
- Divided into segments equal to the operative's maxWounds
- Full health: all segments filled, color GREEN (#4a9a5a)
- As wounds are lost, segments empty from right to left (clockwise
  depletion)
- Color shift: above half wounds = green, at/below half wounds
  (Injured threshold) = RED (#c0392b) for all remaining segments
  — the color shift IS the Injured visual cue, no separate token needed
- Single-wound operatives (most Kill Team infantry): arc is just
  full green or completely empty (binary) — still draw it since
  the visual language needs to be consistent
- Arc radius: token radius + small gap (e.g. r + 0.15" in SVG units)
- Segment gap: small visual gap between segments so they read
  individually (e.g. 3° gap between each segment in a 270° arc)

### Implementation
SVG arc paths per segment, same coordinate system as the board.
Calculate segment start/end angles from segment index and total
count. A segment is "filled" if its index < current wounds count,
"empty" (transparent or very dark) otherwise.

### Where it renders
On the board for every operative at all times (all phases), not
just during combat. Wound state is always relevant.

### Single-wound edge case
maxWounds = 1: one segment covering the full 270° arc, green when
alive. Removed entirely when incapacitated (the token disappears).

---

## Part 2 — Drag-to-Shoot

### Interaction model
Replaces the stubbed Shoot button entirely.

During a Shoot action (player has selected Shoot from the action
buttons for the active operative):
1. The active operative's token shows a pulsing ring indicating
   "drag from here to shoot"
2. Player clicks and drags FROM the active operative's token
3. As they drag toward enemy operatives:
   - A line extends from the active operative to the drag position
   - Line color and style indicates validity:
     - GREEN solid line: valid target in range, visible, not Concealed
     - RED dashed line: target out of range, or Concealed, or LOS blocked
     - AMBER dashed line: target in cover (valid, but cover applies)
   - A range indicator shows distance in inches along the line
4. When hovering over a valid target operative, it highlights with
   an amber ring
5. Releasing on a valid target confirms the target selection
6. Releasing on an invalid target or empty space cancels

### Weapon selection
If the active operative has multiple ranged weapons, show a weapon
selector panel when Shoot is activated (before drag), so the player
picks which weapon first. The drag then uses that weapon's stats
(range, ATK, HIT, DMG).

### After target confirmed: resolution UI
Once target is confirmed, show a resolution panel (same area as
existing phase bar or a modal overlay):
- Shows: attacker weapon name, ATK dice count, HIT stat
- Shows: defender name, DEF stat (number of defence dice), SAVE stat
- Cover toggle: if target is in cover, show "Use Cover? Yes/No"
  button for the defender to choose BEFORE dice are rolled
- "Roll Dice" button triggers the actual resolution

### Dice resolution display
Show actual d6 results as pip dice (reuse the pip-die component
from the 40k sim — same component, same visual). Show:
- Attack dice pool (attacker's rolled dice) — group normal hits,
  critical hits, misses visually
- Defence dice pool (defender's rolled dice) — group normal saves,
  critical saves, fails
- Resolution: show which attack dice were blocked by which save dice
  (connecting lines or a side-by-side comparison)
- Final result: wounds dealt (normal + critical damage total)
- Damage is applied to the target operative's wounds in Firebase

### Conceal order blocking
If the attacker tries to drag toward a Concealed operative, the
line immediately shows red and the target shows "CONCEALED — cannot
be targeted" label. Releasing on it does nothing.

### AP cost
Shoot action costs 1AP. Deduct from the active operative's AP
counter when the action is confirmed (target selected), not when
dice resolve. If the operative has 0 AP remaining, the Shoot button
is not available.

---

## Part 3 — Drag-to-Fight

### Interaction model
Same drag pattern as Shoot, but only valid targets are operatives
within 1" (control range) of the active operative.

During a Fight action:
1. Active operative shows pulsing ring
2. Player drags FROM active operative
3. Valid targets (within 1") highlight with red ring (melee, not
   amber — visually distinct from shooting)
4. Targets outside 1" show as invalid
5. Releasing on valid target confirms the fight

### Fight resolution UI
Fight is more complex than shooting — both sides roll:

Show two dice pools side by side:
- LEFT: Attacker's melee dice (ATK dice rolled against HIT stat)
  Label each: "STRIKE (X dmg)" for normal, "CRIT STRIKE (X dmg)"
  for critical, "MISS" for fail
- RIGHT: Defender's melee dice (their melee weapon's ATK dice)
  Label each: "BLOCK" for success, "CRIT BLOCK" for critical,
  "MISS" for fail

Resolution is alternating — show this as a step-by-step sequence:
- Attacker clicks one of their dice to use it (Strike or Block)
- Defender clicks one of their dice to use it (Strike or Block)
- Continue until all dice are resolved
- Show running damage tally for both sides during resolution
- When all dice resolved, apply damage to both operatives

This alternating UI is the most complex part of KT-2. If it proves
too complex to implement cleanly in one pass, implement AUTO-RESOLVE
as a fallback: both sides' dice are resolved optimally by the AI
(attacker always strikes, defender always blocks crits first then
normal hits). Flag in DEVLOG if auto-resolve was used instead of
player-choice resolution.

### AP cost
Fight costs 1AP.

### Retaliation (defender fights back)
This is already baked into the fight sequence above — the defender
rolls their own ATK dice as their "defence". This is NOT a separate
action for the defender and does NOT cost them AP. It happens as
part of the attacker's Fight action.

---

## Part 4 — Firing Arc Projection During Movement

### What it does
While an operative is being dragged during a Move or Dash action,
project a shaded circle/arc showing weapon range from the
DESTINATION position (wherever the drag currently is, not the
origin). Updates live as the player drags.

### Visual
- Faint shaded circle radius = the operative's longest ranged weapon
  range (in inches)
- Circle is centered on the current drag position, not the token origin
- Color: very faint faction color (10-15% opacity fill) so it's
  informational without cluttering the board
- Enemy operatives that would be within the range circle highlight
  subtly (small indicator or slight glow) — "if you place here,
  you could shoot these"
- Operatives on Conceal order that are in range still show — the
  player can see where they are, just can't shoot them (Conceal
  is a tactical choice, not hidden information)

### When to show it
Only during an active Move or Dash drag. Disappears on mouseup.
Not shown during Charge drag (charge has its own 1" engagement
range target).

### Performance
This runs on every mousemove during a drag. Reuse the existing
LOS/range check logic — don't do full rayResult() checks on every
frame for every enemy, just do distance checks for the range circle.
Full LOS can be shown only on mouseup (when the player pauses)
if per-frame LOS is too expensive.

---

## Explicitly OUT of scope for KT-2
- Overwatch (reaction shooting when enemy moves)
- Cover save choice UI for the defender in FIGHT (only in Shoot)
- Weapon special rules (Balanced, Rending, Piercing, etc.) — stub
  these for now, basic attack/defence dice only
- Grimdark visual effects (blood splats, screen flash) — KT-3
- Pixel art tokens — KT-4
- Status token overlays — KT-5

## Done when
- Health arc renders on all operatives, updates correctly as
  wounds change, color shifts at Injured threshold
- Drag-to-shoot: player drags from active operative to valid target,
  sees range/LOS line, confirms target, weapon selector shown if
  multiple weapons, cover choice given to defender, dice resolve
  with pip display, wounds update in Firebase
- Concealed operatives cannot be targeted by shooting
- Drag-to-fight: player drags to operative within 1", both sides
  roll dice, alternating resolve OR auto-resolve if too complex,
  damage applies to both
- Injured state applies -2" Move and -1 HIT penalty correctly
- Firing arc projects from drag destination during Move/Dash

Report back: confirm whether Fight used player-choice or
auto-resolve, confirm the Injured penalty is actually applied
during attack resolution (not just stored as a flag), and show
one complete shoot resolution example (dice rolled, cover choice,
damage applied) from a real test game.
