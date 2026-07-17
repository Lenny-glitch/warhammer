# BON-3b — Psychic Powers (extensible catalog)

CLAIMED: 2026-07-16

## Orientation
Monorepo, killteam/ + data-pipeline/ (authoring) + shared/ (if
the schema needs one additive field). Claim first.
Read: briefs/PIPE_40K_INVESTIGATE_REPORT.md Q3 (23 real psychic
actions across 9 of 47 KT factions — that's the source list),
BON-3's just-shipped ploy/condition work (this is the same
machinery, fourth use), BONUS_ENGINE_BRIEF v3 for the schema.

## DESIGN RULING (Nox, final)
"Middle option": REAL NAMES, FACTION-LOCKED, ONE LINE EACH,
DELIBERATELY NOT CARD-ACCURATE. Fidelity of IDENTITY, not of
rules. Nox's brother should read "Balefire" and feel his
sorcerer; he should not need the card to know what it does.
This is the ploy ruling applied to powers — no card-exact
recreation, ever.

## THE EXTENSIBILITY REQUIREMENT (the reason for this brief's
## shape — do not compromise it)
Powers are CATALOG DATA, not code. Adding power #7 later must
be: author one entry in the mapping table, re-upload, done —
no engine change, no killteam/ edit. Prove it at the end by
documenting the exact "how to add a power" recipe in the
DEVLOG (3-5 steps). If your implementation can't meet that,
say so before building, not after.

## 1 — Schema check first (verify, report if divergent)
Powers need: cost {ap:1}, faction lock, target scope+range,
and effects. The existing effect types are mod/flag/condition.
DIRECT DAMAGE may need a new effect type (`damage`, flat value,
appliesTo target). If so: additive extension only, same pattern
as `when` and `appliesTo` were added; resolver minor bump +
tests. If damage can ride an existing type cleanly, do that
instead — your call, state it.

## 2 — Author 6-8 powers (data, through the pipeline)
Pick from the 23 real actions in the Q3 report. Priorities:
- LEGIONARIES first — Nox actually plays it (Balefire Acolyte
  is the worked example)
- Warpcoven / Thousand Sons next — deepest psychic faction
- fill the rest with the mechanically SIMPLEST powers you find
  (damage, a debuff condition, a buff, a free-action effect —
  variety over completeness)
Each entry: real name, faction slug, cost {ap}, one-line
plain-English description that EXACTLY matches its effects
(description = player contract), sensible range, usage limit if
it'd be silly spammed. Reuse conditions where possible (the
stunned/markerlight machinery just shipped) rather than
inventing new state.
Skip anything needing a subsystem we don't have (teleports that
need placement rules, multi-target templates). Note what you
skipped and why — that's the list for a future session.

## 3 — Cast UI
A PSYCHIC operative gets a cast option (action bar/radial, same
place ploys live). Pick power → pick target → resolve through
the existing bonus/condition pipeline. Effects appear in the
dice readout / condition badges like everything else — no
bespoke psychic UI. Non-psychic operatives never see it.

## Out of scope
40k/WHF psychic, Deny/psychic defense, perils, faction-specific
ploys, the other 15+ complex powers (future session, per the
extensibility recipe).

## Done when
- 6-8 powers live, faction-locked, castable in a real game
- Balefire Acolyte casts a real power by name and the effect
  shows in the existing readout/badges
- The "add a power" recipe is documented and REAL (prove it:
  add a trivial 7th power via the recipe alone, then keep or
  drop it)
- DEVLOG, hashes; Nox pushes + redeploys
