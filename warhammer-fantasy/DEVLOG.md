# Warhammer Fantasy — Development Log

> **For AI collaborators:** This is Hades' domain. Read this before touching anything. It captures decisions, architecture, and context that won't be obvious from the code alone.

---

## Project Overview

A Warhammer Fantasy (Warhammer Fantasy Battle / The Old World) companion app — scope TBD by the user. Owned by Lenny-glitch on GitHub.

**Sister projects:**
- `warhammer-fantasy/` ← this repo
- `age-of-sigmar/` ← Age of Sigmar companion (separate repo, same AI: Hades)
- `warhammer40k/` ← 40K simulator (separate AI team: nyx + nox)
- `killteam/` ← Kill Team variant
- `roster/` ← standalone roster builder

**AI team:** Hades handles both `warhammer-fantasy` and `age-of-sigmar`. Nyx and Nox handle the 40K-side repos.

---

## Stack

- **Frontend:** Vanilla JS, no framework. Single-page app (`index.html` + `whf.js` + `whf.css`; `whf.html` is a redirect stub as of WHF-5m/Phase 8 — see below).
- **Data:** Firebase Realtime Database, same project as 40K (`warhammer-5f2f4`). Plain HTTPS REST — no auth token needed while rules are open for dev.
- **Build/deploy:** `build.js` generates `firebase-config.js` from env vars at Netlify build time. `netlify.toml` wires it up.
- **Scale:** 1200×900px SVG board = 72"×48" (6'×4' standard). `INCHES_TO_PX = 1200/72 = 16.67px/inch`.

---

## Phase Log

### Phase 0 — Project Bootstrap (2026-06-27)

- Repo initialised. DEVLOG.md and CLAUDE.md created. Awaiting first feature brief.

---

### Phase 1 — WHF Roster Data Layer (2026-06-27)

**Commits:** `7355cb2` (data write + corrections patch)

Populated Firebase with 8th edition unit templates and roster schemas for two factions.

**Empire (10 units):** Halberdiers, Handgunners, Greatswords, Empire Knights, General of the Empire, Empire Captain, Battle Wizard, Cannon, Mortar, Hellblaster Volley Gun.

**Bretonnia (9 units):** Men-at-Arms, Peasant Bowmen, Knights of the Realm, Questing Knights, Grail Knights, Bretonnian Lord, Paladin, Damsel, Prophetess.

**Firebase paths:** `gameData/warhammer-fantasy/{factionId}/units/{unitId}` and `rosterSchemas/warhammer-fantasy/{factionId}`.

**Scripts:** `scripts/write-whf-units.js` (one-shot write, plain HTTPS PUT), `scripts/patch-whf-corrections-1.js` (stat corrections applied after Nox spot-check).

**Stat corrections applied:**
- Grail Knights: WS 6→5, I 6→5, A 3→2, Ld 10→8; Living Saints ability added; Lance Formation rank-of-3 errata applied to KotR, QK, GK
- Paladin: T 3→4, I 6→5, Ld 9→8
- Bretonnian Lord: WS 7→6, BS 4→3, S 5→4, I 7→6, Ld 10→9

**Source:** Primary stats from 8th.whfb.app Next.js data endpoint (`/_next/data/{buildId}/unit/{slug}.json`). Grail Knights, Paladin, Bretonnian Lord verified against this source. Character stats (General, Captain) are from training knowledge — flagged for future verification before character combat is implemented (unblocks at WHF-5).

**KotR Sv = 2+:** Army book default (full plate + shield). The 1+ achievable with barding + magic item upgrade is not the base profile. Roster system will handle equipment-modified saves when wired up.

---

### Phase 2 — WHF-1: Board & Regiment Engine (2026-06-27)

**Commits:** `1736e12`, `293e9f6`

**Files:** `whf.html`, `whf.js`, `whf.css`, `build.js`, `netlify.toml`

Static SVG battlefield with two hardcoded test regiments and full click-to-inspect stat panel.

**Core geometry (`modelPosition`):** 2D CW rotation in SVG space (Y-axis down). `unit.position` = front-left slot (row=0, col=0). `unit.facing` = degrees CW from north. All subsequent geometry (charge, flank detection, wheel) derives from this. Tested at 0°, 90°, and 45° — all 7 cases pass.

**Test units:**
- Empire Halberdiers: 20 models, rankWidth=5, facing=90° (east), position={x:460,y:376}
- Bretonnian KotR: 9 models, rankWidth=3, facing=270° (west), position={x:740,y:442}

**Rendering:** `<circle>` model tokens with `<polygon>` facing arrows and `<text>` labels in `<g class="unit">` groups. Champion marked with inner dot. Dead models at 28% opacity (ghost-in-place).

**WHF-1 interactions:** click unit → stat panel slides in from right; right-click model → toggle dead/alive; Escape or click background → deselect.

