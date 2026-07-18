# BUG-40K-BOARD-BATCH — Three board interaction fixes

CLAIMED: 2026-07-18

## Orientation
Monorepo, ~/projects/warhammer, branch master. CLAIM FIRST.
Touch ONLY warhammer40k/. Parallel session may own killteam/.
You cannot push — commit, cite hashes, Nox pushes.
VERIFY-FIRST: from Nox's playtest, not source. Check each claim
against real code, report divergence. Do the three items in
order; commit each separately so they can be reverted alone.

## Item 1 — Target-click occlusion (known landmine)
The casualty-lock fix (6981b0b) replaced a single-element
closest() lookup with document.elementsFromPoint() to walk the
z-stack. That lane flagged: the shooting/charge TARGET-click
handler right next to it has the IDENTICAL single-closest()
pattern and the same occlusion risk — a target token behind
another can't be clicked. No symptom reported yet; fixing pre-emptively.

Fix: apply the same elementsFromPoint() z-stack walk to the
target-click handler. Match the pattern the casualty fix already
established — don't invent a new one.

Test (solo, one browser is fine for this item):
1. Stack/overlap two enemy tokens so one is behind the other.
   Try to target the BACK one. PASS = selectable. FAIL = the
   front one steals the click.
2. Normal un-stacked targeting still works. PASS = unchanged.

## Item 2 — Units stack on placement (#1)
During deployment/placement, models can be dropped onto the same
square, overlapping. They should not be able to occupy the same
space.

Investigate first: is there any collision/spacing check on
placement at all, or none? Report which. There may already be
one for movement that placement skips.

Fix: placement rejects or nudges a drop that would overlap an
existing model. Match whatever collision rule movement already
uses if one exists — don't write a second, different rule.

Test (solo):
1. Try to place two models on the same square. PASS = blocked or
   auto-nudged apart. FAIL = they overlap.
2. Placing normally with space still works. PASS = unchanged.

## Item 3 — Individual moves snap to formation (#8)
Nox moved Stormlord's models individually; after accepting the
move, they re-formed as if shift-click/formation-moved — the
individual positions were lost.

Investigate first: find where an accepted move writes final
positions. Something is overwriting per-model positions with a
formation layout on confirm. Report the mechanism before fixing.

Fix: an individual move preserves each model's actual placed
position. Formation/shift-move behavior (if intentional
elsewhere) stays for that path only — don't break it, just stop
it applying to individual moves.

Test (solo):
1. Move 3+ models of one unit to distinct, non-formation spots.
   Accept. PASS = they stay where you put them. FAIL = they snap
   to a formation.
2. If a deliberate formation-move path exists, confirm it still
   forms up. PASS = unchanged.

## Out of scope
- Auto-allocate wound button (separate follow-up).
- Blood, lasers, health display, pile-in (feature wave, later).
- Anything in killteam/.

## Done when
Three commits (one per item), hashes cited, plus a report:
1. Per item: root cause / what you changed / the tests pass-fail.
2. Any divergence from the brief's assumptions.
3. Flag anything you found nearby that's out of scope but risky
   (like the last lane did — that flag is why item 1 exists).
