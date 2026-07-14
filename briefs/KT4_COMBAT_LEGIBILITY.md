# KT-4 — Combat Legibility + Action-State Rules

CLAIMED: 2026-07-13

## Orientation
Monorepo, killteam/. Claim first. Theme (Nox + brother, playtest
4): the engine is CORRECT but TELLS instead of SHOWS — "24
wounds" with no felt link to 4 dice, retaliation damage that
reads as a bug. Plus real RAW gaps confirmed by search. Two-
browser Playwright is the rig.

## RULINGS (all RAW-verified this session — implement as stated)
- Damage math is CORRECT. 4 crits x power weapon 6 dmg = 24 is
  right. DO NOT change the math. Make it legible (item 1).
- Retaliation is CORRECT (defender strikes back in a Fight).
  Not a bug — make it OBVIOUS whose damage is whose (item 1).
- Heavy weapons: cannot Shoot in an activation with a Reposition
  or Fall Back; CAN Shoot after a Dash. "Heavy (Dash only)"
  variants: only Dash allowed. ENFORCE the Heavy flag (item 2) —
  it's currently display-only. Non-Heavy weapons shoot after
  moving fine. (This is why "no shoot after dash" is WRONG as a
  blanket rule — it would nullify Heavy.)
- Shoot while engaged: ILLEGAL. Can't Shoot an enemy in your
  control range; leaving melee is Fall Back (costs the move).
  Enforce (item 3).
- Conceal: locked at activation start, can't flip mid-turn.
  Concealed-in-cover = not a valid SHOOT target; always Fightable.
  No "re-conceal after attacking" — order's already locked.
  (Mostly already correct; verify Shoot targeting respects
  Conceal+cover, and don't offer mid-turn order change.)

## 1 — SHOW THE COMBAT (the core ask)
The dice->damage chain must read at a glance:
- Each retained die visibly maps to its damage contribution
  ("4 CRIT x 6 = 24" broken out, not just "24 wounds")
- In a Fight, attacker damage and DEFENDER-RETALIATION damage
  are visually separated and labeled ("You deal X / They
  retaliate Y") so return damage never looks like an error
- Keep it compact (Nox: not too much space). This is the same
  legibility principle as the bonus readout — the summary line
  is a contract, show its math.

## 2 — Enforce Heavy
Heavy weapon shooting blocked in an activation that used
Reposition or Fall Back; allowed after Dash. Parse the
"(Dash only)"/"(x only)" qualifier already in the data. Grey
the Shoot option with a reason when blocked ("Heavy — moved
this activation").

## 3 — Enforce shoot-while-engaged ban + Fall Back
Operative in an enemy's control range can't Shoot (grey with
reason). Fall Back action exists to leave control range and
costs the move; confirm it works and ends shooting eligibility
that activation.

## 4 — Cancel-recovery (brother bug)
Cancelling a Shoot/Fight (or hitting the wrong thing) must NOT
burn the activation — operative returns to pre-action state,
AP intact, re-selectable. Same orphaned-state family as prior
fixes; confirm all four mid-action states unwind cleanly.

## Out of scope
Ghost/animation drama (KT-5), chess timer (backlog), Seek/other
keyword enforcement beyond Heavy (BON-3 era), catalogue weapon
data (separate audit brief).

## Done when
Two-window run: combat shows its math, retaliation labeled
distinctly; Heavy blocked-after-Reposition / allowed-after-Dash
with visible reasons; can't shoot while engaged, Fall Back works;
cancelling any action costs nothing. DEVLOG, hashes; Nox pushes
+ redeploys; brother game is real acceptance.