---

### Phase 3 — WHF-2: Movement Phase (2026-06-28)

**Commits:** `8a6fc5c`

**Files:** `whf.html`, `whf.js`, `whf.css` (extended)

Full 8th edition Movement Phase. Ghost preview pattern (preview before commit), three manoeuvre types, phase tracker chrome.

**Geometry added (all standalone, derive from `modelPosition`):**
- `facingVector(unit)` — SVG-space forward direction vector
- `frontCorners(unit)` — front-left and front-right model slot world positions
- `moveUnitForward(unit, inches)` — pure; returns new unit, no mutation
- `calculateNewPositionFromRightPivot(unit, rightPivot, newFacingDeg)` — algebraic inverse for wheel right-pivot constraint
- `wheelUnit(unit, pivotSide, angleDeltaDeg)` — pivots around one front corner; returns null if M exceeded
- `reassignModels(unit)` — rebuilds model row/col after rankWidth change (NOT rank collapse — that is WHF-5)
- `reformUnit(unit, newRankWidth)` — redresses in place, front-centre fixed, costs full M
- `violates1InchRule(movingUnit, allUnits)` — O(m×e) edge-to-edge check; threshold = inchesToPx(1) + 2×MODEL_R

**Movement state on units:** `movementUsed`, `backwardInches`, `hasReformed`, `hasMoved`, `phaseDone`

**Interaction:** two-step preview-then-commit. `moveGhost` lives outside state. Ghost renders at 40% opacity in `#ghost-layer`. Pivot diamonds in `#overlay-layer` during wheel-pick mode. Escape cancels ghost (context-aware). Arrow keys drive move/wheel. Enter commits.

**Rules implemented:** forward 1"/press, backward 0.5"/press (M/2 cap on total backward), wheel with M allowance tracking and pivot-fixed invariant, reform front-centre invariant, 1" rule check at commit time (ghost can phase through enemies during preview).

**Known RAW deviation:** `frontCorners()` uses model slot centres as pivot points. Arc distance underestimated by ~0.6" (one model radius) on the outer edge. Accepted simplification.

**Phase tracker:** [Movement] → [Magic] → [Shooting] → [Combat] → [End Turn]. Active phase highlighted in gold. End-phase-bar appears when all units have `phaseDone: true`.

---

## Current State (2026-06-28)

| Phase | Status |
|-------|--------|
| WHF-1: Board & Regiment Engine | Complete |
| WHF-2: Movement Phase | Complete |
| WHF-3: Charge | Complete (see Phase 4) — Stand and Shoot now resolves real casualties (Phase 6), contact geometry fixed (Phase 7) |
| WHF-4a: Shooting (basic, direct-fire) | Complete (see Phase 6) — checkpoint fixes in Phase 7; templates/blast/scatter/aura carry to 4b |
| WHF-4b: Shooting (templates, blast, scatter) | Not started |
| WHF-5: Combat (Close Combat + Rank Collapse) | Not started |
| WHF-5m: Movement Pass (overlap rule + movement UX) | Complete (see Phase 8) |

## Things The Next AI Should Know

- **`modelPosition()` is the load-bearing geometry function.** All movement, charge, and arc calculations derive from it. It is standalone at the top of `whf.js`. Do not embed it inside objects or render loops.
- **`reassignModels()` is NOT rank collapse.** It only fixes row/col slot indices after a `rankWidth` change. Dead models stay at their array index. Rank collapse (sliding alive models forward to fill gaps) is WHF-5.
- **`frontCorners()` is simplified.** Uses slot centres, not outer model edges. Arc distance is ~0.6" short on a 5-wide unit. Fix: add MODEL_R to radius in `wheelUnit()` if tighter fidelity is needed.
- **Shooting-after-reform restriction** is not enforced. Noted for WHF-4.
- **Character stats (General of the Empire, Empire Captain)** are from training knowledge, not verified against 8th.whfb.app. Unblocks at WHF-5 before character combat is implemented.
- **Firebase credentials** are in `firebase-config.js` (gitignored). Shape: same as `warhammer40k/firebase-config.js`.
- **Entry point is `index.html`, not `whf.html`** (WHF-5m, Phase 8). `whf.html` is now a redirect stub for old links — don't add real markup to it.
- **Friendly-overlap and enemy-1"-proximity are DIFFERENT thresholds, don't merge them.** `violatesFriendlyOverlap()` (2×MODEL_R, literal touching-is-fine-overlap-isn't) vs `violates1InchRule()` (2×MODEL_R + 1", a no-go buffer). Both are checked once, at ghost-commit, not per intermediate point of a move.
- **Undo (WHF-5m) is one level, phase-scoped, and voluntary-movement-only.** It reverts to a snapshot taken at Movement-phase start (`snapshotUnitsForMovement()`), not a per-action stack. Deliberately excluded: charged/fled units — a charge already resolved reactions/casualties/flees on OTHER units, so rewinding just the charger would strand those side effects.

