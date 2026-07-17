# 40K-UX1 — Table Feel Parity (hover, log, layout)

CLAIMED: 2026-07-17

## Orientation
Monorepo, warhammer40k/. Claim first. From Nox's brother-game 5
playtest (first real 40k two-player game — the roster chain
worked end to end, Aaron fielded a full Astra Militarum army
with Leman Russes and Rough Riders).
Kill Team already solved all three of these; read killteam/'s
implementations first and port rather than reinvent (KT-3's
token hover + action log, KT-5's layout/side panels).

## 1 — Enemy hover labels
Opponent units have no hover affordance — Nox can't tell what
he's looking at. Port KT-3's pattern: pointer cursor on
selectable/inspectable tokens + tooltip with unit name and
model count/wounds. Applies to BOTH sides' units.

## 2 — Deployment/placement log
40k has no action log at all. Kill Team's (KT-3 item 4, written
against structured action records) should port. Minimum useful
version for 40k: a log of deployment placements ("Aaron deploys
Leman Russ Demolisher"), then extend to game actions if cheap.
Write it against the game doc's action records like KT's, NOT
ad-hoc strings — same reasoning as KT-3: it grows into replay
later.

## 3 — Layout expands and scrolls with long unit lists (recurring)
A big army's sidebar makes the page taller than the viewport.
This is the THIRD time this class of bug has appeared (KT twice).
Fix structurally: sidebars scroll INTERNALLY, the page itself
never grows. Verify at desktop AND half-screen-tiled width with
a 13-unit army loaded (Aaron's roster is the test case).

## Out of scope
Mobile support (pending a scope decision from Nox — his brother
plays on a phone; that's a separate, larger question), bonus
integration (BON-4), any rules changes.

## Done when
- Hovering any unit, either side, shows what it is
- The log narrates deployment; both clients see it
- No page scroll with a full 13-unit army, desktop or tiled
- DEVLOG, hashes; Nox pushes + redeploys
