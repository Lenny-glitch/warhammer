# WHF-5m — Movement Pass: Overlap Rule + Movement UX
# CLAIMED: 2026-07-11

## Orientation
Monorepo, warhammer-fantasy/. Claim before starting. Read
briefs/WHF_UX_BACKLOG.md (items 1, 6, 8, 9 — this brief IS
those items) and the WHF DEVLOG through Phase 7 (4a.1's
geometry/engaged work is the freshest ground this touches).
NOT WHF-5 (combat) — this is movement-phase work only; "5m"
to avoid colliding with the combat phase's eventual number.

## Scope
1. FRIENDLY OVERLAP PREVENTION (backlog item 6, core rules):
   friendly units may not move through or end overlapping each
   other. Enemy 1" proximity is already enforced — extend the
   same footprint-collision machinery to friendlies. Wheels and
   reforms respect it too. If pathing-through vs ending-on needs
   different treatment (RAW allows some pass-through cases),
   simplify per fun-first: no overlap at any point of the move,
   state the simplification in the DEVLOG.
2. Movement points bar (item 1): selected unit shows total M,
   spent, live cost of the move/wheel being lined up, remaining.
   Wheel cost preview updates during the wheel.
3. Undo move (item 1): revert selected unit to pre-move
   position/facing within the Movement phase; cleared on phase
   end. One level of undo is enough.
4. Range indicators (item 9): on selection, show movement reach
   on the board; in Shooting phase, show the shooting range ring
   for the selected unit's ranged weapon. (Casting waits for
   magic to exist.)
5. Entry point (item 8): whf.html → index.html (rename or
   redirect stub), document in DEVLOG.

## Explicitly deferred (do not build)
Mouse-drag ghost movement (backlog item 1's "likely direction")
— keyboard stays primary this pass; the bar/undo/indicators fix
the legibility half. Ghost-drag is its own brief once this
lands. Items 2/3/7 (wound display, controls, shot feedback) and
4/5 (unit cards, aesthetic) stay queued.

## Done when
- Two friendly units demonstrably cannot be moved into overlap
  (including via wheel), enemies unchanged
- Bar shows honest numbers through a move+wheel; undo restores
  exactly; indicators render for move and shoot
- index.html loads the game
- Smoke checks per WHF precedent; DEVLOG Phase 8; hashes; Nox
  pushes and playtests as acceptance
