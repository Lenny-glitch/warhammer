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

## AMENDMENT 1 (2026-07-10) — 4a checkpoint findings
Checkpoint partial results: Magic pass-through CONFIRMED working.
Shooting resolution CONFIRMED mathematically correct (10 shots /
2 hit on 6s / 0 wounds / 0 casualties = right answer, zero
drama). Still to test before 4a closes: casualties actually
falling (Handgunners point-blank into Bowmen — rear-rank removal
per the RAW correction) and Stand-and-Shoot thinning a charger.

New items from play:
6 — UNIT OVERLAP PREVENTION: regiments can currently move
    through/onto each other. This is CORE RULES, not polish —
    ranks/flanks/charges all assume solid bodies. Becomes
    requirement #1 of the movement brief (item 1), ahead of the
    UX work.
7 — Shot feedback: volley needs visible fire (arrow/tracer
    lines KT-style but period — arcing arrows, powder smoke),
    an outcome moment (dice/summary that reads at the board, not
    only the side panel), and casualty removal that is SEEN
    (models fall/fade, not silently decrement). Bundles with
    item 2 (wound display).
8 — Entry point: whf.html is canonical but unguessable. Rename
    to index.html or add redirect stub; document. One-liner,
    attach to any next WHF commit.

## AMENDMENT 2 (2026-07-10) — casualties confirmed, gap narrowed
Casualty cycle CONFIRMED in play: 2 unsaved → 2 models removed,
rear rank, count updated. Also confirmed working unprompted:
1" enemy-proximity rule, handgun move-or-fire restriction.
- Item 6 NARROWED: enemy overlap is already prevented (1" rule);
  the gap is FRIENDLY units moving through/onto each other only.
9 — Range indicators: KT-style range visualization — movement
    reach, shooting range (and casting range when magic exists)
    shown on the board when a unit is selected/acting. Bundles
    naturally with item 1's movement-cost preview; the shooting
    circle should land with item 7's shot feedback.
Remaining before 4a closes: ONE test — a charge where
Stand-and-Shoot visibly thins the charger before contact.

## AMENDMENT 3 (2026-07-11) — WHF-5m playtest: 8/8, one correction
Passed 8/8 with one design correction (movement cost pricing —
became WHF-5m.1, see WHF5M1_MOVEMENT_PATCH.md) and one more
controls-visibility ask (below). Confirmed positives worth
recording: overlap rejection reads clearly via the ghost-blink
(both move AND wheel), the ENGAGED highlight lands, and the
unit-label/movement-bar numbers are trusted at the table — no
complaints about legibility of the numbers themselves, only
about the OLD accumulation-not-net cost model (item 1 in
WHF5M1_MOVEMENT_PATCH.md) and controls discovery (below).

10 — Movement animation, ALL THREE GAMES (Nox verbatim): click
     move → model/unit animates A→B with a dust puff +
     walk/drive/clank audio cue. Late priority — an atmosphere
     win once core mechanics settle, not a legibility fix. Applies
     across warhammer-fantasy, warhammer40k, and killteam, not
     just this project — flag to whichever AI/session picks it up
     for any of the three, not WHF-only scope.
