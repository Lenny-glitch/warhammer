# BUG — Only 1 of 5 Authored Factions Has Validation Rules

CLAIMED: 2026-07-16

## Orientation
Monorepo, roster/ + data-pipeline/. Claim first. PRIORITY 1 —
roster is Nox's top lane right now.

## Symptom (Nox, live, post-deploy)
ROSTER-VAL authored composition rules for FIVE factions:
Legionaries, Kommandos, Kasrkin, Pathfinders, Vespid Stingwings.
In the live app, ONLY Kommandos shows validation (red/green
banner works correctly, including bomb-squig counting as 0.5 via
countsAs). The other four show no validation at all.
The machinery is fine — Kommandos proves the whole path works
end to end. The DATA didn't land for the other four.

## Task
1. Check Firebase directly for all five factions: does
   info.compositionRules exist and what's in it? (Kommandos =
   the known-good reference shape.) Report per faction.
2. Root-cause the difference. Candidates worth checking, not
   guessing between: extraction produced nothing for those four
   (why? leader categoryLink missing? different BSData shape?),
   upload skipped them (skip-if-exists? --only scoping?), path
   differs, or the authoring run partially failed silently.
   Whatever it is, the fact that it FAILED SILENTLY is itself a
   bug — the authoring step should fail loud when a requested
   faction produces no rules.
3. Fix, re-author all five, verify all five live in Firebase
   against the Kommandos reference shape.
4. While you're in there: report how many of the 47 KT factions
   COULD be auto-authored with the same extraction (i.e. how
   many have the leader categoryLink + parseable team size). If
   it's most of them, say so — Nox will likely want the whole
   catalogue authored rather than five hand-picked factions.

## Done when
- All five factions show live validation in the app (Nox will
  verify with an illegal roster per faction)
- Silent-failure path fixed: authoring reports what it wrote
  and fails loud on a requested-but-empty faction
- Coverage number reported for the other 42 factions
- DEVLOG, hashes; Nox pushes + redeploys
