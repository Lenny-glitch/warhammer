# KT-ELIMINATION-MODE — Remove turn limit, win by wiping the enemy

## Orientation
Monorepo, ~/projects/warhammer, branch master. CLAIM FIRST.
Touch ONLY killteam/. Parallel session owns warhammer40k/.
You cannot push — commit, cite hashes, Nox pushes.
VERIFY-FIRST: check claims against real code, report divergence.

## Why
Real playtest with Aaron went well. One request: the game ends
at the turn limit (KT = 4 turning points), and he wants it to
keep going until someone's wiped instead. There are no victory
points / objectives yet, so a turn limit has nothing to score —
pure elimination is the only coherent mode right now.

Design intent (Nox): this is really "game modes." For now the
only mode is ELIMINATION (no turn limit, last team standing).
Later, when objectives exist, a "Take and Hold" mode adds the
turn limit BACK alongside VP scoring, behind a mode picker. So:

DO NOT delete the turn-limit code. Make elimination the active
behavior, but leave the turn-limit logic in place / easy to
re-enable. A future brief adds the picker.

## What to build
1. Remove the turn limit as a game-END trigger. The turn counter
   can keep counting (turn 5, 6, ...) — it just no longer stops
   the game. Confirm what actually ends the game today and
   change THAT, not the display.
2. End condition = one team has zero operatives left AND the
   other team still has at least one. That team wins.
3. Win screen, per Nox:
   - Winner sees: "YOU HAVE SLAYED THE ENEMY" (or similar)
   - Loser sees: "YOU HAVE BEEN MURDERED" (or similar)
   - Both drawn from the same game-end state so the two clients
     agree on who won — determinism is non-negotiable.
4. Edge case — mutual wipe (both hit zero in the same combat,
   e.g. a melee trade): show a funny tie message to both, not a
   broken/blank screen. Nox wants this handled, played for
   laughs. Your wording.

## Check against existing code
- KT may already have a win/lose screen for some condition — if
  so, reuse its presentation, just change the trigger. Don't
  build a second parallel end-screen system.
- Make sure "0 operatives" counts correctly: a fully-wiped team
  shouldn't linger as empty units (that exact bug existed in 40k
  once). Verify a dead operative is really gone from the count.

## Out of scope
- Objectives, victory points, the mode picker UI (all future).
- 40k (parallel session owns it).

## Test — two browser contexts, MANDATORY
1. Play past the old turn limit (turn 5+). PASS = game continues,
   does not end. FAIL = ends at 4.
2. Wipe one team completely. PASS = winner sees the slay screen,
   loser sees the murdered screen, both agree. FAIL = wrong
   winner, blank, or desync between clients.
3. Force a mutual wipe if you can. PASS = tie message both sides.
4. Confirm a wiped team's operatives are gone from the live
   count, not lingering empty.

## Done when
Commit(s), hashes cited, plus a report:
1. What ended the game before, what ends it now.
2. Confirmation turn-limit code is disabled-not-deleted, and
   how a future picker would re-enable it.
3. The 4 tests, each pass/fail with what you saw.