---

### Phase 4 — WHF-3: Charge Sub-Phase (2026-07-09)

**Brief:** `docs/memory/WHF3_CHARGE_BRIEF.md`. Plan context:
`docs/memory/WHF_PROJECT_PLAN.md`.

**Files:** `whf.js`, `whf.html` (topbar subtitle only).

Full declare → react → [redirect] → roll cycle, sequential (one charging
unit at a time, matching the app's existing one-unit-acts-at-a-time
interaction model — nothing here is simultaneous multiplayer).

**Pivot-arc / reach geometry (the piece this brief pioneers, per the
project plan):** `chargeReach(charger, targetUnit, maxInches)` in `whf.js`.
Interface: takes a footprint (`position`/`facing`/`rankWidth`/`models` —
same shape WHF-1/2 already use) and a target footprint, returns
`{ reachable, inchesNeeded, finalFacing, contactPoint }`. Built from three
standalone pieces, all reusable independently:
- `unitFootprint(unit)` — oriented-rectangle approximation, world space.
- `nearestFootprintPoint(unit, fromPoint)` — nearest boundary point to an
  external point.
- `wheelArcInches(unit, angleDeltaDeg)` — per-degree wheel cost, factored
  out of `wheelUnit()` (WHF-2) so both call sites share one formula instead
  of duplicating it.

No WHF-only assumptions beyond what `modelPosition()`/`frontCorners()`
already encode (rank/file isn't baked into the math — `unitFootprint()`
only needs `.position`/`.facing`/`.rankWidth`/`.models.length`). Portable
to 40k vehicle turning later by swapping in a vehicle's own front-corner
footprint, as the project plan calls for.

**Known gap, written down on purpose — read this before building the
turn/activation sequencer:** WHF-2 built one flat `movement` phase, not
RAW's four Movement sub-phases (Start of Turn / **Charge** / Compulsory
Moves / Remaining Moves). This brief explicitly forbade building a real
sequencer, so Charge is just a 4th per-unit action button (Move / Wheel /
Reform / **Charge**) with the same "once per unit per phase" gating as the
others — nothing stops a player from moving other units first and
declaring a charge afterward, which RAW wouldn't allow (charges must all
be declared before any compulsory/remaining moves happen, so a defender
can't reposition knowing whether it's been charged yet). This is
unenforced by design here; the hint text nudges players to declare
charges first, but nothing blocks the RAW-illegal order. **This is the
exact test case the future turn/activation sequencer (WHF_PROJECT_PLAN.md
§1) needs to close** — when that infra piece gets built, "declare charge
after another unit's remaining move already happened" should be the
regression test that proves it actually gates sub-phases, not just
top-level phases.

**Stand and Shoot is stubbed — read this before building WHF-4's shooting
resolver:** no to-hit/to-wound/save math exists anywhere yet (that's
WHF-4). Choosing "Stand and Shoot" as a charge reaction is a real,
selectable choice — it locks in via `state.chargeReactions`, gets logged
in the charge flow, and blocks re-prompting if a second unit charges the
same target — but resolves zero casualties; the charge proceeds at the
charger's full strength. **Interface constraint for WHF-4, not just "hook
up later":** Stand and Shoot has to reduce the charging unit's models
(remove casualties) *before* `chargeReach()`'s contact/failed-charge
resolution runs and *before* WHF-5 counts ranks for combat res off the
survivors — meaning whatever shooting resolver WHF-4 builds needs to be
directly callable mid-charge-flow (from inside `chooseReaction()`'s
`standAndShoot` branch), not just invocable from its own Shooting-phase
UI. Build it as a function with a clean input/output contract from the
start, not something wired only to WHF-4's own phase button.

**Other scope decisions, made per the brief's "generic understandable
over RAW-exact" priority, not silently:**
- No line-of-sight check on charge declaration — no terrain/LoS model
  exists anywhere in the app, so there's nothing to raycast against.
  Charge legality is reach-only (`chargeReach(...).reachable` at the
  `M+12"` outer bound). Garrisoned-unit rules are skipped entirely for
  the same reason (no buildings exist).
- "There's Too Many of Them!" (one charger, up to 2 targets) is
  approximated: `rollChargeMove()` picks whichever declared target needs
  the *most* reach and treats satisfying it as satisfying all of them.
  Full simultaneous multi-body contact geometry (a single footprint
  touching two separate enemy footprints at once) was out of scope here.
- "Multiple chargers, one target" is honored via `state.chargeReactions`
  caching (a target that already reacted this phase skips the prompt for
  a second charger) — but because charges resolve sequentially rather
  than simultaneously, if the cached reaction was Flee, the second
  charger naturally falls into the "charging a fleeing enemy" auto-catch
  branch instead of re-triggering a flee. That's the correct downstream
  state to react to, not a bug — flagging it as a deliberate reading of
  "reaction applies to all of them" under this app's sequential model.
