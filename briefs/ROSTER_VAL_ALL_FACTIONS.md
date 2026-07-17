# ROSTER-VAL-ALL — Author Composition Rules for the Whole KT Catalogue

CLAIMED: 2026-07-16

## Orientation
Monorepo, data-pipeline/ (+ Firebase upload). Claim first.
Follow-up to BUG_ROSTER_VAL_FACTIONS's coverage finding: 42 of
47 KT factions are auto-authorable TODAY with zero parser work
(parseable team size + detected leader role). The 5 hand-picked
factions were the wrong scope — do the catalogue.

## 1 — Author the 42
Run the existing extraction across all auto-authorable factions,
upload with the usual gates. Same shape as Kommandos (the
known-good reference, verified live). The upload's new fail-loud
behavior should surface anything that goes wrong per-faction —
that's what it's for.

## 2 — The 5 gap factions
- missing leader detection: strike-force-variel, warpcoven
- missing team size: chaos-cult, elucidian-starstriders,
  gellerpox-infected
For each: report WHY (different BSData shape? genuinely absent
in source?) and propose the cheapest honest fix — a patches.json
entry with the real 2024 value is fine if the data simply isn't
in BSData, but flag each value for Nox to verify against cards.
Do NOT guess a team size or invent a leader. If a fix is
obvious and safe, do it; if it needs a real rules decision, list
it and stop.

## 3 — Report
Per-faction table: authored / gap+reason / any value that needed
a hand-supplied number (flagged for Nox's card check).

## Done when
- 42+ factions show live validation; Nox spot-checks 2-3 he
  hasn't tested (build an illegal roster, banner names it)
- The 5 gaps are either fixed-and-flagged or documented with a
  proposal
- DEVLOG, hashes; Nox pushes + redeploys
