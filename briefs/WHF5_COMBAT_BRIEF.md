# WHF-5 — Combat Phase (core melee + break/flee)
# CLAIMED: 2026-07-12

## Orientation
Monorepo, warhammer-fantasy/. Claim first. Read DEVLOG Phases
7-9 (engaged state, geometry, movement patch) — this brief is
what the "engaged never clears" interim was waiting for.
Verify rules against 8th.whfb.app as usual; where RAW is
heavier than fun, simplify and DEVLOG the simplification —
the priorities doc governs. Report divergences from this brief
before bending code to match it.

## Scope — one full combat round, playable end to end
1. Combat phase engages each locked pair (Combat stops being a
   pass-through). Strike order by Initiative (chargers strike
   first on the charge turn — 8th's "charging grants no I bonus"
   vs older editions: verify RAW, pick ONE rule, document it).
2. Attacks: models in base contact fight + supporting attacks
   from the 2nd rank (1 each). Hit via the WS-vs-WS chart,
   wound via S-vs-T, armor saves modified by S/AP — reuse the
   resolveShot machinery's shape (profile in, casualties out);
   melee gets its own resolveMelee built to the same resolver-
   profile conventions so bonuses plug in later.
3. Casualties from the rear rank (established rule), both sides
   simultaneous within an Initiative step.
4. Combat resolution score: wounds caused + rank bonus (max +3)
   + charge (+1) + standard/outnumber ONLY if trivial — start
   with wounds+ranks+charge and DEVLOG what's omitted.
5. Loser takes a Break test: Ld minus the score difference on
   2d6. Pass = combat continues next turn (stay engaged). Fail
   = FLEE: 2d6 directly away from the enemy, unit marked
   fleeing; winner chooses pursue (2d6 — meet or beat the flee
   roll = fleeing unit DESTROYED) or hold.
6. Engaged clears correctly on: combat ends by wipe, by flee,
   by destruction. Fleeing units: can't act normally; rally
   (Ld test at start of their Movement) or keep fleeing —
   simplest working version, DEVLOG the shape.
7. UI: combat resolves with the shot-panel pattern (dice
   summary in the side panel, casualties visibly removed,
   FLEEING badge like ENGAGED). Drama polish is item 7 in the
   backlog — do not build it here.

## Out of scope
Challenges, characters in combat specifics, multi-unit combats
beyond one-vs-one (if two units pile into one fight, report
what happens rather than engineering for it), psychology
beyond the break test, magic anything.

## Done when
- Full cycle in play: charge → Stand-and-Shoot → contact →
  combat round → break test → flee + pursuit, engaged/fleeing
  states correct throughout, survivors act normally next turn
- Smoke tests per WHF precedent incl. a break-and-destroyed
  case and a hold-and-grind case
- DEVLOG Phase 10, hashes; Nox pushes + redeploys; Nox
  checkpoint playtest (checklist will follow from planner)
