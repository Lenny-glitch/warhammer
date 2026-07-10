# WHF UX Backlog — Nox playtest findings, 2026-07-10
# Save to briefs/. Item 0 is a WHF-4a rider; the rest are queued
# design direction, NOT current scope. Do not fold into 4a.

## 0 — RIDER ON WHF-4a (required for its own acceptance)
The phase tracker hard-stops at MAGIC: no implementation, no
exit. Shooting is unreachable, so 4a cannot be accepted as-is.
Fix inside 4a: Magic becomes an explicit pass-through — an
"End Magic Phase" button (or auto-advance with a one-line
"Magic — not yet implemented, skipping" log entry). Do NOT build
any magic mechanics. Same treatment for any other phase the
tracker can reach that has no content yet.

## Playtest verdict worth recording
Movement dynamics land: individual-model feel is maintained
while moving as regiments — the core WHF-1 geometry bet paid
off. The items below are polish on a working foundation.

## 1 — Movement UX (largest item)
Keyboard-arrow movement + wheeling works but is clunky. Wanted:
- A movement-points bar: total M, spent so far, live cost
  preview of the wheel/move being lined up, remaining
- Undo move (revert the selected unit to its pre-move position/
  facing within the Movement phase; cleared at phase end)
- Likely direction: mouse-driven ghost-preview movement (drag or
  click-target with the ghost showing final position + cost)
  over pure keyboard — decide when scoped, keyboard stays as
  fallback either way

## 2 — Wound display: "medieval health arc"
KT's per-operative health arc reads better than whatever WHF
shows today. Port the concept with medieval dressing (shield/
banner motif rather than sci-fi arc — aesthetic call at design
time). Per-MODEL wounds matter less in WHF (most models are 1W);
the regiment-level display (models alive / ranks, characters'
multi-wound state) is the real target.

## 3 — Controls visibility
Current controls are discoverable only from the footer hint
line. Wanted: visible on-screen action affordances per phase,
same lesson as KT's action bar (Engage/Move/Dash/Shoot buttons).

## 4 — Unit cards + player view parity
The full pass KT and 40k got: proper unit cards (stats, weapons,
special rules — the side panel exists but needs the treatment),
and the two-player view/turn-flow polish. Big item, its own
phase after core mechanics (roughly the KT-2-era work, WHF
edition).

## 5 — Aesthetic: lean harder medieval
Grimdark base stays (locked decision) but push medieval within
it: heraldry, parchment/ink textures, banner iconography,
period-appropriate type accents. Direction, not a spec — collect
into the unit-card pass (item 4) where it'll matter most.

## Sequencing recommendation (planner's)
0 rides 4a now. 1 (movement UX) is the next standalone
WHF brief after the 4a checkpoint — it touches what players do
most. 2+3 bundle after that. 4+5 are one combined phase later,
post-core-mechanics. Nothing here before 4a's checkpoint passes.
