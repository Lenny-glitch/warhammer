# BON-1b — Keyword Coverage Addendum

## Session orientation
Working repo: ~/projects/data-pipeline only. This file is the
complete spec; it amends BONUS_ENGINE_BRIEF.md (v3, committed in
this repo). Prior context needed: none beyond those two files.
Out of scope: killteam/, warhammer40k/, warhammer-fantasy/,
age-of-sigmar/, roster/.

## Context
BON-1 shipped clean (15/15 tests, dry-run verified). Nox reviewed
output/_unmapped_keywords.txt. Verdict: the unmapped/unresolved
discipline was correct — nothing was guessed — and this addendum
is the authorization pass for the gaps that were correctly left
unauthorized. Four decisions below. Upload remains gated until
BON-1b's recompile completes, so Firebase gets the better numbers
first time.

Standing design principle (applies here and all future bonus
work): legibility beats rules-as-written fidelity everywhere
players touch rules; determinism of resolution is non-negotiable.
The description field on every catalog entry is the player-facing
contract — the effect must match what the description says.

---

## Decision 1 — "when" vocabulary additions (AUTHORIZED)
Add to the when vocab:
- "halfRange"    — attack made within half the weapon's range
- "noCritScored" — no critical hit was scored in the sequence
Resolver: extend context.facts handling + tests (fact present /
absent, both new values).
Then map:
- Melta x       → mod dmgNormal/dmgCrit per glossary, when halfRange
- Rapid Fire x  → mod atkDice add x, when halfRange
- Severe        → per glossary effect, when noCritScored
(Exact effect shapes come from the glossary text; if a shape
doesn't fit mod/flag cleanly, leave it unmapped with reason —
never-guess still applies.)

## Decision 2 — procedural flags (AUTHORIZED)
These are targeting/procedural rules, same shape as the existing
blast/torrent/silent flags. Add to flag vocab and map:
- Assault        → flag assault
- Pistol         → flag pistol
- Precision      → flag precision
- Brutal         → flag brutal
- Shock          → flag shock
- Hot            → flag hot
- Hazardous      → flag hazardous
- Psychic        → flag psychic
- Extra Attacks  → flag extraAttacks
Flags preserve the rule machine-readably; engines implement flags
when they implement them and safely ignore the rest (existing
passthrough behavior, already tested). Parametric values (e.g.
Shock's, if any) ride alongside as mods only where the glossary
gives a clean number; otherwise flag-only.

## Decision 3 — deferrals (DECIDED, no work now)
Record in a DEFERRED section at the bottom of the mapping table
file so the decision survives:
- Twin-linked, Sustained Hits, Anti-, Lance → BON-4. Real vocab
  gap: 40k's hit/wound split needs wound-side stats KT never
  needed. Decide the vocab when the 40k engine actually reads
  bonuses. Recompile is cheap; nothing is lost by waiting.
- Limited x, One Shot → weapon fire-count is a weapon PROPERTY,
  not a bonus effect. If handled ever, it's parser/schema work on
  the weapon object, not the bonus catalog. Deferred indefinitely.
- All bespoke named abilities in the unresolved list (Soulstrike,
  Headtaker, Blaze, Toxic, Riposte, etc.) → stay as raw display
  strings on the weapon. Working as designed. No action, ever,
  unless a specific one gets hand-authored as a bonus later.

## Decision 4 — parser fixes (BUGS, fix now)
The unresolved list exposed real parse bugs. Fix in the keyword
splitter / glossary matcher:
1. Inch-marks inside parametrics break splitting:
   '1" Devastating 3', '2" Devastating 2', 'Blast 1" Heavy
   (Reposition only)' — the leading distance belongs to the rule
   (Devastating x has a range variant). Splitter must not treat
   the " as a delimiter.
2. Trailing quote artifacts: "Twin Torrent'", "Wreathed'" —
   strip stray quotes before matching.
3. Case-insensitive matching: PSYCHIC, **PSYCHIC* (also strip
   markdown artifacts) should resolve to Psychic.
4. Missing-space parametrics: "Piercing1" → Piercing 1.
5. Unsplit compounds: "Brutal Severe" is two rules — splitter
   missed a delimiter case.
6. Glossary variants: "Heavy (Dash Only)" / "Heavy (Reposition
   only)" — add as aliases of Heavy with the qualifier preserved
   (flag heavy + keep the qualifier string for display).
7. INVESTIGATE FIRST, then fix: "Piercing Crits 2" failed to
   resolve. Piercing Crits x is parametric and 'Piercing Crits 1'
   maps fine — a trailing-value match failing means the parametric
   matcher has a second bug (sibling of the 'Lethal x+' strip bug
   fixed pre-validate-ploys). Find why before patching; report
   what it was.
After fixes, re-audit the unresolved list: every remaining entry
should be a genuine bespoke ability, zero parse artifacts.
"Torrent 0"" and '"Custom"' — classify during the re-audit (data
error vs real rule) and record which.

## Recompile + reporting
- Re-run compile-keywords.js across all 49 files
- Regenerate output/_unmapped_keywords.txt (expect: unmapped
  count drops sharply; unresolved shrinks to bespoke-only)
- Generate output/mapping-review.txt — one row per catalog entry:
  keyword → effect(s) → one plain-English line of what a player
  sees happen. Include the DEFERRED register at the bottom. This
  file is the standing review artifact from now on; regenerate it
  on every compile.
- Report before/after numbers: mapped / unmapped / unresolved /
  catalog size.

## Done when
- Resolver tests pass incl. new when values (17+/17+)
- Parser fixes in, Piercing Crits 2 root cause reported
- Recompile done, before/after numbers reported
- mapping-review.txt exists and reads clean
- Upload still NOT run — Nox skims mapping-review.txt, then runs
  the bonus catalog upload AND the unit data upload in one
  sitting.

## Out of scope
- Any wound-split vocab (BON-4)
- Condition state, UI, game-app integration (BON-2/3)
- Live Firebase writes
