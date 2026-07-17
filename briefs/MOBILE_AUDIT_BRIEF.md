# MOBILE-AUDIT — What Actually Breaks on a Phone

CLAIMED: 2026-07-17

## Orientation
Monorepo. Claim first. INVESTIGATION ONLY — report, change
nothing, decide nothing. Nox decides from the report.

## Why
Nox's brother played 40k on his phone and said "the controls are
a little tricky." Nobody has ever designed or tested any of this
for mobile. But play-by-link — the project's whole end goal —
is inherently a phone use case: take your turn on the couch, in
a break, wherever. Mobile may be the actual delivery vehicle,
not an edge case. Before scoping anything, find out what's real.

## Task — audit killteam/ and warhammer40k/ at phone size
Use Playwright with a real mobile viewport + touch emulation
(iPhone-ish 390x844 and a mid-Android size). Drive an actual
game on live Firebase. Report concretely, per app:

1. LAYOUT: what's unusable at 390px wide? Sidebars, dice panels,
   action log, board — what's off-screen, overlapping, or too
   small to read?
2. TOUCH: what depends on HOVER and therefore does nothing on a
   phone? (KT-3 added token hover tooltips claiming "touch-safe
   by construction" — verify that claim. 40K-UX1 is about to add
   more hover labels — flag if that's the wrong affordance.)
3. TARGETS: what's too small to tap accurately? The radial menu
   and its weapon submenu specifically — measure the touch
   targets against the ~44px minimum.
4. GESTURES: does drag-to-shoot work under touch? Does the board
   pan/zoom, and does that conflict with dragging?
5. WHAT ACTUALLY WORKS: be specific about the good news too —
   if the core loop is playable-but-ugly, that's very different
   from broken.

## Then: cost the two options honestly
(a) RESPONSIVE PATCH — make the existing UI survive a phone:
    breakpoints, bigger targets, tap fallbacks for hover,
    internal scrolling. Estimate the real work per app.
(b) MOBILE-FIRST MODE — a separate, phone-shaped UI for taking a
    turn (the play-by-link case), desktop UI unchanged.
    Estimate.
Recommend one. Do not implement either.

## Done when
A committed report (briefs/ or docs/) with: per-app findings for
1-5, the two options costed, a recommendation, and — if there's
a cheap high-value subset (e.g. "three CSS changes make it 80%
better") — say so explicitly. No code changes.
