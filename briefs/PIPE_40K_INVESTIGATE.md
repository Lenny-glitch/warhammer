# PIPE-INV — 40k Faction Expansion + Psychic Content Audit
# CLAIMED: 2026-07-14

## Orientation
Monorepo, data-pipeline/. Claim first. INVESTIGATION ONLY —
produce a report, change no data, upload nothing, decide
nothing. Nox decides from the report.

## Background (the actual question)
40k canonical unit data = the old flat pool
(gameData/warhammer-40k/{slug}) — has squadSize + pointsTable,
but only TWO factions (astra-militarum, craftworlds-eldar).
BSData has EVERY 40k faction but no derivable composition
(PIPE-2 proved ~25% coverage, rejected). Nox wants more
factions playable. Roster Part 2 built a lazy hand-author hook
(Unit Creator, on demand) that could fill composition per-unit
as he actually fields them.

## Q1 — What's in BSData 40k today?
List the factions available in the BSData 40k repo. For 2-3
sample factions Nox would plausibly want (Space Marines,
Necrons, Tyranids — pick sensible ones), run parse-40k.js
as-is and report: does it run clean? how many units? what
comes through (stats, weapons, keywords) and what's missing
(squadSize, pointsTable, loadoutOptions — expected absent)?

## Q2 — The two-sources problem (the real decision)
If BSData factions get added, 40k would have units from TWO
sources: flat pool (AM/Eldar, with composition) and BSData
(everything else, needing hand-authored composition). This
project has purged two-sources-of-truth three times and it
always ended badly.
Report the options honestly, with real costs:
(a) add BSData factions alongside the flat pool, accept two
    sources, lazy-author composition per unit as Nox fields it
(b) migrate: move the flat pool's composition data ONTO
    BSData-parsed AM/Eldar units, making BSData the single
    40k source. How hard? Do the units even match up by
    name/id? Report the mapping success rate for a sample.
(c) something better you see from the code
Recommend one. Do not implement.

## Q3 — Psychic content audit (folds in — same data question)
Nox's brother wants "psych" = PSYCHIC POWERS in Kill Team.
Report what psychic content actually exists in the KT BSData:
- which operatives/factions have PSYCHIC keywords or abilities
- are psychic POWERS present as structured data (actions,
  abilities with rules text), or only as the PSYCHIC weapon
  keyword we already map?
- what would a "cast a psychic power" mechanic need that we
  don't have? (This determines whether it's a bonus-engine
  feature or a whole new subsystem.)
Nox's own Balefire Acolyte (Fireblast, Life siphon) is the
worked example — is that ALL psychic is in KT 2024, or are
there real powers we're not seeing?

## Done when
One report: briefs or docs/ as a markdown file, committed.
Q1 facts, Q2 recommendation with costs, Q3 findings. No code
changes, no uploads, no decisions taken.
