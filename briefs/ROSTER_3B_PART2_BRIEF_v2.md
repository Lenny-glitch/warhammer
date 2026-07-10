# Roster 3b Part 2 v2 — 40k Build Flow (hand-authored composition)

## Orientation
Repo: ~/projects/roster, master. Supersedes ROSTER_3B_PART2_BRIEF.md
and PIPE2_SELECTION_PARSE_BRIEF.md entirely. PIPE-2's derivation
approach is REJECTED per the prototype findings (25% coverage,
slot-vs-variant ambiguity that corrupts silently) — do not revisit.
No pipeline changes in this brief. Out of scope: killteam/ (BON-2a
next there), warhammer40k/, data-pipeline/ beyond reading.

## The decision this is built on
Composition data (squadSize, loadoutOptions) is edition-stable →
hand-authored, lazily, at the moment a unit first enters the
confirmed library (Part 1's existing lazy-migration hook), via the
existing Unit Creator. Points are volatile → stay pipeline-sourced
(flat base points now; a hand pointsTable entry is allowed where
the _pointsNote price matters to Nox). Nobody authors 83 units;
Nox authors the units he actually rosters, when he rosters them.
Same policy applies to BSData KT factions later (PIPE-3 cancelled).

## Field shapes (per your verification — code wins over brief)
- squadSize: { min, max } (existing shape, unchanged)
- loadoutOptions: [ { slot, weaponIds } ], count added as an
  additive optional key (existing parsers ignore unknown keys —
  verify UnitForm._populate really does before relying on it)
- pointsTable: { "<modelCount>": pts } — NEW optional field; if
  absent, flat points is the price. Confirm nothing existing
  chokes on an unknown field here too.

## Scope
1. Lazy-authoring hook: when a 40k unit is first migrated into
   the confirmed library, if it lacks squadSize/loadoutOptions,
   surface the Unit Creator (or an inline slice of it) to fill
   them — skippable ("author later"), in which case the unit
   behaves as today: fixed size, fixed loadout, still rosterable.
   Skipped units are visibly marked in the builder ("composition
   not set") so silence never masquerades as completeness.
2. Build flow: add unit → squad size picker (when squadSize
   exists and min≠max) → live points (pointsTable if present,
   else flat × nothing fancy) → loadout choice per loadoutOptions
   slot → chosenLoadout stored in the SAME field shape the KT
   flow writes (sim contract).
3. _pointsNote renders wherever it exists — it's a caveat, show it.
4. Publish: denormalized export, exports/ pattern, carrying
   chosenLoadout AND weapons' bonuses arrays (verified present on
   40k units — keep them intact through export).
5. Eldar known-gap units (Talos etc.): rosterable without crashing.

## Out of scope
- Composition validation banner ("roster needs X") — next roster
  brief, not this one
- Detachments/enhancements/army rules
- KT flow changes; sim integration (Part 3)
- Any BSData derivation, ever, for composition fields

## Done when
- An Astra Militarum roster built end-to-end: at least one unit
  authored via the lazy hook (squad size + a loadout choice),
  at least one left skipped and visibly marked
- Live points behave; _pointsNote visible where present
- Published export verified: chosenLoadout + bonuses arrays intact
- KT flow regression: build/save a KT roster unchanged
- DEVLOG updated; verified-vs-assumed as usual
