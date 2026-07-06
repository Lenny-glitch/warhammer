# ROSTER-UX-1 — Unit Browser Sections + Cosmetic Batch

CLAIMED: 2026-07-05

## Orientation
Monorepo, roster/. Small UX pass, no data changes, no new
Firebase paths. Can run parallel to killteam work — different
subproject. Claim per CLAUDE.md convention.

## 1 — Unit browser sections (the feature)
Group the unit browser by each unit's existing role field with
section headers (Characters / Battleline / Infantry / Vehicles /
Transports / etc. — use whatever role values actually exist in
the flat pool; report the distinct set found per faction rather
than assuming). Within a section, keep alphabetical. Units with
missing/blank role go in an "Other" section at the bottom — never
hidden. If the role vocabulary turns out to be messy (mixed case,
synonyms), normalize at display time only; do not rewrite data.
Apply to both 40k and KT browsers if KT units carry roles too —
report whether they do.

## 2 — Cosmetic batch (all previously flagged)
- Strip trailing "+" from weapon display names (scrape artifact:
  "Triskele +", "Mirrorswords +") — display-time only
- "12 ops" header label: ops is KT vocabulary; 40k rosters should
  say units/models appropriately
- Publish view: show model count per unit (data already in the
  export)
- Any duplicate weapon-name doubling in unit summary lines
  (ranged/melee profile pairs listing twice)

## Done when
- Browser shows sectioned lists for both factions; distinct role
  values reported
- All four cosmetics fixed; before/after screenshots or concrete
  descriptions in the report
- KT roster regression: browse/build/save unchanged
- Commits cited; Nox pushes

## AMENDMENT 1 (2026-07-05) — add: drafts & published index
New section 3, requested by Nox:
A "My Rosters" view listing all drafts (rosters/) and published
exports (exports/{system}/), both systems — name, faction,
system, points/ops, updated/published date. Actions: open draft
in builder; view published export; DELETE with a confirm step.
Deleting an export is safe for in-flight games (they snapshot at
creation) — verify that claim against game-creation code before
enabling delete, and say so in the report. Deleting a draft is
just a draft delete.
No auth exists — this lists ALL rosters in the database, which
today means Nox's. Fine at current scale; note it in the DEVLOG
as a known future consideration, don't solve it.
