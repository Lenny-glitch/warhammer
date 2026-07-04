# BON-2 — Kill Team Engine Reads Weapon Bonuses

## Orientation
Repos: ~/projects/killteam (primary) + ~/projects/data-pipeline
(read-only source of the resolver master + reference docs:
BONUS_ENGINE_BRIEF.md v3, BON1B/BON1C, mapping-review.txt).
Out of scope: warhammer40k/, warhammer-fantasy/, age-of-sigmar/,
roster/. This file is the complete spec.

## Context
Firebase now carries the full bonus catalog
(gameData/kill-team/bonuses/, 29 entries) and every weapon in the
unit data carries a compiled "bonuses" array alongside its display
keywords. Resolver is at 1.2.0 in
data-pipeline/shared/bonus-resolver.js. Nothing in the KT app
reads any of it yet. BON-2 makes shooting and fighting resolve
through real weapon bonuses.

Design principles in force:
- Legibility beats rules-as-written; determinism is non-negotiable
- The engine, not the resolver, routes appliesTo:"target" effects:
  call resolveStats once per side and apply target-directed
  effects to the other side's stats. The resolver stays
  single-sided ON PURPOSE (confirmed design after BON-1c) — do
  not widen its signature.
- Do NOT trust this brief's claims about killteam/ internals —
  verify against source. Where the brief says "the shoot
  sequence," find the actual function; if reality differs from an
  assumption here, say so in the report rather than bending the
  code to match the brief.

## Part 1 — Vendor the resolver
Copy data-pipeline/shared/bonus-resolver.js →
killteam/js/bonus-resolver.js, byte-identical, version must be
1.2.0 or later (1.1.x lacks appliesTo — the sync-check script
will catch drift; run parsers/check-resolver-sync.js from
data-pipeline after copying and include its output in the report:
expected MATCH for killteam, ABSENT for warhammer40k).

## Part 2 — Snapshot at game creation
At game creation, copy into the game document:
- games-kt/{gameId}/bonuses ← the full
  gameData/kill-team/bonuses/ catalog
Weapon-attached bonuses already travel inside the denormalized
operative data — verify that game-creation's roster import
actually preserves the weapons' "bonuses" arrays end-to-end
(export → game doc). If exports were generated before the BSData
upload they may lack bonuses arrays; handle absent arrays
gracefully (no bonuses = current behavior, zero errors).
After creation the app NEVER reads gameData/*/bonuses/ — the
game plays its frozen copy. (Snapshot rule, resolver header.)

## Part 3 — Shoot + Fight resolve through the resolver
Immediately before dice are rolled in the Shoot action:
1. Gather the attacking weapon's bonuses (from the operative's
   snapshotted data)
2. resolveStats(attackerStats, bonuses, context) with
   context.facts populated as available; engine routes
   appliesTo:"target" effects (e.g. Piercing's defDice) onto the
   defender's numbers
3. Roll with the resolved numbers: atkDice count, hit threshold,
   critThreshold (Lethal), dmgNormal/dmgCrit (Devastating, Melta
   pattern), defDice (Piercing)
4. Post-roll conditional pass: once crit results are known,
   re-resolve with facts.critScored / facts.noCritScored set and
   apply the delta — this is how Piercing Crits, Rending, Severe,
   Punishing land. Rending/Severe are conversions (+1 crit AND
   -1 normal, already paired in the data — apply both effects,
   don't special-case).
Fight action: same path, same resolver call, melee weapon's
bonuses. Two entry points, one resolution — no melee-specific
bonus code.
halfRange fact: compute from measured distance vs weapon range
at shoot time (KT weapons with rng field; null = unlimited, fact
false).

## Part 4 — Display, not enforcement
- Flags (blast, torrent, silent, hot, brutal, shock, psychic...):
  render as badges on the weapon in the attack UI. NOT
  mechanically enforced in BON-2 — players apply by agreement.
- Conditions (stunned, markerlight): same — visible on the
  weapon/result, no token state. BON-3 work.
- Every applied bonus must be visible: the resolver's "applied"
  list drives a dice readout in the attack panel — one line per
  applied bonus, plain English from the catalog description
  ("Lethal 5+ — crits on 5+", "Piercing 1 — defender loses one
  defence die"). Always on in dev mode (?dev=true); in normal
  play, collapsed behind a tap/expand. This readout is the
  acceptance test: Nox verifies bonuses by reading it, not by
  hand-computing dice math.

## Part 5 — Determinism check
Both clients must compute identical resolved stats. The resolver
is pure and the snapshot is shared, so the only risk is the
engine passing different inputs (e.g. locally-computed distance).
Whatever facts feed the resolver (halfRange, critScored) must
derive from shared game-doc state or the acting client's values
written into the action record — the observing client replays
from the record, never recomputes from its own view.

## Done when
- check-resolver-sync: MATCH for killteam
- New game snapshots the catalog; old games (no snapshot node)
  keep working with bonuses inert
- A Pathfinder pulse rifle (or any Lethal/Piercing weapon) shows
  correct resolved numbers in the dev readout, and the post-roll
  conversions visibly fire on a crit
- Fight action resolves through the same path (show one melee
  example in the report)
- Report: what was verified vs assumed about the shoot sequence,
  any places reality diverged from this brief
- KT DEVLOG updated

## Out of scope
- Flag mechanical enforcement (blast targeting, hot self-damage)
- Condition token state (BON-3)
- Active/CP bonuses and their UI (BON-3)
- 40k anything (BON-4)
- Any Firebase rules or pipeline changes
