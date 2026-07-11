# PIPE-H1 — Pipeline Hygiene Pass (five accumulated fixes)

## Orientation
Monorepo, data-pipeline/ + shared/. One recompile + one gated
re-upload at the end covers all items. In-flight games are safe
(snapshot rule). killteam/ engine changes NOT in scope except
where item 5 notes the one-line resolver change (shared/, not
killteam/).

## 1 — rng extraction gap (the KT-RS finding)
Legionary ranged weapons shipped with no rng value — extraction
missed that faction's format. Sweep ALL 47 KT factions: every
ranged weapon should have rng (number) or null (= unlimited,
deliberate). Report per-faction counts of ranged weapons with
missing rng, find the format the extractor misses, fix, confirm
sweep comes back clean. Distinguish "genuinely no range in
source" from "extractor missed it" — don't paper over the first.

## 2 — stat-key casing (the 0-wounds bug's root)
Legionary units parse with TitleCase stat keys (Move/Save/Wounds)
where every other faction gets UPPERCASE. killteam/ now has a
case-tolerant statVal() defense — keep it — but normalize at the
source: sweep all factions for casing inconsistencies, fix the
parser to emit one casing, report which factions were affected.

## 3 — trigger: weapon keywords fire on any use of the weapon
Design fix, my (planner's) BON-1 gap: keyword bonuses got single
triggers (onShoot OR onFight), but KT weapon rules apply whenever
the weapon attacks. A melee weapon with an onShoot-tagged bonus
can never fire it.
Fix: add "onAttack" to the trigger vocabulary = matches when
context.trigger is onShoot or onFight. One-line eligibility
change in shared/bonus-resolver.js + a test; bump to 1.3.0.
Recompile ALL weapon-keyword bonuses to trigger: "onAttack".
Ploys/auras (BON-3, future) keep specific triggers — this is
keywords only.

## 4 — catalog descriptions are all the literal placeholder
Every entry says "Flavor/reference text only." The KT readout
now generates text from name+effects (canonical for compiled
bonuses — keep). Still backfill real one-line descriptions in
the compile mapping table so the catalog is honest for any other
consumer. Low ceremony: template-generate from effects if hand-
writing 49 lines is silly, but the field stops lying.

## 5 — appliesTo on Piercing entries
BON-1c specced appliesTo:"target" on Piercing 1/2 and Piercing
Crits 1/2; the catalog never got it. The engine routes by stat
name (deliberate, documented, keep) — but data should match its
own schema doc. Set the field in the mapping table.

## Ship
Recompile → dry-run → gated re-upload (units + both bonus
catalogs, --only where sensible). Report before/after: rng
coverage, casing-affected factions, catalog diff summary.
New games pick up fixes; old games keep their snapshots.

## Done when
- Sweeps clean on items 1–2, resolver 1.3.0 tests pass (25+)
- Re-upload done and verified
- Nox creates ONE fresh KT game from the Legionary export and
  shoots: ranged weapon has real range, its keywords appear in
  the ?dev=true readout — this closes the KT-RS/BON-2b shoot
  acceptance that the data gap blocked
