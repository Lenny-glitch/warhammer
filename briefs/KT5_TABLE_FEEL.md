# KT-5 — Table Feel: Dice Legibility, Board Indicators, Motion

CLAIMED: 2026-07-17

## Orientation
Monorepo, killteam/. Claim first. Read killteam/DEVLOG's KT-4
entry (combat legibility) — this is its sequel, and the theme is
the same one Nox has raised in THREE consecutive playtests:
"everything is too auto-calculated. Told, not shown."
The engine is correct. Players can't feel it. That's the bug.

## PRINCIPLE
This is not decoration. A player who can't see WHY 24 wounds
happened doesn't trust the game. Legibility is correctness of
understanding — same priority tier as the bonus readout's
description-is-the-contract rule.

## 1 — Dice presentation (the core ask, 3x requested)
Current dice are small, uniform, and hard to parse at a glance.
Wanted:
- BIGGER dice faces
- COLOR-CODED by outcome (crit / hit / miss are already
  labeled; make the color do the work before the text does)
- LABELED clearly, and the crit/hit -> damage math visible
  inline ("2 CRIT x 6 = 12, 1 HIT x 3 = 3, total 15") — KT-4
  added the math; make it READ
- keep it compact: Nox's constraint is "not too much space"
Apply to Shoot AND Fight, attacker and defender panels.

## 2 — Layout: dice and log get the empty space
Nox's ask: the gap between the battle map and the model cards is
dead space. Put the dice pool on ONE side of it and the action
log on the OTHER. Nothing below the fold, ever — the scroll
regression has come back twice; make the layout structurally
incapable of it at desktop and half-screen-tiled widths.

## 3 — Board-level condition indicators
Conditions currently show only as sidebar badges. Put them on
the TOKEN:
- markerlight: visible marker on the targeted operative's token
  (Nox: "needs indicator of what model has been targeted") —
  stack count visible up to its cap of 4
- stunned: token indicator
- generic: any future condition should get a token treatment
  from the same code path, not a bespoke one each time

## 4 — Motion (the smallest useful version)
Nox wants A-to-B movement with dust and sound eventually, across
all three games. NOT that, not here. Here:
- operatives TWEEN from old position to new instead of
  teleporting (short, skippable, ~200ms)
- shots draw a brief tracer/beam from shooter to target, colored
  by outcome (hit vs miss reads instantly)
- damage floaters already exist (KT-2 P2) — make sure they land
  ON the tween's endpoint, not the old spot
Audio, dust, per-weapon effects: OUT. Log them in the DEVLOG as
the next tier so they're not lost.

## Out of scope
Sound, particles, per-weapon shot types, the chess timer, ghost-
preview movement (that's a KT-6/movement brief), any rules
changes whatsoever. This brief changes zero outcomes — if a die
roll's RESULT changes, you've broken it.

## Done when
- Nox can look at a resolved Fight and understand the math
  without reading the summary line
- No scrolling at desktop or half-screen; dice and log occupy
  the dead space
- Markerlighted and stunned operatives are identifiable on the
  BOARD
- Movement tweens, shots draw, nothing teleports
- Two-window verification (both clients see the same motion) +
  a regression check that outcomes are identical to pre-brief
- DEVLOG, hashes; Nox pushes + redeploys; brother game is
  acceptance
