# BUG — 40k Publish Writes to rosters/undefined

CLAIMED: 2026-07-05

## Symptom (verified by Nox, 2026-07-04)
Published the Craftworlds Eldar roster (draft -Owius...).
- exports.json?shallow=true shows ONLY kill-team — no
  warhammer-40k node was created.
- A node exists at /rosters/undefined — almost certainly the
  misdirected export write (path built from a variable that is
  undefined for 40k rosters).

## Task
1. Inspect /rosters/undefined — confirm what it is before
   deleting it. If it's the denormalized Eldar export, that
   confirms the path bug; delete after diagnosis either way.
2. Find why the 40k publish path resolves to rosters/undefined
   instead of exports/warhammer-40k/{id}. Note this is the THIRD
   bug on this exact path (deprecated-subtree fetch, isLegal
   hardcode, now this) — after fixing, read the whole publish
   function end-to-end once with fresh eyes rather than patching
   the single line.
3. Verify the KT publish path still writes correctly (it works
   today; don't break it fixing this).

## Done when
- Fix committed (cite hash)
- rosters/undefined identified and removed
- NOX republishes the Eldar roster and confirms
  exports/warhammer-40k appears with chosenLoadout
  (mirrorswords) and modelCount populated. Code-trace alone does
  not close this one — three strikes rule.

## Sequencing
If GIT-2 is underway, fix this in the monorepo after migration
(roster/ subdir) rather than the old repo — one canonical fix
location. Part 3 stays blocked until Nox's republish verifies.

## AMENDMENT 1 (2026-07-05) — second symptom + a design fix
Nox reports the Publish button now has NO click reaction on 40k
rosters. Likely cause: the tri-state legality fix left publish
gated on legal === true, and 40k legality is permanently null
(no compositionRules exist) — we locked 40k publishing entirely.

DECISION: null legality is PUBLISHABLE. The export carries
isLegal: null and the published view shows the existing gray
"Not Validated" badge. Only legal === false blocks publish.
(Fun-first: unvalidated ≠ forbidden.)

So this brief is now two fixes, both required:
1. Unlock publish for null legality (above)
2. The ORIGINAL path bug — the write that landed at
   /rosters/undefined instead of exports/warhammer-40k/{id} —
   which may still be present underneath the disabled button.
   Diagnose it even though the button currently prevents
   reaching it; unlocking publish without fixing the path just
   resurrects the first symptom.
Acceptance unchanged: Nox republishes, exports.json?shallow=true
shows warhammer-40k, chosenLoadout + modelCount populated.
