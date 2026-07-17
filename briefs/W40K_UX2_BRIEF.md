# 40K-UX2 — Board Readability & Deployment Fixes

CLAIMED: 2026-07-17

## Orientation
Monorepo, warhammer40k/. Claim first. From brother-game 5,
second run. Sibling to 40K-UX1 (hover labels, log, layout) —
if that's still in flight, coordinate/merge rather than collide.
Nox's brother is the reporter for most of this; his words are
quoted where they're the spec.

## 1 — Token size reflects base size
Every token is currently the same size, so a Leman Russ looks
like a Guardsman. Scale tokens by the unit's actual base size
(vehicles/monsters visibly larger). Use whatever base/size data
exists in the flat pool; if it isn't there, derive a sensible
tier from the unit's role/keywords (vehicle vs infantry vs
character) and say so in the DEVLOG — do NOT invent per-unit
millimeter values.

## 2 — Deployment zone clarity (brother: "Oh shoot I put my
##     terrain on your side. We need a way to make it more clear
##     what side you are starting on")
During terrain placement AND deployment, make YOUR zone
unmistakable: tint/hatch your half, label it ("YOUR ZONE"),
and gray or de-emphasize the opponent's. The zones already
exist in state (the sidebar lists "top 12"/"bottom 12"") —
this is presentation, not new rules.
Bonus if cheap: warn (don't block) when placing terrain in the
opponent's zone.

## 3 — Undo (brother: "we need an undo button")
Deployment and Movement need one-level undo: revert the last
placement/move within the phase. WHF-5m built exactly this
(phase-start snapshot, cleared at phase end, refused for
irreversible actions like charges) — read that implementation
and port the pattern. Do NOT allow undo after dice are rolled or
after any action with opponent-visible side effects.

## 4 — Model arrangement within a unit (brother: "It might be
##     nice to be able to re arrange your groups within the unit.
##     Or make it auto move them around to keep them from being
##     on top of each other or leaving weird gaps")
Models within a squad currently place/move with overlaps and
gaps. Minimum useful version: auto-arrange a unit's models into
a clean coherent formation on placement and after a move
(respecting unit coherency), rather than manual per-model
fiddling. If manual rearrangement is cheap on top, add it; if
not, note it and stop — auto-tidy is the ask that matters.

## Out of scope
Alternating activation (a design decision Nox is weighing —
do not build), CP/stratagems (known gap, BON-4 era), indirect
fire (rules check pending), mobile (separate audit), any rules
changes.

## Done when
- Vehicles are visually obvious at a glance
- Both players can tell whose half is whose during terrain and
  deployment without asking
- Undo works in deployment and movement, refuses where it should
- A deployed/moved squad looks like a squad, not a scatter
- DEVLOG, hashes; Nox pushes + redeploys
