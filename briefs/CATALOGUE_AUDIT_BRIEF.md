# CAT-AUDIT — KT Catalogue Weapon/Unit Completeness Sweep

CLAIMED: 2026-07-12

## Orientation
Monorepo, data-pipeline/ (+ Firebase re-upload). Claim first.
Playtest 4 surfaced an epidemic: many operatives have NO
weapons or no melee default (Blessed Blade, Watchmaster, Navis
Sergeant-At-Arms all show empty loadouts); "Astra Militarum" KT
faction shows ONE unit. This blocks correct combat AND makes
ROSTER-VAL's check step meaningless until fixed.

## 1 — Audit (report before fixing)
Sweep all 47 KT factions in the parsed data:
- operatives with ZERO weapons (can't fight/shoot at all)
- operatives with no MELEE weapon (can they ever Fight?)
- factions with suspiciously few units (AM = 1; list any < ~4)
Report counts per faction. Nox's suspicion worth checking:
weapons whose name matches the unit/ability name (Blessed
Blade) may be getting dropped by a name-collision in the parse.

## 2 — Root-cause, don't blanket-patch
For the empty-weapon cases, determine WHY per pattern:
- name-collision parse drop → fix the parser, recompile
- genuinely absent in BSData source → patches.json entry with a
  sensible default (every operative needs at least a basic
  melee — a "fists"/"close combat weapon" default is the KT
  convention for otherwise-unarmed models)
- sparse faction (AM one-unit) → is it a real sub-team or a
  broken catalogue? If broken, fix or hide from FactionPicker
  (coordinate with ROSTER-VAL's Phase 0, same question).
Never invent weapon stats; defaults use the standard unarmed/
close-combat profile, flagged in the report for Nox.

## 3 — Ship
Recompile, dry-run, gated re-upload (--only affected factions or
--force catalog as needed). Snapshot rule protects live games.
Report before/after: empty-weapon count to zero (or documented
exceptions).

## Done when
Audit report delivered; root causes fixed at the right layer;
no operative in any faction has zero weapons (or exceptions
documented); AM mystery resolved; re-upload verified. DEVLOG,
hashes; Nox pushes.
