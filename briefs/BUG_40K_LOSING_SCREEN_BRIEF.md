# BUG-40K-LOSING-SCREEN — Loser sees VICTORY instead of defeat

CLAIMED: 2026-07-19

## Orientation
Monorepo, ~/projects/warhammer, branch master. CLAIM FIRST.
Touch ONLY warhammer40k/. Parallel session may own killteam/.
You cannot push — commit, cite hashes, Nox pushes.
VERIFY-FIRST: from a live playtest. Check against real code,
report divergence.

## Why — game-end is showing the wrong result to the loser
Live 40k playtest, elimination win. BOTH players saw the same
"VICTORY / <winner name> / <loser> has been eliminated" screen.
The LOSER should see a defeat screen, not victory. Confirmed with
two browser windows — both rendered VICTORY identically.

The end-state exists and fires (the game correctly detects a
winner and ends). The bug is PERSPECTIVE: the screen is rendered
from the winner's point of view for both clients, instead of each
client rendering relative to whether THEY won or lost.

## Investigate first
Find where the 40k game-over screen renders. The likely bug: it
reads "who won" but not "am I the winner" — it shows the winner's
victory text unconditionally, rather than comparing the winner to
the local viewer's own player/faction identity.

Cross-check: KT shipped an elimination screen recently
(KT-ELIMINATION-MODE) with SLAYED/MURDERED/tie variants that
render correctly per-viewer. 40k may have:
  (a) copied KT's screen but broke the per-viewer check, or
  (b) have its own older screen that never had one.
Report which. If KT's logic is correct and 40k's isn't, the fix
may be as simple as matching KT's per-viewer comparison. (Do NOT
edit KT — just read it for the correct pattern.)

## Fix
Each client renders game-over relative to ITS OWN player:
- Winner's client: victory screen.
- Loser's client: defeat screen (match the app's existing
  defeat wording/style — if 40k has none, mirror KT's
  MURDERED/defeat presentation in 40k's own style).
- If a draw/mutual-wipe state exists, it shows the tie result to
  both (verify 40k even has this path; KT does).
Both clients read from the SAME game-end state (the winner is
already agreed in state — determinism is fine), they just render
DIFFERENT views of it based on local identity.

## Watch
- The "am I the winner" check must use whatever identity the rest
  of 40k already uses to tell the two players apart (the same
  thing that makes "YOU ARE ELDAR" show correctly). Reuse it,
  don't invent a new identity concept.
- Don't touch the win-DETECTION logic (that works — a winner is
  correctly found). Only the RENDER perspective is wrong.

## Out of scope
- Auto-allocate forever-load bug (separate, next brief).
- The back-first allocation rule (separate, next brief).
- Killteam.

## Test — two browser contexts, MANDATORY (this bug only appears
## with two real viewers)
1. Play to an elimination win. PASS = winner's window shows
   victory, loser's window shows defeat. FAIL = both show the
   same thing.
2. Confirm both windows agree on WHO won (winner name matches),
   even though the verdict differs. PASS = consistent winner,
   correct per-side verdict.
3. If a mutual-wipe/draw path exists, force it. PASS = both see
   the tie result.

## Done when
Commit(s), hash(es) cited, plus a report:
1. Root cause: was it a broken copy of KT's screen, or a 40k
   screen that never had per-viewer logic?
2. What you changed.
3. The tests above, pass/fail with what you saw in EACH window.
