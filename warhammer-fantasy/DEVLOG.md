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

- **Frontend:** Vanilla JS, no framework. Single-page app (`whf.html` + `whf.js` + `whf.css`).
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
| WHF-3: Charge | Complete (see Phase 4) — Stand and Shoot stubbed pending WHF-4 |
| WHF-4: Shooting | Not started |
| WHF-5: Combat (Close Combat + Rank Collapse) | Not started |

## Things The Next AI Should Know

- **`modelPosition()` is the load-bearing geometry function.** All movement, charge, and arc calculations derive from it. It is standalone at the top of `whf.js`. Do not embed it inside objects or render loops.
- **`reassignModels()` is NOT rank collapse.** It only fixes row/col slot indices after a `rankWidth` change. Dead models stay at their array index. Rank collapse (sliding alive models forward to fill gaps) is WHF-5.
- **`frontCorners()` is simplified.** Uses slot centres, not outer model edges. Arc distance is ~0.6" short on a 5-wide unit. Fix: add MODEL_R to radius in `wheelUnit()` if tighter fidelity is needed.
- **Shooting-after-reform restriction** is not enforced. Noted for WHF-4.
- **Character stats (General of the Empire, Empire Captain)** are from training knowledge, not verified against 8th.whfb.app. Unblocks at WHF-5 before character combat is implemented.
- **Firebase credentials** are in `firebase-config.js` (gitignored). Shape: same as `warhammer40k/firebase-config.js`.

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
