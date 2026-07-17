# BUG — WHF Engaged Units Deadlock the Turn (blocker)

## Orientation
Monorepo, warhammer-fantasy/. Claim first. From Nox's WHF-5
checkpoint playtest. Item 1 is a hard blocker — the game cannot
progress past a charge.

## 1 — TURN NEVER ENDS WITH AN ENGAGED UNIT (blocker)
Engaged units correctly cannot move ("Engaged in combat —
resolve it in the Combat phase" — that part is RIGHT, don't
change it). But the Movement phase's advance logic appears to
wait for every unit to act or be marked done, and an engaged
unit can never be marked done → infinite loop, turn never ends.
Same class as 40k's terrain pass-turn deadlock.
Fix: engaged (and fleeing, and any other can't-act state) units
must be treated as ALREADY RESOLVED for phase-advance purposes.
Audit EVERY phase's advance condition for the same assumption —
if Movement has it, Shooting/Magic/Combat plausibly do too.
Report which phases were affected.

## 2 — Scroll to reach phase buttons
Same layout regression KT had: the next-phase controls sit below
the fold. Fit to viewport at standard desktop sizes; check at a
tiled half-screen width too, since that's how Nox plays
two-window.

## 3 — Confirmed correct, no action (context)
- Charge reactions are Hold / Stand and Shoot / Flee. There is
  NO countercharge in 8th edition. Current implementation is
  correct and complete.
- "Stand and Shoot unavailable — no ranged weapon" reason text
  is working as designed.

## Done when
- A charge resolves and the turn advances to Combat without
  manual intervention; a full round completes with units
  engaged
- Every phase's advance condition audited, findings reported
- No scroll at desktop or half-screen width
- DEVLOG, hashes; Nox pushes + redeploys; his re-run of the
  WHF-5 checkpoint is acceptance
