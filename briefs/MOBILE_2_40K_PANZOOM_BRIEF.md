# MOBILE-2-40K — Pan/zoom the board

CLAIMED: 2026-07-17

## Orientation
Monorepo, ~/projects/warhammer, branch master. CLAIM FIRST.
Touch ONLY warhammer40k/. You cannot push — commit, cite hashes,
Nox pushes. VERIFY-FIRST: planner has no repo access. Check every
claim against source and report divergence.

Read first: your own MOBILE-1-40K report + DEVLOG (bc4a4a3).
This brief exists BECAUSE of your item 3 finding.

## Why
MOBILE-1-40K landed the board at 390x390 on a phone, and drags
work. It is still unplayable: you measured tokens at 9x9px at
BEST (combat patrol), against a 44px touch minimum. That is not
a bug — it is geometry. 47-54 models on a battlefield rendered
into 390px cannot be tapped, and no CSS fixes that.

Zoom is the answer: zoom in -> tokens reach 44px -> the pointer
drags you already converted work as-is. No second UI, no new
interaction model.

This also closes two items straight off Aaron's playtest backlog:
- "map pan/zoom" (his words)
- "grid scale unclear — how many inches is a square?"

Success condition: AARON CAN TAKE A COMPLETE TURN ON HIS PHONE.
MOBILE-1 got the board visible. This makes it operable.

## CRITICAL — 40k HAS MULTIPLE MAP SIZES
Nox flagged this after MOBILE-1; the planner's first draft of
this brief wrongly assumed a single board. Consequences you MUST
design around:

- Your 9x9px token measurement was at ONE map size, and you
  described combat patrol as the BEST case. So 9px is the
  CEILING, not the floor. Larger maps put more board into the
  same 390px -> tokens SMALLER than 9px. The problem is worse
  than MOBILE-1 reported.
- Therefore: DO NOT hardcode a zoom range. Any fixed max (the
  planner's first draft said "~5x" — ignore that number, it was
  invented without knowing maps vary) will be too shallow on big
  maps and pointlessly deep on small ones.
- Zoom max must DERIVE from board dimensions: compute whatever
  scale makes a token reach >=44px on THIS board, and make sure
  the range reaches it. Same for pan clamping — derive from
  actual board bounds, not constants.

FIRST TASK: find every map size the app supports and report the
list with dimensions. Everything below is verified against ALL
of them, not one.

## Item 1 — Pan/zoom via SVG viewBox
The board is a fixed SVG viewBox with no gesture handling
(verify). viewBox is the right mechanism: mutate it and you get
pan+zoom for free, and every coordinate/LOS/range calculation
stays in board units, untouched. Do NOT use CSS transforms on
the SVG — that risks divergence between visual position and the
coordinate math the engine uses, and determinism between clients
is non-negotiable in this project.

Requirements:
- zoom range derived from board dimensions (see CRITICAL above),
  clamped at both ends
- clamp pan so the board cannot be dragged entirely off-screen,
  derived from real board bounds
- zoom should center on the gesture/pointer, not the origin
- purely presentational: no game state, no Firebase writes, no
  effect on what the other player sees. Local view only.

## Item 2 — Gesture disambiguation: THE risk in this brief
You just wired one-finger pointer drags for movement and terrain
paint. Pan is also a drag. These WILL conflict — this is the
whole difficulty of the brief and where it gets got.

Standard resolution (verify it fits this app):
- ONE finger on a token     -> move the model (existing behavior)
- ONE finger on empty board -> pan
- TWO fingers               -> pinch zoom + pan
Pointer events give you pointerId; track concurrent pointers to
detect the two-finger case. Do not hand-roll a touch listener
set beside the pointer ones — that is the double-fire trap from
MOBILE-1.

Terrain paint is one-finger-drag on EMPTY BOARD, which directly
collides with pan-on-empty-board. Resolve it explicitly and say
how (paint mode is modal — likely pan is disabled while the paint
tool is armed). Flag if there's a cleaner answer.

DESKTOP MUST NOT REGRESS:
- wheel = zoom, and it must not scroll the page
- middle-drag or space+drag = pan (pick one, report which)
- left-drag on a token = move, exactly as today

## Item 3 — touch-action, permanently
MOBILE-1-KT found the hard way: `touch-action: none` set
reactively inside a pointerdown handler is TOO LATE — the
browser decides "is this a scroll/pinch?" before your JS runs.
It must be a permanent CSS rule on the board element.
Pinch-zoom makes this sharper: without it the browser will
hijack two-finger gestures for its own page zoom and your
handler never fires.

## Item 4 — Scale indicator (cheap, closes a real complaint)
Aaron asked "how many inches is a square?" and nothing answers
him. Zoom makes this sharper (square size now changes visually)
and MULTIPLE MAP SIZES make it sharper still — the answer may
differ per map. Add a persistent, unobtrusive readout, e.g.
"1 square = X inches". Source it from real game constants per
map size; do not hardcode a guess. If no constant exists, report
that rather than inventing one.

## Do not break
- onTargetSelected (shooting/charge targeting) is a single click,
  NOT a drag — you flagged it as already touch-shaped. Verify it
  still works under touch after this lands and leave it alone.
- The MOBILE-1 breakpoint/drawer, and the capped/scrolling
  phase-bar (confirmed working in live desktop play).

## Library vs hand-rolled — your call, justify it
A gesture/pan-zoom library is plausibly justified here (pinch,
momentum, drag conflicts are genuinely fiddly). Against it:
there is NO BUILD STEP in this project, so a dependency means a
vendored file, and viewBox pan/zoom is a well-trodden ~100 lines.
Do NOT use Hammer.js or similar touch-gesture libs — pointer
events are native and made those obsolete.
Recommend one, with reasoning, in your report. If you hand-roll
it, keep it in one module.

## Done when
Commits per item, hashes cited, plus a report with:
1. Verified vs diverged claims.
2. THE MAP SIZE LIST with dimensions, and measured token px at
   default zoom AND at max zoom FOR EACH MAP SIZE. Every map
   must reach >=44px. Report actual numbers, not "yes".
3. Gesture disambiguation scheme, verified with REAL CDP touch
   events (not .click()): one-finger token drag, one-finger pan,
   two-finger pinch — each proven independently and proven not to
   trigger each other.
4. Terrain-paint collision: how resolved.
5. Desktop mouse re-verified: wheel zoom, pan, token drag, click
   targeting — no regressions.
6. Library decision + reasoning.
7. CAPSTONE: one continuous real-touch turn at 390x844 with a
   real ~13-unit roster — select, move, shoot, end. Same bar
   MOBILE-1-KT met. Run it on the LARGEST map size, since that's
   the worst case. If you can't reach it, say so plainly and say
   what blocks it.

Two-browser-context testing MANDATORY for anything that touches
multiplayer state. This brief shouldn't touch any — if you find
yourself writing to Firebase, stop and report; that means the
scope is wrong.

Then Nox real-device checks. Chromium emulation is not iOS
Safari — pinch is exactly where they diverge most.