- "Charging a fleeing enemy" auto-catch: implemented — if
  `chargeReach(...).reachable` against the fleeing unit's *current*
  footprint at roll time, it's caught and destroyed; otherwise the
  charger just fails to catch it (normal failed-charge move).
- "Unlikely Flights" (boxed-in flee): not implemented as a distinct edge
  case. What *is* implemented: a flee move that would leave the board is
  destruction (RAW recalled from training knowledge, **not verified**
  against 8th.whfb.app — same caveat as the still-unverified character
  stats noted in Phase 1/WHF-1, unblocks whenever someone next checks the
  source). No table-edge/friendly-unit blocking geometry beyond that.
- Panic-on-flee-passthrough: implemented as a footprint-radius distance
  check (segment-to-point, `pointToSegmentDistance`) against friendly
  units' footprints, not precise polygon/segment intersection — same
  class of simplification WHF-2 already accepted for `frontCorners()`.
  One level only: a friendly that panics and also flees does not itself
  trigger a second round of Panic tests on units in *its* path.
- Redirect is only offered when exactly one target was declared and it
  fled (multi-target charges skip redirect — RAW's redirect assumes a
  single original target).

**Verified before building:** re-read `whf.js` in full against WHF-2's
DEVLOG claims. One thing worth re-flagging since it's adjacent: the
phase tracker (`whf.html`) still only has 5 top-level phases and no
sub-phase UI at all — confirmed via source, not assumed from the brief.

