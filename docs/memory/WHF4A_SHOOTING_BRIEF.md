# WHF-4a — Shooting (Basic, Direct-Fire)
# 2026-07-09. From Nox (planner). For Hades (Claude Code, WHF).
# CLAIMED: 2026-07-09
# Repo: ~/projects/warhammer, work in warhammer-fantasy/.
# Reference: docs/WHF_PROJECT_PLAN.md. This is 4a of a two-part
# phase — 4b (templates, shape/containment engine, scatter) is
# separate and comes after a checkpoint, not in this brief.

## First: add this to root CLAUDE.md's Standing Rules before starting
Build native to the project you're working in. Don't design a
general/shared version of something before it has one real, proven
implementation and a second concrete consumer that actually needs
it. This does not mean write throwaway code — keep interfaces
uncoupled from incidental project details wherever that costs
little, so promotion to shared/ later is a relocation, not a
rewrite (WHF-3's chargeReach is the model). The trigger for
promoting something to shared/ is a concrete second consumer with
an actual need, not "this seems generally useful." bonus-resolver.js
is the precedent: built for KT, proven live, promoted once WHF had
a real need for its condition machinery.

## Orientation
Claim this brief (add "CLAIMED: <date>" line, commit) before
starting. Verify-first: re-read whf.js's current state against
WHF-3's DEVLOG claims before building on top of it.

This brief exists specifically to close a debt from WHF-3: Stand
and Shoot is currently stubbed (selectable, logged, zero casualties).
Read WHF-3's DEVLOG entry in full before starting — it names the
exact interface constraint this brief has to satisfy.

## Scope — RAW (8th Edition, 8th.whfb.app)
Shooting phase, four steps per shooting unit: **Declare Targets →
Roll to Hit → Roll to Wound → Remove Casualties.**

1. **Declare Targets** — a unit that moved more than half its M this
   turn, or marched, cannot shoot (skirmishers are an exception —
   check RAW before assuming standard units get it too). Only the
   front rank fires unless the unit has Volley Fire or higher ground.
   Each model gets one shot regardless of its Attacks stat.
2. **Roll to Hit** — BS-based target number (read the exact chart
   and modifier list off 8th.whfb.app rather than assuming — long
   range and target-moved penalties both apply, and multiple-shot
   weapons interact with hit rolls in ways worth confirming against
   source, not memory).
3. **Roll to Wound** — Strength (weapon's, not the firer's stat) vs
   Toughness (target's) cross-reference chart. This is WHFB's
   classic S-vs-T grid, not 40k's simpler modern table — pull the
   actual chart values from source when you build this, don't
   reconstruct from a different edition's memory.
4. **Saves and Remove Casualties** — Armour save, modified by the
   weapon's Strength (S4 = -1, each point of S above that = another
   -1; a modifier that makes the save impossible auto-fails, doesn't
   error). Ward save, if any, is separate, unmodified by AP, rolled
   only after a failed armour save. Casualties removed from the rank
   closest to the firer.

## Resolver integration — reuse KT's BON-2 pattern
This is the actual design template: build `attackProfile`/
`defenseProfile` objects at the point of the roll (shooter's BS,
Strength, target's Toughness/armour/ward), run them through
`shared/bonus-resolver.js`'s `resolveStats`, then roll against the
resolved numbers — same shape as KT's `rollShot`. Don't hand-roll a
parallel stat-resolution path; this is exactly what the resolver is
for. Extend its stat vocabulary additively if WHF needs fields it
doesn't have yet (armour save value, ward save value) — never repurpose
an existing field.

## Closing the Stand and Shoot debt — the interface requirement
Per WHF-3's DEVLOG: whatever shooting resolver you build here must
be **directly callable from inside `chooseReaction()`'s
`standAndShoot` branch**, not just wired to a Shooting-phase UI
button. Casualties from Stand and Shoot have to land on the charging
unit *before* `chargeReach()`'s contact/failed-charge resolution
runs, so WHF-5's future rank-counting sees the correct survivor
count. Build the resolver as a clean function (inputs: shooting
unit, target unit, board state; outputs: casualties, updated unit
state) callable from either call site — Shooting's own UI, or
Charge's Stand and Shoot branch — not two implementations.

## What NOT to build in this brief (that's 4b, after a checkpoint)
- No template/blast weapons — stone throwers, cannons, Helstorm
  Rockets. Direct-fire units only (bowmen, handgunners, crossbows).
- No shape/containment engine, no scatter tool.
- No aura system — that's Psychology, much later.
If a unit type in the roster data needs a template to function
correctly (stone throwers are already in the Empire faction data
from Phase 1), skip it for now and note it in DEVLOG as a 4b
carryover rather than building a smaller version of blast handling
inline.

## Stat note — General/Captain now source-verified
Confirmed against BSData's `Empire - 8thBRB_8thAB.cat` (page 32):
- **General of the Empire:** M4 WS5 BS5 S4 T4 W3 I5 A3 Ld9
- **Captain of the Empire:** M4 WS5 BS5 S4 T4 W2 I5 A3 Ld8
Report back what's currently live in Firebase for these two units —
if they match, nothing to do; if they diverge, the correction goes
through `data-pipeline/parsers/patches.json`, same as the Phase 1
corrections, not a hand-edit to `gameData`.

## Done when
- Declare/hit/wound/save/casualty-removal cycle works for at least
  one direct-fire unit type per test faction (e.g. Handgunners,
  Peasant Bowmen).
- Shooting-after-move and marching restrictions enforced.
- Resolver profile pattern in place, matching KT's BON-2 shape.
- Stand and Shoot in WHF-3's charge flow now resolves real
  casualties via the same resolver function, confirmed by testing a
  charge where Stand and Shoot measurably reduces the charger before
  contact.
- DEVLOG entry: what was done, what carried to 4b, testing method
  used (flag if the libasound/Playwright gap is still blocking real-
  browser checks). Commits cited.
