# BUG — Critical Blockers + The Cache Discovery

CLAIMED: 2026-07-17

## Orientation
Monorepo. Claim first. From back-to-back brother games (40k and
KT). Item 1 may be the ROOT CAUSE of several "fixed but still
broken" reports — do it first and re-test everything after.

## 1 — FIREBASE HOSTING CACHE (do this first, suspect #1)
Nox's brother played KT: selection broke. Retried in a PRIVATE
BROWSER: worked. That's stale cached JS — Firebase Hosting's
default cache headers are aggressive, so deployed fixes don't
reach returning players. This plausibly explains a string of
phantom bugs (selection "returning," guns "starting to work
again," a roster needing a hard refresh).
Fix in firebase.json hosting headers:
- index.html and any HTML: Cache-Control: no-cache (must
  revalidate every load)
- JS/CSS: either no-cache too (simplest, these are small apps),
  or content-hashed filenames + long cache (only if trivial)
Verify: deploy, load the live site in a normal browser that has
an old version cached, confirm it picks up new code WITHOUT a
hard refresh. Report the headers before/after.
THEN: re-test the "known" bugs below in a normal browser —
some may already be fixed and were only ever cache ghosts.

## 2 — 40k: dead models block the command phase (blocker)
Brother could not advance: the phase requires selecting/acting
with units, and KILLED models still appear selectable/required.
Dead/destroyed units must be excluded from any phase-advance
requirement and from selection. Audit EVERY phase for the same
assumption (WHF had the identical class of bug with engaged
units — see warhammer-fantasy DEVLOG Phase 8+ / BUG_WHF_TURNLOOP).

## 3 — KT: terrain placement deadlock (blocker)
Both players waited for the other to finish placing terrain;
game stopped. This is EXACTLY the 40k bug already fixed in
BUG_40K_PREGAME item 1 (alternating pass-turn → simultaneous
placement + per-player "done" confirmation). Port that fix to
killteam/.

## 4 — KT: player 2 can't select Night Lords ranged weapons
(blocker) Game broke. Reproduce with a Nemesis Claw / Night
Lords roster; suspect data (weapon shape) or the weapon-picker
submenu from KT-3. Report root cause.

## 5 — Data: weapon stats showing as "?"
Nox's screenshot: a unit card reading "Rng ? A ? BS ? S ? AP 0
D ?" — a 40k weapon with missing/unparsed stats. Find which
unit/weapon, root-cause (flat pool gap? key mismatch after the
publish sanitizer?), report. Don't fabricate stats.

## 6 — KT selection bug, AGAIN (re-test after item 1)
"It won't let me click on my dudes" after round 1; clicking the
sidebar name selects but can't move. Same symptom family as
PT1/PT2, both of which were fixed and verified. TEST AFTER THE
CACHE FIX before investigating — if it's a ghost, say so.
If real: two browser contexts, real Playwright, reproduce.

## Done when
- Cache headers fixed and verified live (this is the deliverable
  that matters most)
- Dead models don't block 40k phases; KT terrain is simultaneous
- Night Lords weapons selectable; "?" stats root-caused
- Selection re-tested post-cache and either fixed or reported as
  a real, reproduced bug
- DEVLOG, hashes; Nox pushes + redeploys
