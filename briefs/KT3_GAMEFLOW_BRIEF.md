# KT-3 — Game Flow & Table Feel (playtest-3 papercuts)
CLAIMED: 2026-07-12

## Orientation
Monorepo, killteam/. Claim first. Every item here comes from
live brother-game 3 (all prior bug fixes verified holding).
These are flow papercuts, not bugs — small, high game-night
impact.

## 1 — Kill the radial End button
It sits directly over the operative's token = accidental
activation skips. Remove End from the radial entirely; the
bottom bar's End Activation is the only end. (Side benefit:
that overlay div was the exact hazard class that ate mousedowns
in the P2 drag work — one less thing layered on tokens.)

## 2 — Weapon choice on the radial
Shoot/Fight radial options expand to weapon selection when the
operative has multiple eligible weapons (submenu or second ring
— your call on mechanism, must work with drag-to-shoot's flow
too). Single-weapon operatives skip straight through as today.

## 3 — Token hover affordance
Cursor becomes pointer over selectable tokens (cards already do
this; tokens don't) + a hover tooltip with the operative's FULL
name (and wounds while you're there). Touch devices: no hover —
don't break tap-select.

## 4 — Minimal action log
Rolling log strip (bottom or side, collapsed-expandable):
one line per action from the existing action records ("Balefire
Acolyte shoots Snipa Boy — 2 hits, 5 dmg", "Boss Nob moves").
Third playtest in a row requesting it. This is the seed of
KT-7's catch-up feature — write it against the action records,
not ad-hoc strings, so it grows into that later.

## 5 — Win/lose sequence
When a side has zero non-incapacitated operatives: game ends —
full-screen VICTORY / DEFEAT state on the respective clients,
written to the game doc (state: finished, winner) so both
clients agree and a reopened link shows the result. Turning
Point 4 end can stay unhandled this pass (scoring is future);
wipe-out is the case that actually happened.

## 6 — [PENDING NOX CLARIFICATION] Fight cancel behavior
Playtest note "fight uncanceled attacker" — exact symptom being
confirmed. Placeholder: verify that initiating Fight and
cancelling before resolution costs nothing (no AP, no
hasFought, no order flip) and leaves selection sane. If Nox's
clarification differs, it lands here as an amendment.

## Done when
- Two-window run: no accidental end-turns possible from the
  radial; multi-weapon operative picks weapon via radial for
  both Shoot and Fight; hover shows names; log narrates the
  game; wiping a team produces synchronized win/lose screens
- Fight-cancel per clarified item 6
- DEVLOG, hashes; Nox pushes + REDEPLOYS; brother game 4 is the
  acceptance test
