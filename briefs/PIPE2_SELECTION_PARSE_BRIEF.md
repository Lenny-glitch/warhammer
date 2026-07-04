# PIPE-2 — Derive Squad Size, Points Table, Loadout Slots (40k)

## Orientation
Repo: ~/projects/data-pipeline only. Triggered by roster Phase 0
findings (roster/DEVLOG + ROSTER_3B_PART2_BRIEF.md): BSData
selection structure was never parsed; pointsTable / squadSize /
loadoutSlots don't exist on 40k units. Roster Part 2 is paused on
this. Scope: parse-40k.js + recompile + re-upload the two 40k
factions. KT parsing untouched.

## Goal — exactly three new fields on 40k units
1. squadSize: { min, max }            (absent → fixed size 1... 
   or whatever the datasheet's fixed count is)
2. pointsTable: { "<modelCount>": pts, ... }  — replaces the
   _pointsNote prose flattening. Flat-priced units: single entry.
   Keep base "points" field for compatibility; pointsTable is
   the roster's read target.
3. loadoutSlots: [ { name, count, options: [weaponId, ...] } ]
   — mutually-exclusive alternatives grouped, with how many
   models may take each. Default/fixed equipment stays as-is
   (isDefault: true, not in any slot).
Field shapes must match what roster/index.html already consumes
for hand-authored KT units (unit.squadSize.min/.max ~line 3559,
loadoutSlots ~line 1660) — VERIFY those shapes against the roster
source first and match them exactly; the roster app should not
need to know which pipeline authored the field.

## Source
BSData .cat selection entry groups: constraints (min/max),
selectionEntryGroups (exclusive choices), costs (per-size /
per-model points). This is structured XML — no prose parsing.
The _pointsNote sentences were our own flattening in
extractPoints (line ~314); the structure was always in the
source.

## The fallback rule (contains the known gnarl)
BSData nesting/entryLinks/shared-profiles can defeat clean
derivation. Per unit, per field: if derivation doesn't produce a
confident result, LEAVE the unit's current shape untouched for
that field and add it to output/_underived_40k.txt with a reason
(same philosophy as _unmapped_keywords.txt). Never guess a
squad size or invent a slot. Stragglers get hand-patched via
patches.json or the Unit Creator — report tells us how many
that is. If the straggler count is most of the roster, stop and
report rather than grinding — that would mean the derivation
approach is wrong, not that 60 units need patches.

## Scope guards
- Two factions only (astra-militarum, craftworlds-eldar)
- Three fields only — no detachments, enhancements, abilities,
  wargear beyond weapons
- patches.json entries continue to apply AFTER derivation
  (patches win)
- Recompile + re-upload via --only=astra-militarum,craftworlds-eldar
  (dry-run first, usual gates)
- Talos (0 weapons) and any other _known_gaps entries: expected
  in _underived, not fixed here

## Done when
- Both factions recompiled; report: units fully derived vs
  per-field fallbacks, with _underived_40k.txt reasons
- Spot-check in report: Cadian Shock Troops shows a real
  pointsTable (both sizes), squadSize, and its 8 weapons sorted
  into slots vs fixed — this is the acceptance unit since Phase 0
  documented its current mess
- Firebase re-uploaded (--only), verified
- Roster Part 2 unpauses with real data; Nox notified which
  units (if any) need hand-patching
