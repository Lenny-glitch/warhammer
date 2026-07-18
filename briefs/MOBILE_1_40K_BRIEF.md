# MOBILE-1-40K — Make a phone turn possible in 40k

CLAIMED: 2026-07-17

## Orientation
Monorepo, ~/projects/warhammer. Branch master. CLAIM FIRST (add
"CLAIMED: <date>" to this file, commit) — a parallel session is
working killteam/. Touch ONLY warhammer40k/ and nothing else.
You cannot push. Commit locally, cite hashes, Nox pushes.
VERIFY-FIRST: written by a planner with no repo access, from
MOBILE_AUDIT_REPORT.md. Check every claim against actual source
and report divergence rather than building on a wrong premise.

## Why
Aaron plays by link and said he'd PLAY MORE if the phone worked.
The audit found .board-wrap at 390x844 measures 130px wide by
8px TALL, with a token occupying a 1.5x1.5px screen box, and
zero touch/pointer listeners in warhammer40k/js/*.js.
Success condition, the only one:

  AARON CAN TAKE A COMPLETE TURN ON HIS PHONE.

## Primary target
PORTRAIT. Landscape must not be broken, but portrait is the
design target.

## Item 0 — Housekeeping, do first
The audit observed `_tmp_scroll_repro.js` as a live temp file
from W40K-UX1, and uncommitted in-progress styles.css changes
(a clamp() side-panel width fix + a hover-cursor fix). Confirm
W40K-UX1 landed and cleaned up. If that temp file is still
present and untracked, report it — do not silently delete
another session's work-in-progress.

## Item 1 — Layout: the board must be visible
IMPORTANT — different root cause than killteam. Do not assume
the KT diagnosis applies. Per the audit, the side-panel clamp()
floors are already only 130px each here and are NOT the culprit.

The culprit: the Shooting phase's "select a unit to shoot" list
renders ONE BUTTON PER UNIT-GROUP, UNCAPPED, inside .phase-bar,
which has no max-height and no internal scroll. With Aaron's
real ~13-unit-group roster that list alone nearly fills an 844px
viewport, evicting .game-main's flex:1 board row down to single
digit pixels. Verify this against source before fixing it.

Fix has two parts:
 (a) Cap .phase-bar's height and give the list INTERNAL SCROLL,
     so unbounded content can never evict the board again. Audit
     the phase-bar generally for other unbounded-content risks
     while you are in there — this is a class of bug, not one
     instance.
 (b) A breakpoint that hides the side panels behind a toggle/
     drawer at phone size.

BREAKPOINT TRIGGER — same trap as the KT brief, read it:
A width-only breakpoint (max-width:600px) DOES NOT FIRE in
landscape — a landscape phone is 844px wide. Use a trigger that
catches both orientations, e.g.:

  @media (max-width: 600px), (max-height: 500px) { ... }

The KT session is specifying the same trigger. These two apps
have independently converged on the same side-panel-flanking-
board layout; one pattern, two applications. If you deviate from
the above, say so and why, so the two apps don't diverge.

LANDSCAPE IS WORSE HERE, NOT BETTER: the shooting-list problem
is a VERTICAL eviction. Landscape gives you 390px of height
instead of 844px. Item 1a matters more in landscape, not less.
Test both.

Done when: at 390x844 AND 844x390, with a real ~13-unit roster
loaded and the Shooting phase active, the board is the dominant
element and the shooting list scrolls internally. Report
measured .board-wrap px in both orientations, before and after.

## Item 2 — Gestures: the core item
Audit confirmed with real CDP touch events: a touch-drag on a
token produced no change in #drag-overlay. js/board.js wires
movement drag and casualty-allocation drag through mousedown/
mousemove/mouseup with zero touch/pointer listeners anywhere in
js/*.js.

Convert every drag flow to POINTER EVENTS:
  mousedown -> pointerdown, mousemove -> pointermove,
  mouseup -> pointerup
Pointer events fire for mouse, touch and pen through one code
path, so desktop keeps working through the same handlers.

The ~3 flows per the audit (VERIFY against source):
  1. movement
  2. casualty allocation
  3. terrain paint

TWO THINGS THAT WILL BITE YOU:
- REPLACE the mouse listeners, do not ADD pointer ones alongside
  them. Both firing = double-fire. On a Firebase multiplayer
  game a duplicated write is a desync, and determinism between
  clients is non-negotiable in this project.
- Each flow needs `touch-action: none` on the relevant element
  or the browser claims the gesture for scroll/pinch and your
  handler never fires. Check per flow; don't assume one blanket
  rule covers all three.

GOOD NEWS, DO NOT BREAK IT: the audit found shooting/charge
target selection is a single click on the target (board.js
onTargetSelected), NOT a drag. That is already touch-shaped and
will likely just work once the board is reachable. Verify it
under real touch and leave it alone otherwise.

Priority: MOVEMENT FIRST. If you must stop early, stop after
movement works and report.

Done when: each flow verified with REAL touch events (CDP touch,
not .click()) at 390x844, and re-verified with a mouse at
desktop size to prove no regression. Report per flow.

## Item 3 — Touch targets
- Shooting phase "select a unit to shoot" buttons measured
  235x35px — below the 44px minimum, stacked with minimal gap,
  real mis-tap risk. Bump to >=44px height with adequate gap.
  (Do this WITH item 1a — taller buttons make an uncapped list
  worse, so the cap has to land alongside or first.)
- Unit cards (108x116 to 108x133px) are fine. Leave them.
- Board tokens could NOT be fairly measured — the board was
  collapsed to single-digit px, so any reading was an artifact.
  Once item 1 lands, MEASURE THEM and report. Do not resize
  anything based on the audit's non-reading.

## Item 4 — Forward-looking, cheap, do it now
The audit found only 3 `title=` attributes in this whole app,
all on dev-only preset buttons — 40k does NOT have killteam's
"disabled-reason text exists only on hover" disease (~20 sites
there). Keep it that way.

W40K-UX1 was about to add more hover labels. If any landed as
`title=`-only, flag them. Any new hover label must ship with a
tap-reachable fallback (visible compact text, or tap-to-expand).
Phones have no hover. Cheap to build right once; expensive to
retrofit — killteam is the cautionary tale.

## NOT IN SCOPE
- Board pan/zoom. Absent, not needed for a turn.
- Any mobile-first/second-UI work — deferred until Aaron takes
  one real turn on a phone.
- Anything in killteam/ — parallel session owns it.
- Oval bases (parked pending model art).
- The known "?" stat bug (getRosterUnitDef lookup miss falling
  through to a legacy stat table). Separate thread, still open,
  do not chase it here.

## Done when (whole brief)
A commit per item, hashes cited, plus a report covering:
1. Verified vs diverged audit claims.
2. Breakpoint trigger used + proof it fires at 390x844 and
   844x390.
3. .board-wrap measured px both orientations, before/after, with
   a real 13-unit roster in the Shooting phase.
4. Per drag flow: converted / real-touch verified / desktop
   mouse re-verified.
5. Token sizes measured post-fix (item 3).
6. Anything this brief failed to anticipate.

Two-browser-context testing is MANDATORY for anything touching
multiplayer state — single-window verification has shipped bugs
in this project repeatedly.

Then Nox real-device checks. The audit only saw Chromium
emulation, never real iOS Safari.
