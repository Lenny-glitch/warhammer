# 40K-AUTO-ALLOCATE — One-click wound allocation button

## Orientation
Monorepo, ~/projects/warhammer, branch master. CLAIM FIRST.
Touch ONLY warhammer40k/. Parallel session may own killteam/.
You cannot push — commit, cite hashes, Nox pushes.
VERIFY-FIRST: check claims against real code, report divergence.

## Why
Manual casualty allocation now works (6981b0b fixed the click-
lock). But allocating one model at a time is tedious, especially
for big units. Add a button that allocates all pending wounds at
once, following a sensible order, so the player can skip the
manual clicking when they don't care to micro it.

Manual allocation STAYS — this is an optional shortcut, not a
replacement. Player can still hand-pick if they want.

## Trigger
A button (e.g. "Auto-Allocate") visible during the casualty-
allocation step, alongside the existing manual flow. Clicking it
resolves ALL pending wounds for that unit in one go, then behaves
exactly as if the player had manually selected those models
(same confirm/write path — do not create a parallel removal
system).

## Allocation order (this is the rule — RAW-correct and cheap)
Real 40k: the controlling player picks, BUT an already-wounded
model must finish taking wounds before a fresh one starts. Auto-
allocate encodes a sensible default:

1. FIRST: any model already wounded (partial W) — finish it off
   before touching a fresh model. (This part is RAW-mandatory.)
2. THEN: plain/basic models before leaders and special-weapon
   models.
3. LAST: leaders and special-weapon / heavy-weapon models.

Within a tier, order doesn't matter — pick any.

Determining "leader / special": check what the unit data
actually exposes. There may be a role/keyword/weapon flag that
marks a model as leader or special-weapon-carrier. VERIFY what's
available before relying on it — if there's no clean signal,
report that and fall back to "wounded-first, then any" rather
than inventing a classification. Don't guess a model is special.

## Determinism
Both clients must agree on the outcome. If auto-allocate has any
randomness (it shouldn't — the order above is deterministic),
that's a bug. Same models die on both screens. Route through the
same Firebase write the manual path uses.

## Out of scope
- Changing manual allocation (leave it working as-is).
- Killteam (may be a nice follow-up later, not now).
- Any wound/damage math changes — this only chooses WHICH models
  take already-computed wounds.

## Test — two browser contexts for the determinism check
1. Unit of 5, several wounds pending, one model already wounded.
   Click auto-allocate. PASS = wounded model dies first, then
   plain troopers, leader/special last; count is correct;
   confirm works.
2. Same scenario, check the OTHER client: same models dead, no
   desync. PASS = identical both sides.
3. Manual allocation still works when you DON'T click auto. PASS
   = unchanged.
4. Edge: wounds >= unit size (full wipe) via auto-allocate. PASS
   = whole unit removed cleanly, game proceeds.

## Done when
Commit(s), hashes cited, plus a report:
1. What signal you used to identify leader/special models (or
   that none existed and you fell back).
2. The 4 tests, pass/fail with what you saw.
3. Confirmation manual allocation is untouched and both paths use
   the same write.
