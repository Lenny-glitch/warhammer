# BUG-40K-CASUALTY-LOCK — Game hard-locks in casualty allocation

## Orientation
Monorepo, ~/projects/warhammer, branch master. CLAIM FIRST.
Touch ONLY warhammer40k/. Parallel session owns killteam/.
You cannot push — commit, cite hashes, Nox pushes.
VERIFY-FIRST: this is from Nox's live playtest, not source.
Check every claim against real code; report divergence.

## Why — this is P0, game-breaking
Two symptoms from a real game, possibly ONE root cause:

- #12: A unit of 5 Wraithguard, 1 wounded, needs 4 removed.
  Only SOME models are clickable — 2 cannot be selected. The
  player can't reach the required number, can't confirm, and
  THE GAME CANNOT PROCEED PAST THIS POINT. Hard lock.
- #5: "Can't click units to remove, can't confirm removal.
  Exited, rejoined, then it worked." A fix-on-reload symptom —
  smells like stale client state, not a pure UI bug.

Both live in the casualty-allocation / confirm-removal flow.
Investigate them together — they may be the same broken write.

## Investigate first, don't fix blind
1. Find the casualty-allocation code (likely board.js). How does
   it decide which models are clickable? Why would 2 of 5 not be?
   Candidates to check, don't assume: already-dead models mixed
   with alive; models off-screen/occluded; a click-target sizing
   or z-index issue; a state mismatch between the two clients.
2. #5's reload-fixes-it: is confirm-removal reading stale local
   state instead of a fresh Firebase read/transaction? The
   terrain-deadlock bug earlier this project was exactly this —
   a stale snapshot fixed with a real transaction. Check if the
   same pattern applies here.

Report root cause before fixing. If #12 and #5 are separate
bugs, say so.

## Fix
- Every model that must be selectable for removal IS selectable.
- Confirm works when the required count is reached.
- The game can always proceed — never a dead-end state.
- If it's a stale-state issue, fix with a real Firebase
  read/transaction, matching the terrain-deadlock precedent.

## Out of scope
- The auto-allocate button (separate follow-up brief).
- Blood effects, health display, pile-in — all separate.
- Anything in killteam/.

## Test — two browser contexts, MANDATORY
Single-window testing has shipped bugs here repeatedly. Use two
real contexts (both players).
1. Set up a 5-model unit, wound 1, and have the opponent deal
   enough damage to require removing 4. PASS = all 4 selectable,
   confirm works, game proceeds. FAIL = any model unclickable.
2. Repeat with a full-wipe (all 5 die). PASS = proceeds cleanly.
3. Reproduce #5's exact path (whatever triggers "can't confirm"),
   confirm it no longer needs a reload. PASS = works first time,
   no rejoin.
4. Verify the OTHER client sees the same result — no desync.

## Done when
Commit(s), hashes cited, plus a report:
1. Root cause(s) — one bug or two.
2. What you changed and where.
3. The 4 tests above, each pass/fail with what you saw.
4. Confirmation the game can't dead-end here anymore.
