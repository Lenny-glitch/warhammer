# BUG — KT Brother-Game 2 Findings (extends BUG_KT_PLAYTEST_1)
CLAIMED: 2026-07-11

## Orientation
Monorepo, killteam/. If BUG_KT_PLAYTEST_1 is still open, MERGE
this into that work — items 1-3 here are almost certainly the
same turn-state/selection root. Two-browser-context Playwright
remains the required test rig.

## 1 — Non-active player lockout cluster (blocker, new data)
- (from PT1) player 2: token clicks dead, card-deselect
  dead-ends, AP unspendable
- NEW: player 2's radial action menu stops appearing entirely
  after ~turn 1-2 (worked initially — state degrades)
- NEW: when player 1 has no ready operatives left, player 2's
  remaining operatives CANNOT act — only End. RAW: the player
  with operatives remaining activates them normally, one at a
  time, solo. This must work; it's how unequal forces play out.

## 2 — Action once-per-activation not enforced
Same operative could Shoot twice in one activation. RAW: each
action once per activation (Move+Dash are different actions and
both fine). Enforce at the action-bar level: performed actions
grey out for the rest of the activation.

## 3 — Base collision missing
Operatives can move onto/through enemy models. Bases are
impassable — block movement through/onto ANY operative's base
(friend or foe), same job WHF just did for regiments.

## 4 — Fight reveals: Conceal + melee ruling (decided, fun-first)
Performing the Fight action sets the operative's order to
ENGAGE. RAW is ambiguous; legibility wins: attacking in melee
reveals you. One-line rule, note it in DEVLOG.

## 5 — Layout scroll (PT1 item 3) — still broken
Both players scroll to see actions/rolls. Confirmed still open
in game 2.

## Also queued via this playtest (NOT this brief)
Minimal rolling action log at bottom (records exist from
BON-2b) · composition validation with live "what's missing"
tracker (next roster brief) · 40k lobby roster picker (Part 3).

## Done when
Two-context Playwright: full game where P1 runs out of
operatives first and P2 solo-activates the rest; every PT1+PT2
symptom exercised; once-per-activation enforced; base collision
blocks; Fight flips to Engage; no scroll at desktop viewport.
DEVLOG, hashes; Nox pushes, REDEPLOYS, and re-runs a two-window
game as acceptance.
