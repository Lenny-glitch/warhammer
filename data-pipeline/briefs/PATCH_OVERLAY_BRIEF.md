# Post-Upload Cleanup — Patch Overlay + Roster Repair

## Orientation
Two repos this time: ~/projects/data-pipeline (Part 1) and
~/projects/roster (Part 2). Small scope, no new systems.

## Context
The full upload succeeded and the overwrite of the 7 scraper-era
KT factions + astra-militarum was the intended end-state. Two
manual countsAs corrections were lost because they existed only
in the live DB — never recorded upstream. Root cause: no home for
hand-corrections in the pipeline. Fix the home, not just the data.

## Part 1 — patch overlay (data-pipeline)
1. Create parsers/patches.json:
   [
     { "system": "kill-team", "faction": "tau-pathfinders",
       "unit": "mb3-recon-drone", "field": "countsAs",
       "value": 2, "reason": "counts as two operatives for
       roster size (manual correction, pre-dates pipeline)" },
     { "system": "kill-team", "faction": "ork-kommandos",
       "unit": "bomb-squig", "field": "countsAs", "value": 0.5,
       "reason": "counts as half an operative (manual
       correction, pre-dates pipeline)" }
   ]
2. Apply step runs at compile time, after parse, before output:
   every patch must match an existing unit or the compile FAILS
   loudly (a patch that stops matching means BSData renamed
   something — that must surface, not silently drop).
3. Log applied patches in the compile output + a PATCHES section
   in mapping-review.txt so they're visible in the standing
   artifact.
4. Recompile, re-upload ONLY tau-pathfinders and ork-kommandos
   (dry-run first, YES gates as usual). Verify countsAs present
   on both units in Firebase after.
Rule going forward (record in data-pipeline README or DEVLOG):
NO hand-edits to gameData/ in Firebase, ever. Every correction is
a patches.json entry. The pipeline is the only writer.

## Part 2 — roster repair (roster repo)
rosters/ is permission-locked from pipeline scripts by design —
the Draft Cleaner runs inside the roster app (authenticated
client), not from node. Run it from the app against the 7
overwritten KT factions + astra-militarum. Expected: draft
rosters referencing old scraper IDs (boss-nob-001 style) get
remapped to clean slugs, same as the original migration.
Published exports are denormalized and unaffected — verify one
as a spot check anyway.
If the Draft Cleaner's ID-mapping table was scraper-migration
specific, extend it with the new old→new pairs rather than
rebuilding it.

## Guard note (decide, tiny)
uploadKtFaction's skip-if-exists checks .../info, which only
new-pipeline data has — that's why old scraper factions were
overwritten despite the guard. Since the pipeline is now
authoritative, recommend: replace skip-if-exists with an explicit
pre-upload manifest ("these N factions exist and WILL be
overwritten, type YES") instead of a silent skip. Skipping was
protecting data we no longer want protected.

## Done when
- patches.json exists, apply step fails-loud on unmatched patch
  (test it with a deliberately bad entry, then remove it)
- Both countsAs values live in Firebase again, via pipeline
- Draft Cleaner run reported: how many rosters touched/repaired
- Guard decision implemented or explicitly deferred with reason
