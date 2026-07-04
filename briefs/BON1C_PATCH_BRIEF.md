# BON-1c — Pre-Upload Catalog Patch

## Orientation
Repo: ~/projects/data-pipeline only. Amends BON-1b. Small, surgical:
three mapping fixes + one optional schema field. Upload stays gated
until this recompile.

## Fix 1 — appliesTo field (schema + resolver, v1.2.0)
Optional effect field: "appliesTo": "actor" | "target",
default "actor". resolveStats applies target-directed effects to
target stats (context already carries both). validateBonus accepts
it; unknown values rejected. Tests: one actor-directed, one
target-directed, default behavior unchanged.
Then set appliesTo:"target" on: Piercing 1/2, Piercing Crits 1/2
(defDice), and 40k entries touching defender stats if any.
Bump BONUS_RESOLVER_VERSION to 1.2.0.

## Fix 2 — convert rules (Severe, Rending)
Both change a normal success INTO a crit — gain crit, lose normal.
Remap each as two effects, same "when":
  Severe:  {retainCrit +1, when noCritScored} + {retainNormal -1, when noCritScored}
  Rending: {retainCrit +1, when critScored}  + {retainNormal -1, when critScored}
Punishing stays as-is (converts a fail; correct).
Plain-English lines must say "convert one normal success to a
critical success" — description is the player contract.

## Fix 3 — Stun becomes a condition
Current mapping (-1 apl, implicit instant) is a no-op at attack
time. Remap: {"type":"condition","condition":"stunned","stacks":1,
"max":1,"when":"critScored","appliesTo":"target"}.
Add "stunned" to condition vocab. State tracking stays BON-3
(alongside markerlight). Plain-English: "on a crit, the target is
stunned (-1 APL, resolved in BON-3)."

## Recorded simplifications (no action — do not "fix")
- Ceaseless = Relentless (both rerollAll +1); card-distinct,
  deliberately collapsed, descriptions match shipped effects.
- Distance-variant Devastating (1" Devastating 3 etc.) maps to
  flat Devastating; splash radius dropped. Legibility-first.
Append both to the DEFERRED/notes section of mapping-review.txt.

## Done when
- Resolver 1.2.0, tests pass (21+)
- Recompile, mapping-review.txt regenerated with fixes visible
- Dry-run re-verified
- Report catalog count + the three changed rows
Then Nox uploads (bonus catalog + unit data, one sitting).
