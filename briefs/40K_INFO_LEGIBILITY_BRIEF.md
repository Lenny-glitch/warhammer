# 40K-INFO-LEGIBILITY — Always-visible health + army-at-a-glance

CLAIMED: 2026-07-18

## Orientation
Monorepo, ~/projects/warhammer, branch master. CLAIM FIRST.
Touch ONLY warhammer40k/. Parallel session may own data-pipeline
or killteam. You cannot push — commit, cite hashes, Nox pushes.
VERIFY-FIRST: from Nox's playtest. Check against real code,
report divergence. Two items, commit each separately.

Both items are the same theme (priority 3: LEGIBILITY IS
CORRECTNESS — "told not shown" is the project's #1 complaint) and
both should be cheap: the info already exists, it's just not
shown well. If either turns out to be much bigger than "surface
existing data," STOP and report before building — don't silently
expand scope.

## Item 1 — Health visible when FULL, not just when damaged (#10)
Symptom (Nox): health/wounds show once a model is damaged, but a
full-health model shows nothing — so the opponent can't tell how
tough a model is at a glance (a 13-wound Leman Russ looks the
same as a 1-wound trooper until it's already hurt).

Investigate: find where the health/wound display is gated on
"damaged". Likely a conditional like "if currentW < maxW, show
bar". 
Fix: show the health indicator at full health too. A full model
reads as full (e.g. full bar / "13/13"), not blank.

Watch:
- Don't clutter — KT already has a wound-arc style; MATCH the
  existing 40k health presentation, just remove the damaged-only
  gate. Don't invent a new widget.
- Both players should see enemy toughness (that's the point — Nox
  said "so enemy can see how tough a model is"). Confirm the
  indicator is visible to the opponent, not just the owner.
- Big multi-wound models (vehicles) matter most here; make sure
  they read clearly.

Test (solo, one browser fine):
1. Fresh unit, no damage. PASS = health shows at full. FAIL =
   blank until hit.
2. Damage it. PASS = updates as before, no regression.
3. A 1-wound model and a 13-wound model side by side read
   differently at full health. PASS = you can tell them apart.

## Item 2 — Army-at-a-glance (#3)
Symptom (Nox): hover info + token size-by-keyword help a lot, but
it's still hard to tell what the OPPONENT is fielding at a glance
— you have to hover piece by piece.

This one is more open — INVESTIGATE AND PROPOSE before building.
Read how the enemy force is currently presented (token colors,
sizes, the unit list panel — does the opponent's list show?).
Then pick the cheapest change that most improves "what am I up
against" readability. Candidates (your call, justify it):
- Show the opponent's unit LIST (names + model counts) the way
  the player sees their own, if it isn't already.
- A per-unit label/tag on the board (unit name on hover-group, or
  a small always-on label).
- Color/icon by unit TYPE (infantry / vehicle / monster) beyond
  just size.

Constraints:
- Cheapest-first. This is a legibility nicety, not a feature arc.
  If your best idea is big, propose it and STOP rather than
  building it — Nox decides scope.
- Don't leak hidden info that shouldn't be visible (if there's
  any fog-of-war / hidden-deployment concept, respect it; verify
  whether one exists).
- Match existing UI style.

Test (solo):
- Whatever you build, the test is: can you tell what the opponent
  is fielding faster than before, without hovering every token?
  Describe the before/after.

## Out of scope
- Blood effects, laser animations, pile-in (separate feature
  wave).
- Killeam, data-pipeline.
- Model art.

## Done when
Commit(s) (one per item), hashes cited, plus a report:
1. Item 1: what gate you removed, the 3 tests pass/fail.
2. Item 2: what you investigated, what you chose and WHY (or what
   you propose + why you stopped), before/after readability.
3. Anything that turned out bigger than expected.
