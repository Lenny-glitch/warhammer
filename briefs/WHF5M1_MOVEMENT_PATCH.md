# WHF-5m.1 — Movement Cost Patch + Playtest Follow-ups
# CLAIMED: 2026-07-12

## Orientation
Monorepo, warhammer-fantasy/. Small follow-up: WHF-5m passed
Nox's playtest 8/8 with one design correction. Claim first.

## 1 — Movement cost = net from start, live (the fix)
Current: every keypress accumulates spent movement (fwd 3 +
back 2 shows 5" used, forces Cancel to adjust).
New, DURING PREVIEW only: cost recomputes from phase-start
position to the ghost's current spot — net forward at 1:1, net
backward (ghost ENDS behind start) at 2:1 (existing half-speed
pricing), wheel arcs priced as now. Backing the ghost up while
ahead of start = editing, costs nothing net.
Smoke cases: fwd3+back2 → 1.0" used; fwd1+back3 → 2.0" used
(1" net back × 2). Confirm/Undo unchanged.

## 2 — Controls discoverability (backlog item 3, minimal cut)
Playtest: "new players won't know how to look for them."
When a unit is selected with no mode active: one-line prompt
("choose an action: Move · Wheel · Reform · Charge") near the
panel buttons; footer hint made more prominent. Full onboarding
is NOT this pass.

## 3 — Record in backlog, no action
Movement animation triggers, ALL THREE GAMES (Nox verbatim):
click move → model/unit animates A→B with dust puff +
walk/drive/clank audio. Late priority, atmosphere win.
Playtest positives for the record: overlap blink feedback (move
AND wheel), engaged highlighting, labels/numbers all land.

## Done when
Bar math per item 1 with both smoke cases; item 2 prompt in;
backlog updated; DEVLOG, hashes; Nox pushes + redeploys.