**Testing:** no headless-browser check was possible in this sandbox
(Playwright's Chromium needs `libasound.so.2`, not installed, and
`apt-get`/`sudo` aren't available to this session — a real system
limitation, not skipped). Instead, ran a jsdom-driven functional smoke
test (real DOM: actual `document.createElementNS` SVG nodes, actual
`addEventListener` wiring, actual CSS class toggling) exercising: declare
→ Hold → roll → contact, declare → Flee → Panic-test-fires-when-in-path →
redirect decline → roll, and multi-charger-one-target reaction caching.
Also caught and fixed two real bugs this way before commit: (1) a charged
unit could still re-enter Move/Wheel afterward (now gated off via
`hasCharged`, since a charge consumes the unit's whole move), and (2) a
fled unit never got marked `phaseDone`, which would have permanently
blocked the "End Movement Phase" button from appearing whenever a charge
caused a flee. The one-off test script was not committed.

**Not done / explicitly out of scope per the brief:** shape/containment
engine, scatter tool, aura system, turn/activation sequencer — all
correctly belong to later work per `WHF_PROJECT_PLAN.md`.

---

### Phase 5 — Firebase config set up (2026-07-09)

**Files:** `warhammer-fantasy/firebase-config.js` (gitignored, not committed),
`warhammer-fantasy/firebase-config.example.js` (committed template, matches
`killteam/`/`warhammer40k/`'s format — `var firebaseConfig = {...}`).

Nox supplied the real config (project `warhammer-5f2f4`, same Firebase
project as the 40k-side apps). Confirmed via `git check-ignore -v` that
`warhammer-fantasy/.gitignore` already listed `firebase-config.js` (it
did — that line predates this phase) before writing the real values, so
nothing had to change gitignore-wise, just the file needed creating.

This resolves the gap flagged in `docs/memory/WHF_STATUS_UPDATE.md` and
`WHF_PROJECT_PLAN.md` §0 ("flagged, not corrected"). **Root `CLAUDE.md`**
("Local setup" section) and **`PROJECT_STATE.md`** ("STANDING
ASSUMPTIONS") both still say warhammer-fantasy has no live Firebase
config — that's now stale. Both are Nox's planner-owned files (not
edited here, per the Hades/Nyx domain split in root `CLAUDE.md`) —
flagging for Nox to update on the next `PROJECT_STATE.md` regeneration.

No code in `whf.js`/`whf.html` reads Firebase yet — the app is still
fully local/hardcoded-test-unit (see WHF-1). This just makes the
connection *possible* for whenever a brief actually wires it up (e.g.
reading the Phase 1 unit templates live instead of the hardcoded
`initTestUnits()` stand-ins).

---

### Phase 6 — WHF-4a: Shooting, Basic Direct-Fire (2026-07-10)

**Brief:** `docs/memory/WHF4A_SHOOTING_BRIEF.md`. **Files:** `whf.js`,
`whf.html` (resolver `<script>` tag, topbar subtitle), `shared/bonus-resolver.js`
(v1.2.1 → v1.3.0, additive).

Declare → Roll to Hit → Roll to Wound → Saves/Remove Casualties for
direct-fire units, plus the resolver-shape integration this brief's own
title promised, plus closing WHF-3's Stand and Shoot debt.

**Verify-first caught the brief itself getting three things wrong** — checked
against 8th.whfb.app before building rather than trusting the brief's text
(per the standing rule; disk beats chat, but disk still needs checking
against source):
1. **Casualty removal direction.** Brief said "closest to the firer." RAW
   (`/shooting/remove-casualties-shooting`) says the opposite, explicitly:
   "Although casualties would normally fall amongst the front rank, for the
   purposes of game play we remove models from the rear rank of the unit."
   Single-rank units lose models from both ends evenly. Implemented per RAW,
   not the brief — `removeCasualties()` sorts by row descending (rear
   first), then by distance from centre column (flanks first within a rank,
   generalising the "both ends" rule to multi-column rear ranks).
2. **Rank-firing rule.** Brief said "front rank only unless Volley Fire."
   8th edition's actual default is **Fire in Two Ranks**
   (`/shooting/fire-in-two-ranks`) — not a special rule, the standard rule.
   Both ranks fire by default; implemented as `models.filter(alive && row<=1)`.
3. **Movement-and-shooting restriction.** Brief said "moved more than half M
   ⇒ can't shoot." Not a rule anywhere in 8th. Actual: **marching** (not
   partial movement) fully blocks shooting; any movement short of marching
   gives -1 to hit but the unit can still fire (`/shooting/moving-and-shooting`,
   `/movement/marching`). `/shooting/who-can-shoot` also named reformed,
   rallied, charged, fleeing, and in-combat as additional full blocks the
   brief didn't mention.

None of these are marching/rallying/close-combat cases — **that restriction
list is only partly reachable in this codebase.** Marching isn't
implemented as a movement action at all (WHF-2 only built single-speed
move/wheel/reform), rallying doesn't exist (no fled-unit recovery flow),
and close combat doesn't exist (WHF-5). Implemented what's reachable:
`shootingBlocked = hasReformed || hasCharged || fleeing` (all three ARE
real state), `shootingPenalty = hasMoved ? 1 : 0` for the -1. Marching/
rallying/in-combat restrictions are correctly-unenforceable carryovers, same
treatment WHF-3 gave LoS/garrisons — noted, not stubbed.

**RAW confirmed correct** (no brief changes needed): to-hit chart
(`7 - BS`), S-vs-T wound chart (`clamp(4 - (S-T), 2, 6)`), armour save
modified -1 per point of Strength from 4 up
(`/shooting/armour-save-modifiers`), ward saves never modified by Strength
and best-of-multiple not stacking (`/shooting/ward-saves`), natural 1 always
fails to-hit/to-wound/save. General of the Empire and Empire Captain stat
lines (flagged unverified since Phase 1) are now source-confirmed exactly
matching what was already live: M4 WS5 BS5 S4 T4 W3 I5 A3 Ld9 / ...W2...Ld8.
**Could not diff against live Firebase** — no local `firebase-config.js`
exists in this sandbox despite Phase 5 saying Nox supplied one; flagging as
blocked, not skipped, for whoever's next on a session with the real config.

**Deliberate simplification, not a miss:** RAW's "7+ to hit/wound/save" is a
chained reroll (roll a 6, then reroll against a second threshold —
`/shooting/7-to-hit`). Implemented as a flat auto-fail past 6 instead
(`rollAgainstTarget()`). Consistent with this project's "legible over
rules-exact" standing priority and the precedent WHF-3 set for edge cases
like "There's Too Many of Them" — noted here rather than silently applied.

**Resolver integration (KT BON-2 shape, per the brief's actual ask):**
`resolveShot()` builds `attackProfile`/`defenseProfile` baseStats objects
and runs them through `BonusResolver.resolveStats()` before rolling, same
call shape as KT's `rollShot`. WHF has no bonus catalog wired up yet (BON-1
reserved the schema; nothing populated it — see the BON-1 section below), so
the `activeBonuses` passed in are locally-built situational modifiers
(long range, moved-and-fired, standing-and-shooting — each a `+1 add` on the
`hit` stat) rather than a loaded Firebase catalog. Same effect shape either
way — wiring in a real catalog later is a data change at the call site, not
a resolver-call-site change. Extended `shared/bonus-resolver.js`'s
`ROLL_TARGET_STATS` additively: added `'wound'` and `'wardSave'`; reused the
existing `'hit'` and `'save'` stats as-is for WHF's to-hit target and
armour save (same roll-target semantics KT already uses them for — not a
repurpose). Bumped `BONUS_RESOLVER_VERSION` to 1.3.0. KT's own 24/24 test
suite still passes unchanged (`node shared/bonus-resolver.test.js`) — purely
additive, only other current consumer is `killteam/index.html`.

**Closing the Stand and Shoot debt (WHF-3's interface requirement):**
`chooseReaction()`'s `standAndShoot` branch now calls `resolveShot()`
directly — casualties land on the charging unit and are written back into
`state.units` before `rollChargeMove()` runs (which re-fetches the charger
fresh from `state.units`, so the reduced model count is picked up
automatically, no extra plumbing needed). Added the RAW gate the brief
didn't mention: Stand and Shoot is only legal if the reacting unit has a
ranged weapon AND the charge distance exceeds the charger's M
(`/movement/stand-and-shoot`) — the button is disabled otherwise. If the
reaction reduces the charger to zero models, the charge flow now shows a
"Charge Cancelled — destroyed" state instead of proceeding to the roll.

**Test-only units added** (none of the existing four had a ranged weapon —
WHF-3's Halberdiers/Knights of the Realm are both melee-only): Empire
Handgunners (Handgun: 24", S4, Armour Piercing, Move or Fire) and
Bretonnia Peasant Bowmen (Bow: 24", S3). **Weapon profiles are recalled
from training knowledge, not source-quoted** — 8th.whfb.app's weapon-profile
subpages 404'd during this brief's verify-first pass (tried
`/rules/weapons/handgun` and `/rules/weapons/bow`, both 404). Same flag
Phase 1 put on General/Captain before those were later confirmed correct —
unblock by finding the real weapon-page URLs next time someone's here.
Troop stat lines and points costs are otherwise unverified for these two
(only General/Captain were checked this pass). Sv set to `-` (no armour
save) for both, an assumption not a confirmed value.

**Phase-advance infrastructure, built out of necessity:** `endMovementPhase()`
was a dead end — it set `phase = 'magic'` and displayed "not yet
implemented" with no way to progress further (the end-phase button was
permanently bound to that one function). Generalized into `endPhase()`
cycling `PHASE_ORDER = [movement, magic, shooting, combat, end]`. Magic and
Combat stay stubbed pass-throughs (flash a hint, advance immediately) — WHF-5
owns Combat. Shooting phase auto-marks `phaseDone` for units with nothing to
do (no ranged weapon, `shootingBlocked`, or Move-or-Fire-blocked) so the
phase-complete bar isn't stuck waiting on units that structurally can't act.
`updateEndPhaseButton()` is now phase-aware (`GATED_PHASES = {movement,
shooting}`) rather than one-directional (previously only ever added the
`visible` class, never removed it — harmless before since nothing needed to
re-hide it, but would have broken silently under the new multi-phase cycle).

**Not done / explicitly 4b (per brief scope):** template/blast weapons
(stone throwers already in Empire faction data from Phase 1 — noted as a 4b
carryover, not built smaller here), shape/containment engine, scatter tool,
aura system.

**Testing:** same jsdom-driven functional smoke test pattern WHF-3 used
(Playwright's Chromium still needs `libasound.so.2`, still unavailable, still
a real sandbox limitation not a skip). One wrinkle worth recording for
whoever writes the next one of these: `whf.js` is `'use strict'`, and
top-level `const state` / `let chargeFlow` / `let shootFlow` do NOT attach to
`window` even when the script runs as a real injected `<script>` element
(only top-level `function` declarations do) — reach them via
`window.eval('state')` etc., which shares the same script-lexical scope.
Exercised: full declare→hit→wound→save→casualty cycle (Handgunners vs
Knights of the Realm, 10 shots fired confirming Fire in Two Ranks, 1 rear-
rank casualty confirmed by row index), auto-skip for melee-only units, and
Stand and Shoot reducing a charger from 20 to 18 models before the charge-roll
stage — the exact debt this brief exists to close. 18/18 checks passed. Test
script was not committed (one-off, same as WHF-3's).

**Commits:** `0b483f4`

---

### Phase 7 — WHF-4a.1: checkpoint fixes (2026-07-10)

Nox playtested the 4a checkpoint and found two real bugs plus one UX gap;
investigated first, fix scope proposed and approved before touching code.

**1. Stand and Shoot silently greyed (UX, not a bug).** `canStandAndShoot()`
was exactly RAW — a short-range charge (distance ≤ charger's M) correctly
disables the reaction — but the button gave no reason, which reads as
broken rather than as the rule working. Renamed to
`standAndShootBlockReason()`, returns `"no ranged weapon"` /
`"too close to react"` / `"engaged in combat"` instead of a bare boolean;
shown as both a title tooltip and an inline panel line.

**2. Real bug — no engaged/in-combat state existed anywhere.**
`rollChargeMove()`'s `'contact'` branch only ever wrote the charger back to
`state.units`; the defender was never touched. The charger's `hasCharged`
incidentally blocked it from shooting, but for the wrong reason ("already
moved," not "in melee") and only for that one turn (`hasCharged` resets
every movement phase) — and it did nothing to stop either unit from being
a legal shoot *target*. This is why Handgunners could volley the Knights
they'd just charged into.

Added `engaged` — deliberately **not** part of `movementDefaults()`'s
per-phase reset, since only WHF-5 (Close Combat resolution, not built yet)
should ever clear it. Set `true` on both units in the `'contact'` branch.
RAW-verified before building (per Nox: fetch it for the record, ship the
simple rule regardless — fun-first either way):
`8th.whfb.app/shooting/shooting-into-combat` — *"Models are not permitted
to shoot at enemies that are engaged in close combat... too much danger
of hitting a friend."* Blanket prohibition both directions, shipped as
one: `shootingBlocked` now includes `engaged` (blocks shooting *out*),
`validShootTargets()` excludes engaged enemies (blocks shooting *into*),
`standAndShootBlockReason()` also checks it (an already-engaged unit can't
Stand and Shoot against a second charger either). No template-weapon
carve-out modeled — RAW has one (accidental-hit war machines) but no
template weapons exist in this app yet; that's WHF-4b's problem, not this
one's.

Per Nox: engaged-until-WHF-5 is an accepted interim state, but it must be
*legible* — added an ENGAGED badge to the unit card (`showPanel`'s panel
header, red per the existing violation-red convention) and to the board
label itself (`[ENGAGED]`, same red), so a player sees why the shoot
option disappeared rather than just noticing it's gone.

**3. Real bug — charge contact rendered overlapping, not base-to-base.**
`chargeReach()`'s `contactPoint` is a point on the *target's* footprint
boundary. `rollChargeMove()` set the charger's `.position` directly to it
— but `.position` is the charger's front-**left** slot origin (established
WHF-1 convention), not its centre or front-centre, and nothing accounted
for the charger's own footprint half-depth. The charger's body ended up
extending past the contact point, into and through the target, instead of
stopping short of it.

Added `positionForFrontCentreContact()`: inverts `unitFootprint()`'s own
right/backward/localCX/localCY math — given "front-centre touches this
point, facing this direction," walks back by the charger's own half-depth
to its true centre, then to its front-left origin. `chargeReach()` now
returns `finalPosition` alongside `contactPoint` (kept, still useful as
the actual point of contact for reference/logging); `rollChargeMove()`
uses `finalPosition`. Side effect, not a regression: `inchesNeeded` drops
slightly since it no longer measures into the target's own footprint —
some charges that previously fell just short may now succeed on the same
roll. The distance is becoming correct, not looser.

Shipped as **separate commits** from the engaged-state fix per Nox — two
different bugs, different mechanisms, found in the same checkpoint pass.

**Testing:** same jsdom pattern as WHF-3/4a (Playwright still blocked on
`libasound.so.2`). 13/13 checks: Stand-and-Shoot reason text at both short
and long range and for a melee-only unit; full charge-to-contact cycle
confirming both units end up `engaged`, both auto-skip the Shooting phase
with the right reason, and a third unit's `validShootTargets()` correctly
excludes the engaged target; contact geometry confirmed base-to-base to
within 0.000" (charger footprint centre-to-target-boundary distance minus
the charger's own half-depth). Test script not committed (one-off).

**Commits:** `f74e9c7` (Stand and Shoot reason), `33457bf` (engaged state +
indicator), `f1cf24b` (contact geometry).

---

### Phase 8 — WHF-5m: Movement Pass — Overlap Rule + Movement UX (2026-07-11)

**Brief:** `briefs/WHF5M_MOVEMENT_BRIEF.md`, backlog items 1, 6, 8, 9
(`briefs/WHF_UX_BACKLOG.md`). **Files:** `whf.js`, `whf.css`,
`whf.html` → `index.html` (rename) + new `whf.html` redirect stub.

**1. Friendly overlap prevention (item 6, core rules).** New
`violatesFriendlyOverlap(movingUnit, allUnits)`, checked at `commitGhost()`
alongside the existing `violates1InchRule()` — same choke point, so it
automatically covers move, wheel, AND reform without three separate call
sites. Deliberately a DIFFERENT threshold than the enemy rule: friendly
ranks stand touching shoulder-to-shoulder in normal formation, so this only
forbids literal body overlap (2×MODEL_R, centre-to-centre) rather than the
enemy rule's 1"-buffer-plus-two-radii. Simplification, per the brief's
"fun-first" allowance: only the final (post-commit) position is checked,
not every intermediate point of the move — same precedent the enemy rule
already set (ghosts can phase through during preview; only commit-time
matters).

**Verify-first caught a real fixture bug while building this.** Once the
rule existed, `initTestUnits()`'s stock positions failed it at rest:
Handgunners (added WHF-4a, `y:300`) sat 10px from Halberdiers' nearest
model (threshold is 20px = 2×MODEL_R), and Peasant Bowmen (`y:520`) sat
12px from Knights of the Realm. Neither pairing was ever checked for
mutual spacing when those units were added, because no overlap rule
existed yet to check against. Fixed by moving both away from their
faction-mate: Handgunners to `y:176`, Peasant Bowmen to `y:250` — both now
verified clear (`violatesFriendlyOverlap()` false for all four units at
init).

**2. Movement-points bar (item 1).** `movementBarHtml(M, committedUsed,
previewUsed)` — pure function, returns the bar + label markup, called from
all three active `buildMovementSection()` branches (idle/move/wheel/
reform) so the preview segment updates live as a wheel or move ghost is
built. `previewUsed` is `null` in the idle branch (no ghost yet, bar just
shows the committed total) and the ghost's live `movementUsed` everywhere
else — no separate tracking needed, the ghost already carries the number.
CSS: `.move-bar-track`/`.move-bar-used`/`.move-bar-preview` in `whf.css`,
gold for committed, the existing selection-gold ring colour for the
preview segment.

**3. Undo move (item 1).** One level, not a per-action stack, per the
brief ("one level of undo is enough"). `snapshotUnitsForMovement()` records
every unit's `{position, facing, rankWidth}` at the moment the Movement
phase starts (called from both `init()` for turn 1 and `endPhase()`'s
`next === 'movement'` branch every turn after) — `undoMove()` reverts the
selected unit straight back to that snapshot regardless of how many
move/wheel/reform actions it chained together since, resetting
`movementUsed`/`backwardInches`/`hasMoved`/`hasReformed` to fresh-phase
values and re-running `reassignModels()` to fix row/col after any
rankWidth change. **Scope decision, not an oversight:** `canUndoMove()`
excludes charged and fleeing units. A charge has already resolved
reactions, casualties, and possibly a flee/redirect on OTHER units by the
time it's done — rewinding just the charger's position would strand those
side effects with nothing left to explain them. Undo only ever covers
voluntary Move/Wheel/Reform.

**4. Range indicators (item 9).** Two dashed rings, informational only —
neither changes what a move/shot can legally reach (`chargeReach()`/
`wheelUnit()`/`moveUnitForward()`/weapon `range` already gate that; these
just visualize the existing numbers on the board instead of leaving them
side-panel-only). `renderMoveRangeIndicator()`: selected unit's remaining
M this phase, drawn from `moveGhost.unit` when a ghost is active so the
ring shrinks live with the preview. `renderShootRangeIndicator()`: selected
unit's ranged-weapon range in the Shooting phase (no-op for melee-only
units). Both wired into `renderBoard()`'s existing overlay-layer pass.

**5. Entry point rename (item 8).** `whf.html` → `index.html` via `git mv`
(no other file referenced `whf.html` by path — checked via repo-wide
grep before renaming). Left a `whf.html` redirect stub (`<meta
http-equiv="refresh">`) for old bookmarks/links. `build.js`/`netlify.toml`
don't reference the entry HTML filename at all (that toolchain only
generates `firebase-config.js`), so nothing else needed updating.

**Testing:** same jsdom-driven functional smoke test pattern as WHF-3/4a/
4a.1 (Playwright's Chromium still needs `libasound.so.2`, still
unavailable). Loads `index.html` itself as part of the test — doubles as
the "index.html loads the game" acceptance check. 15/15 checks: a
controlled friendly-overlap scenario (2" move accepted, Undo restores
exact position/facing/movementUsed/hasMoved, redo the 2" then push to a
cumulative 4" and confirm the overlapping half gets rejected while the
unit stays at its last legal 2" position), the movement bar's pure-function
math and its live rendering in the panel during an active ghost, and both
range-ring types rendering on selection in their respective phases. Test
script not committed (one-off, same as prior phases).

**Commits:** (cite hash after commit below.)

---

## BON-1 — Generic Bonus Engine landed in data-pipeline (2026-07-02)

data-pipeline built the cross-system bonus/modifier schema referenced in
the BON-1 roadmap ("WHF adopts resolver via its own stat mapping"). Nothing
to do here yet — noting for whenever WHF picks this up:

- `system: "warhammer-fantasy"` and the Firebase path
  `gameData/warhammer-fantasy/bonuses/{bonusId}` are already reserved in
  the schema and in data-pipeline's `upload.js`, matching this repo's
  existing `gameData/warhammer-fantasy/{factionId}/...` convention.
- The condition-token machinery (stackable named tokens, e.g. Markerlight
  in KT) is explicitly designed to carry WHF psychology (Fear, Panic)
  later — see the `shared/bonus-resolver.js` header in data-pipeline.
- Adopting the resolver means extending its abstract stat vocabulary (WS,
  BS, Ld, etc.) — additive only, per the schema's own rule: extend by
  adding, never renaming existing stats.
