# MOBILE-1-KT — Make a phone turn possible in Kill Team

CLAIMED: 2026-07-17

## Orientation
Monorepo, ~/projects/warhammer. Branch master. CLAIM FIRST (add
"CLAIMED: <date>" to this file, commit) — a parallel session is
working warhammer40k/. Touch ONLY killteam/ and nothing else.
You cannot push. Commit locally, cite hashes, Nox pushes.
VERIFY-FIRST: this brief was written by a planner with no repo
access, from MOBILE_AUDIT_REPORT.md. Check every claim below
against actual source. Report divergence instead of building on
a wrong premise. The planner has been wrong many times.

## Why
Nox's brother Aaron plays by link. He said the controls were "a
little tricky" and that he'd PLAY MORE if the phone worked.
MOBILE_AUDIT_REPORT.md then found he almost certainly cannot see
or operate the app at all:
- .board-wrap renders 24px wide at 390x844
- ZERO touch/pointer listeners exist in killteam/index.html —
  every drag flow is dead under real touch
Playing more with Aaron is the entire point of this project.
This brief's success condition is exactly one thing:

  AARON CAN TAKE A COMPLETE TURN ON HIS PHONE.

Not "usable." Not "responsive." A whole turn: select, move,
shoot, end activation. If a change doesn't serve that, it is out
of scope — see NOT IN SCOPE.

## Primary target
Aaron holds his phone in PORTRAIT. Portrait is what must work.
Landscape must not be BROKEN, but it is not the design target.

## Item 1 — Layout: the board must be visible
Audit's root cause (verify): KT-5 switched sidebars and the
dice/log panels to width: clamp(floor, vw, ceiling) to fix a
~960px half-tiled-desktop squeeze. The four floors
(120+130+130+120 = 500px) exceed a 390px viewport entirely, and
flex-shrink:0 means they will not yield. .board-wrap's flex:1
gets the negative remainder. .game-main{overflow:hidden} hides
the failure, so there is no scrollbar and no visual cue.

Required: a real breakpoint that HIDES the side panels behind a
toggle/drawer rather than shrinking them. clamp() is provably
insufficient below the combined floor width — do not try to
tune the floors down, that is the same failed strategy at a
smaller number.

BREAKPOINT TRIGGER — this is the part that is easy to get wrong:
A width-only breakpoint (e.g. max-width:600px) DOES NOT FIRE in
landscape. A phone in landscape is 844x390 — 844px wide. It
would sail straight through a width-only rule and stay broken.
Use a trigger that catches both, e.g.:

  @media (max-width: 600px), (max-height: 500px) { ... }

Verify the exact form you use actually fires at BOTH 390x844 and
844x390 before building on it. Report the trigger you chose.

Secondary (portrait): the topbar CP strip wraps to its own line
at 390px, costing vertical space .game-main never gets back.
Fix if cheap, report if not.

Done when: at 390x844 AND 844x390, the board is the dominant
element on screen, side panel content is reachable via the
toggle, and nothing is clipped off-screen with no way to reach
it. Measure .board-wrap and report actual px in both.

## Item 2 — Gestures: THE core item, do not skip
Audit confirmed with real CDP touch events (Input.dispatch
TouchEvent — not synthetic mouse): a touch-drag on an operative
does nothing. killteam/index.html has zero touchstart/touchmove/
touchend/Pointer listeners. Every drag flow is mouse-only.
A touchscreen does not dispatch mouse events for a drag — only a
stationary tap gets a synthesized click. So: movement is dead,
drag-to-shoot is dead.

Convert every drag flow to POINTER EVENTS:
  mousedown  -> pointerdown
  mousemove  -> pointermove
  mouseup    -> pointerup
Pointer events fire for mouse, touch, and pen through ONE code
path. Desktop keeps working via the same handlers. This is why
pointer events, not a parallel set of touch listeners.

The ~6 flows per the audit (VERIFY this list against source,
it may be wrong or incomplete):
  1. Move / Dash / Fall Back (startMove)
  2. drag-to-shoot
  3. fight-drag
  4. markerlight-drag
  5. cast-drag
  6. terrain paint

TWO THINGS THAT WILL BITE YOU:
- REPLACE the mouse listeners, do not ADD pointer ones beside
  them. Both firing = double-fire = duplicate actions, and on
  a Firebase-backed multiplayer game a duplicate write is a
  desync. This is the main risk in this item.
- Each flow needs `touch-action: none` on the relevant element
  or the browser hijacks the gesture for its own scroll/pinch
  and your handler never sees the move. Easy to miss per flow.
  Check every flow individually; do not assume one blanket rule
  covers them.

Priority within the item: MOVEMENT FIRST. If you run out of room
and have to stop, stop after movement works and report — a turn
with movement and no drag-to-shoot is closer to playable than
the reverse.

Done when: each flow verified with REAL touch events (CDP touch,
not .click(), not mouse) at 390x844, AND re-verified with a
mouse at desktop size to prove no regression. Report per flow:
works / broken / not converted.

## Item 3 — Radial menu edge-clamping
Audit: the radial's position is a fixed-pixel offset from the
token's screen position with NO viewport-edge clamping. Measured
a "Conceal" button at y=-14 (off the top of the screen), and a
weapon-submenu option at y=-27. This is not purely a side effect
of item 1 — any token near any board edge on a narrow screen
risks it, because the ring math never checks viewport bounds.

Also: the weapon submenu's "Back" button measured 40x40px.
Minimum touch target is 44px. Bump it. The 50x50 ring buttons
and 54x54 weapon buttons are fine as-is — leave them.

Fix: clamp the ring (and submenu) so it always renders fully
on-screen regardless of token position.

Done when: at 390x844, a token in each of the four board corners
and each edge midpoint opens a radial with every button fully
within the viewport. Report measured positions.

## NOT IN SCOPE — do not do these
- The `title=`-only disabled-reason debt (~20 call sites). It is
  real, it is next phase, it is a legibility problem not a
  can't-play problem. Leave it.
- Board pan/zoom. Does not exist, not needed for a turn.
- Any mobile-first/second-UI work. That decision is deferred
  until Aaron has taken one real turn on a phone and we have
  learned something from it.
- Anything in warhammer40k/ — parallel session owns it.
- Oval bases. Parked pending model art.

## Done when (whole brief)
A commit per item, hashes cited, plus a report covering:
1. Which audit claims you VERIFIED and which diverged from
   actual source.
2. The breakpoint trigger you used, and proof it fires at
   390x844 and 844x390.
3. .board-wrap measured px, both orientations, before/after.
4. Per drag flow: converted y/n, real-touch verified y/n,
   desktop mouse re-verified y/n.
5. Radial clamping proof at corners/edges.
6. Anything you found that this brief did not anticipate.

Then Nox does a REAL DEVICE check — the audit only ever saw
Chromium emulation, never real iOS Safari, which has its own
touch-action and viewport-unit quirks. Do not call mobile done.
Call it "ready for Nox's phone."
