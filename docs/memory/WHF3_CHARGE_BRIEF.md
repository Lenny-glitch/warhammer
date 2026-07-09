# WHF-3 — Charge Sub-Phase
# 2026-07-09. From Nox (planner). For Hades (Claude Code, WHF).
# CLAIMED: 2026-07-09
# Repo: ~/projects/warhammer, work in warhammer-fantasy/.
# Reference: docs/WHF_PROJECT_PLAN.md for how this fits the whole
# project — read it, this brief assumes it.

## Orientation
WHF-1 (board/regiments) and WHF-2 (movement) are shipped and solid.
This is the first combat-adjacent phase: the Charge sub-phase of
Movement. Verify-first as always — confirm WHF-1/2's actual regiment
movement/facing/wheel implementation before building on top of it;
report divergence from what this brief assumes rather than guessing.

Claim this brief (add "CLAIMED: <date>" line, commit) before starting
— parallel sessions may exist.

## Scope — RAW (8th Edition, per 8th.whfb.app, our locked reference)
Charge is the second of Movement's four sub-phases: Start of Turn,
**Charge**, Compulsory Moves, Remaining Moves. Sequence:

1. **Declare Charge** — active player nominates one of his units and
   the enemy unit it's charging. Must be a legal target: within the
   charger's line of sight, and within charge reach (charger's
   Movement + 2D6, though the roll hasn't happened yet — legality is
   checked on maximum possible reach, i.e. Movement + 12" as the
   outer bound worth pre-filtering on, actual roll comes later).
2. **Charge Reaction** — the charged unit's controller declares one
   of three reactions before the charge roll happens:
   - **Hold** — stand and receive the charge normally.
   - **Stand and Shoot** — shooting units may fire one round at the
     chargers before impact, at normal to-hit penalties for the
     charger's approach.
   - **Flee!** — the charged unit immediately pivots to face away
     (centre to centre) and moves a Leadership-gated flee distance
     (2D6, or 3D6 for fast cavalry/similar) away from the charger,
     ignoring the charger's remaining move. Triggers Panic tests on
     any friendly unit it flees through, and Dangerous Terrain tests
     if it flees through terrain/enemies.
   - Garrisoned units can only Hold or Stand and Shoot — Flee! is not
     available to them, even on a failed Terror test (that forces
     Hold instead of the normal Terror-flee outcome).
3. **Redirect** (only if the target fled) — the charging player may
   test Leadership to redirect onto a different valid target instead
   of completing the charge against the now-fleeing unit. Fail the
   test → charge continues against the original (now fleeing, likely
   uncatchable or auto-caught depending on distance) target. One
   redirect per unit per turn, only if another legal target exists.
4. Repeat 1–3 for each charge the active player wants to declare —
   full declare/react cycle per charge, not all declared up front.
5. **Roll Charge Range and Move Chargers** — once all charges for the
   phase are declared and reacted to, roll 2D6 per charging unit,
   add to Movement, compare to distance needed to reach the target
   (accounting for the charger's wheel to align). Enough range →
   charger moves into base contact, aligning to the target's facing.
   Not enough → Failed Charge, unit still moves its charge roll
   distance as a normal move (facing the original target) but no
   combat results.
6. Edge cases worth explicit handling, not afterthoughts:
   - **Charging more than one unit** ("There's Too Many of Them!") —
     a single charging unit can be declared against multiple targets
     if they're both in reach and it can contact both; each declares
     its own reaction independently.
   - **Multiple charges on one target** — several chargers can
     declare against the same unit; that unit reacts once, and its
     reaction applies to all of them.
   - **Charging a fleeing enemy** — auto-catches/destroys under
     specific range conditions; check RAW on this before assuming
     it's just a normal charge roll.
   - **Unlikely Flights** — flee moves that would leave a unit unable
     to flee legally (boxed in) have their own resolution; don't
     let a fleeing unit silently fail to move.

## What this pioneers — pivot-arc / reach geometry
Charge reach + wheel-to-align-with-target is the first real instance
of "can this footprint, after pivoting, reach and orient toward that
target" in the project. Per docs/WHF_PROJECT_PLAN.md, this geometry
is meant to be portable to 40k vehicle turning later. Build it as a
clean, separate utility (footprint + pivot point + target facing in,
reachable/aligned-position out) rather than inlining the math into
the charge-declaration flow. Don't solve 40k's specific vehicle
constraints now — just don't couple this utility to WHF-only
assumptions (regiment rank/file shape) any tighter than necessary.
Note where you put it and what its interface looks like in your
DEVLOG so extraction later is a relocation, not a rewrite.

## What NOT to build in this brief
Per the project plan, several infra pieces come after this brief,
not during it:
- No shape/containment engine, no scatter tool — those land with
  Shooting (WHF-4), for template weapons. Charge doesn't need them.
- No aura system (Inspiring Presence / Hold Your Ground!) — that's
  Psychology, much later, and depends on the containment engine.
- No turn/activation sequencer work — Charge just needs to work
  within the existing Movement sub-phase order already built in
  WHF-1/2.
If something here seems to want one of these, stop and report rather
than building a smaller version of it inline — that's exactly the
kind of premature-abstraction risk we're trying to avoid.

## Done when
- Declare/react/redirect/roll cycle works end-to-end for a single
  charge, including all three reactions.
- Multiple simultaneous charges (both directions: one unit charging
  two targets, two units charging one target) resolve correctly.
- Failed charges move the charging unit its rolled distance with no
  combat result — not silently skipped.
- Flee moves trigger Panic on friendly units passed through.
- Pivot-arc/reach geometry lives as a separably-documented utility,
  noted in DEVLOG with its interface.
- DEVLOG entry: what was done, what was skipped, anything Nox needs
  to know. Commits cited.
