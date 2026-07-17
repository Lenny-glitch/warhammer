# BUG — 40k Pre-Game Blockers (blocks brother game 5)
# CLAIMED: 2026-07-16

## Orientation
Monorepo, warhammer40k/. Claim first. From Nox's live two-window
test on the new Part 3 build. Item 1 is a hard blocker.

## 1 — TERRAIN PLACEMENT INFINITE LOOP (blocker)
Placement is strictly alternating with a Pass Turn button, so
when one player finishes their budget the other is stuck in an
endless pass-turn cycle waiting for a piece that will never come.
Fix, both parts:
- SIMULTANEOUS placement: both players paint at once, no turn
  alternation (each has their own budget; the existing per-player
  budget bars already support this)
- explicit DONE WITH TERRAIN per player; phase advances when both
  are done (or when a player's budget hits 0 AND they confirm)
- a player who is done sees the other's remaining state, not a
  pass-turn prompt

## 2 — Same-faction games must be allowed
Currently both players cannot pick the same faction. Nox and his
brother may both want Eldar. Remove the restriction; disambiguate
the two forces by player name/color, not faction identity.
Check the whole pipeline for faction-as-identity assumptions
(deployment zones, unit ownership, UI labels) — report anything
that assumed uniqueness.

## 3 — Roster list appears only after faction select
Confusing (brother hit this). Show published rosters up front,
filtered live as faction changes — or better, let picking a
roster SET the faction, since the export already knows its
faction. Your call; the pasted-ID fallback stays.

## 4 — Shooting says "no one is in range" [NEEDS NOX'S DATA]
Nox could select shooters but every target reported out of range.
UNKNOWN whether this is a bug or correct (Wraithcannon is 18",
board is 44"x30" — opposite deployment zones may genuinely be out
of range turn 1).
Investigate: verify the range check reads the weapon's range from
the EXPORT's profile keys correctly — note that publish sanitizes
profile keys (BS/WS -> bsws etc.), so confirm the sim reads the
sanitized shape, not the pre-sanitized one. Also verify inches-
to-board-units conversion.
REGARDLESS of the outcome: shooting must SAY WHY a target is
invalid ("28" away — Wraithcannon range 18""), not just report
nothing in range. Same legibility principle as KT-4. If the
engine turns out correct, the message is still the fix.

## 5 — Port-worthy (note only, do not build here)
40k's deployment auto-selects the next unit to place — Nox wants
that in Kill Team. Log it in killteam/DEVLOG as a wanted item.

## Done when
- Two-window game reaches deployment with simultaneous terrain
  and no pass-turn loop
- Eldar vs Eldar game creates and plays
- Roster picking is not gated behind faction select (or faction
  derives from the roster)
- Shooting either works or explains itself with distances
- DEVLOG, hashes; Nox pushes + redeploys; game 5 is acceptance
