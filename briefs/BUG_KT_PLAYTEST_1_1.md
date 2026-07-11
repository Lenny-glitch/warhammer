# BUG — KT Two-Client Playtest Findings (BLOCKS brother game)
CLAIMED: 2026-07-11

## Context
Nox ran the first real two-window playtest (both players, same
PC, live Firebase). Three bugs, priority order below. Suspect
for #1: KT-2 Part 2 item 1's rewrite moved shoot-drag to a
DOCUMENT-LEVEL mousedown listener with proximity-to-active-
operative checks — regression risk in exactly the selection
behavior now broken. Verify against the pre-P2 commit's
behavior, don't assume.

## 1 — SELECTION / ACTIVATION BROKEN FOR PLAYER 2 (blocker)
Symptoms, verbatim from play:
- Player 2 can select operatives ONLY via the sidebar cards,
  never by clicking board tokens
- Clicking the model's card can DESELECT with no way to click
  any model after — turn dead-ends
- Player 2's operatives can toggle Engage/Conceal but cannot
  spend AP (actions unavailable)
Reproduce in real Playwright with TWO browser contexts on one
game (this is a per-client/turn-state interaction — single-
window testing missed it). Fix must keep drag-to-shoot working
AND restore plain token-click selection for both clients in all
turn states. If the document-level proximity listener is the
cause, scope its activation to the acting client + an actually-
active operative, and let all other clicks pass through
untouched.

## 2 — Lobby "Copy" button does nothing
Likely navigator.clipboard failing silently (Brave shields /
permissions). Add fallback: on failure, select the link text so
manual Ctrl+C works; show a "copied!"/"select and copy" state
so the button never silently no-ops.

## 3 — Layout regression: page taller than viewport
Whole screen now requires scrolling (new since P2's UI
additions). Find what grew (bottom panel? floaters container?)
and restore fit-to-viewport at typical desktop sizes.

## Also (polish, do only if trivial this pass)
Flag-type bonus descriptions read as circular ("Psychic: flags
psychic"). Player-contract wording per flag in the readout,
e.g. Blast → "can hit multiple targets near the aim point
(applied by agreement for now)". If not trivial here, skip —
it's queued separately.

## Done when
- Two-context Playwright run: BOTH clients complete a full
  activation each — token-click select, move, shoot (drag AND
  click), AP spends, no dead-end states
- Copy works or degrades visibly
- No scroll at standard desktop viewport
- DEVLOG, hashes; Nox pushes, REDEPLOYS hosting, and re-runs
  the two-window test as acceptance
