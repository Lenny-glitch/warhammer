# BON-3 — CP Economy, Ploys, and Condition Tokens

CLAIMED: 2026-07-15

## Orientation
Monorepo, killteam/ (+ shared/ resolver if needed, + data-
pipeline/ only for catalog authoring). Claim first. This is the
brother's #1 request ("ploys and psych"). Read
briefs/BONUS_ENGINE_BRIEF.md (v3) + BON1B/BON1C for the schema —
active bonuses, cost types (cp/ap), conditions, and the
snapshot rule were all designed for exactly this and shipped
unenforced. This brief turns them on.

## DESIGN RULING (Nox, standing, do not "improve")
Ploys are NOT faction-card recreations. They are generic,
legible, CP-priced bonuses: "spend 1CP: +1 to hit this
activation." Neither player is a rules lawyer; the description
IS the contract. Card-exact ploy text is dead and stays dead.

## 1 — CP economy (foundation)
CP is already tracked (KT-1). Add SPENDING:
- a visible CP pool per player
- ploy usage decrements it; can't spend what you don't have
- usage limits enforced per the schema (oncePerRound /
  oncePerGame / oncePerActivation) per the existing `usage`
  field
- both clients agree (determinism rule): the spend writes to
  the game doc as an action record like everything else

## 2 — Generic ploy catalog (author ~6-10, system: kill-team,
   faction: null — universal, usable by any team)
Author through the PIPELINE (patches/mapping tables — pipeline
is the only writer to gameData), snapshot into games at
creation as usual. Starter set, all active/cp, all with
plain-English descriptions that match their effects exactly:
- +1 to hit this activation (1CP)
- reroll one attack die (1CP)
- +1 APL this activation (2CP)
- ignore an injured penalty this activation (1CP)
- +1 to a defence save this shot (1CP)
- pick 2-4 more that feel useful at the table — your judgment,
  keep them one-line legible
UI: a ploy panel showing available ploys, their cost, and
whether you can afford/use them now. Trigger-gated by the
existing eligibility machinery (phaseStrategy vs onShoot etc.).

## 3 — Condition tokens (deferred since BON-1c, now due)
Implement live state for the `condition` effect type:
- stunned (from Stun weapons — currently applies nothing)
- markerlight (Pathfinders; stacks 1, max 4)
State lives in the game doc, visible on the token/card, and
clears per its duration. Conditions the engine doesn't know
stay inert, no errors (existing convention).

## Out of scope
Psychic powers (separate — pending the data investigation),
faction-specific ploys, 40k/WHF anything, drama/animation.

## Done when
- Two-window run: spend CP on a ploy, both clients agree, the
  bonus visibly applies in the dice readout (it's a bonus like
  any other — it should just appear in the existing readout)
- Can't overspend; usage limits hold
- Stun actually stuns; markerlight stacks and caps at 4
- DEVLOG, hashes; Nox pushes + redeploys
