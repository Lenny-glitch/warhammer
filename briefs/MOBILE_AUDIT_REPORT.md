# MOBILE-AUDIT — Report

Companion to `MOBILE_AUDIT_BRIEF.md`. Investigation only — nothing in
`killteam/` or `warhammer40k/` was changed to produce this report.

## Method

Playwright + Chromium, mobile emulation (`isMobile:true`, `hasTouch:true`,
iPhone-ish 390×844 and Pixel-ish 393×851 viewports/UAs), driving real
games on live Firebase (killteam via a hand-built fixture; 40k via
`GameState.createGame()` with two real published 13-unit-ish rosters,
`window.App.startGame()`, then repositioning real units into shooting
range — the exact technique W40K-UX1's in-progress `_tmp_scroll_repro.js`
already uses, reused read-only, not the file itself). Gestures were
tested with **real Chrome DevTools Protocol touch events**
(`Input.dispatchTouchEvent` — `touchStart`/`touchMove`/`touchEnd`), not
synthetic mouse events, so a "did it work" result reflects what an actual
touchscreen dispatches, not what Playwright's convenience `.click()`
would fake.

**Caveat:** only Chromium is installed in this environment — no WebKit.
This is Chromium's touch/mobile emulation, not real iOS Safari,
which has its own quirks (tap-delay history, stricter `touch-action`
requirements, different viewport-unit behavior). Treat every finding
below as "confirmed broken/working under Chromium touch emulation" —
real-device spot-checks are still worth doing before calling mobile
support done.

**Caveat 2:** `warhammer40k/css/styles.css` has uncommitted, in-progress
changes from a concurrent session (W40K-UX1) at the time of this audit —
a `clamp()` side-panel-width fix and a hover-cursor fix, both already
live in what I tested. This report reflects the code as it stood at
audit time, W40K-UX1's in-flight work included. Findings may shift by
the time this is read; overlaps with that session's own scope are
called out explicitly below.

---

## killteam/

### 1 — LAYOUT: critical, board is effectively invisible on a real phone

At 390×844 (iPhone-ish), `.board-wrap` renders **24px wide** — of a
390px viewport. Screenshot: the board is a near-invisible dark hairline
between the dice panel and the action log.

Root cause: KT-5 (this repo, last session) fixed a *half-screen-tiled
desktop* squeeze (~960px) by switching the two sidebars and two new
side panels (dice/log) from a fixed `width` to `width: clamp(floor, vw,
ceiling)`. That fix has a floor — `clamp(120px, 12vw, 200px)` for
sidebars, `clamp(130px, 15vw, 220px)` for the dice/log panels — and at
960px the four floors (120+130+130+120=500px) comfortably fit alongside
a usable board. At a **real phone's** 390px, those same four floors
still sum to 500px — more than the *entire* viewport. `flex-shrink:0` on
the panels means they refuse to shrink below their floor, so
`.board-wrap`'s `flex:1` gets squeezed to whatever's left: a negative
number clamped to near-zero. No scrollbar appears (`.game-main{overflow:
hidden}` clips instead), so there's no visual cue anything is wrong —
the board just silently isn't there.

Secondary: the topbar's CP strip (`Test Force Beta 3CP`) wraps onto its
own line at 390px width, costing extra vertical space the game-main row
doesn't get back.

**This is worse than the bug the clamp() fix solved** — not "cramped,"
actually non-functional. See TOUCH/TARGETS below for the downstream
consequences (token untappable, radial menu partially off-screen).

### 2 — TOUCH: hover-dependent content is real, but narrower than it first looks

KT-3's SVG `<title>` token tooltip claims "touch-safe by construction."
That claim is **true but narrow**: the code comment's actual point was
that browsers don't fire a native tooltip on tap, so it doesn't
*interfere* with tap-to-select — confirmed, it doesn't. But the
tooltip's own content (operative name + wounds) is consequently
**unreachable on touch at all** — no long-press fallback exists. Low
stakes: that exact info is already shown redundantly in the sidebar
row, so nothing is lost.

The bigger, previously-unflagged issue: **`title=` is the *only* source
of "why is this disabled" text throughout the action bar** — Move/Dash/
Fall Back/Fight's disabled-reason tooltips, ploy-row descriptions
(`Only usable while Injured`, cover/CP-gate reasons), ability-tag
descriptions, and the weapon-submenu's block reasons (e.g. Heavy's
requirement) all live *exclusively* in `title=`. On a phone, a player
sees a grayed-out button and has no way to learn why — no visible
fallback text anywhere. This is a real, systemic gap, not a single
missing tooltip; it's the pattern behind ~20 of the file's 25 `title=`
attributes.

### 3 — TARGETS: radial ring is sized fine, but has no edge-awareness

The activation radial (6 buttons, 50×50px) and the weapon submenu
(54×54px weapon buttons) are sized *above* the 44px minimum in
isolation. But:
- The radial menu's position is fixed-pixel-offset from the token's
  *screen* position with **no viewport-edge clamping at all**. Measured
  on a token near the board's left edge: the "Conceal" ring button
  rendered at `y=-14` (off the top of the screen). This isn't only a
  consequence of the LAYOUT bug above — any token near any real board
  edge on a narrow screen risks the same thing, since the ring math
  never checks against viewport bounds.
- The weapon submenu's **"Back" button measured 40×40px — below the
  44px minimum** — and one weapon option rendered at `y=-27` (off-screen)
  for the same edge-token reason.

### 4 — GESTURES: confirmed broken under real touch, not a hypothesis

Dispatched real `touchStart`/`touchMove`/`touchEnd` (no mouse events at
all) on an operative after arming Move via the Move button: **the
operative did not move.** Confirmed by code inspection why: `killteam/
index.html` has **zero** `touchstart`/`touchmove`/`touchend`/Pointer
Event listeners anywhere in the file — every drag flow (Move/Dash/Fall
Back via `startMove`, drag-to-shoot, fight-drag, markerlight-drag,
cast-drag, terrain paint) is wired exclusively through `mousedown`/
`mousemove`/`mouseup`, which a touchscreen does not dispatch for a drag
gesture (only a stationary tap gets a synthesized compatibility click).
**Every drag-based action in the app is non-functional via touch,
independent of the layout bug.** There is no pan/zoom on the board
either — not a conflict with dragging, just absent entirely (fixed
SVG viewBox, no gesture handling of any kind).

### 5 — WHAT WORKS

Simple taps work fine wherever they're reachable: activating an
operative by tapping its token (a browser's synthesized click fires
after a stationary touch), phase-bar buttons (Roll Dice, Apply Damage,
End Activation, ploy rows), on-screen radial menu items, sidebar
scrolling. KT-5's dice-panel/log-panel/board-condition-dot visuals are
fully legible once actually reachable. The failure mode here is
*specific*, not uniform: tap-driven menu actions are fine; anything
requiring a drag (movement, targeting) and the board's own screen
real estate are what's broken.

---

## warhammer40k/

### 1 — LAYOUT: different mechanism, same severity — board squeezed to ~10px in BOTH dimensions

At 390×844, `.board-wrap` measured **130px wide × 8px tall**. A token
on it measured a 1.5×1.5px screen box — sub-pixel, not a rendering
issue, an actual "there is no room" issue.

Root cause is *not* the side-panel clamp() floors this time — those
are already only 130px each (W40K-UX1's in-flight fix, confirmed
current). The new culprit: the **Shooting phase's "select a unit to
shoot" list renders one button per unit-group, uncapped, inside
`.phase-bar`**, which has no `max-height` or internal scroll. With a
real ~13-unit-group roster (confirmed with two real published rosters,
47 and 53 live models), that list alone is tall enough to fill nearly
the *entire* 844px viewport on its own — squeezing `.game-main`'s
`flex:1` board row down to whatever's left: single-digit pixels.
Screenshot: topbar, CP strip, and a 13-button "select a unit to shoot"
list literally fill the whole screen; the board and both side panels
are not visible at all.

This directly overlaps `_tmp_scroll_repro.js`'s own stated purpose
("reproduce the page-scroll bug with a 13-unit army... before touching
any CSS") — W40K-UX1 is already on this thread. This audit's addition:
on a real phone, the consequence isn't just page scroll, it's **total
board occlusion** — meaningfully more severe than a desktop scrollbar,
worth folding into that fix's priority if it isn't already scoped that
way.

### 2 — TOUCH: materially better shape than killteam here

Only 3 `title=` attributes in the whole codebase, all on dev-only
preset buttons — no equivalent of killteam's "disabled-reason text only
exists on hover" pattern. W40K-UX1 item 1 already added `@media
(hover:hover)` gating for the token cursor (confirmed in the current
CSS, same reasoning as killteam's KT-3 fix). **Forward-looking flag per
the brief:** W40K-UX1 is about to add *more* hover labels. If those
follow killteam's `title=`-only pattern (content that exists nowhere
except on hover), it imports killteam's problem into an app that
currently doesn't have it. Recommend any new hover label ship with a
tap-reachable fallback (visible-by-default compact text, or tap-to-
expand) from the start, not `title=` alone — much cheaper to build right
once than to retrofit ~20 call sites later, which is exactly the
position killteam is in now.

### 3 — TARGETS: unit cards good, shooting-list buttons too short

Unit cards in the side panel: 108×116 to 108×133px — comfortably above
the 44px minimum. But the Shooting phase's per-unit "select a unit to
shoot" buttons measured **235×35px — below the 44px minimum**, stacked
with minimal gap between adjacent buttons, real mis-tap risk. Board
tokens couldn't be fairly measured at their intended size — the board
is currently collapsed to single-digit pixels by the layout bug above,
so any size measured there right now is an artifact of that bug, not a
real reading. Flagged as open, not asserted good or bad — re-measure
once item 1 is fixed.

### 4 — GESTURES: same conclusion as killteam, same root cause

`warhammer40k/js/board.js` has the same shape of problem: movement drag
and casualty-allocation drag are wired through `mousedown`/`mousemove`/
`mouseup` with **zero** touch or Pointer Event listeners anywhere in
`js/*.js`. Confirmed empirically: a real touch-drag (CDP touch events,
no mouse) on a token produced no change in `#drag-overlay`'s content —
the drag never registered. No pan/zoom exists either.

One meaningful difference from killteam, worth calling out as a
design advantage already in place: **shooting/charge target selection
is a single `mousedown`-click on the target, not a drag** (`board.js`'s
`onTargetSelected` handler). That specific interaction is architecturally
closer to touch-friendly already — a real tap would very likely register
once the layout bug stops making targets unreachable — it just hasn't
been touch-tested here because nothing is currently visible/tappable to
test it against. Movement is still drag-based and still broken.

### 5 — WHAT WORKS

Unit-card taps, phase-bar buttons, dev-panel presets — all plain-tap
driven, all functional. Click-to-target for shooting/charging is
architecturally drag-free (see above) — plausibly touch-friendly
already, pending the layout fix to actually reach it. Movement's
model-repositioning is the one gesture-dependent piece confirmed broken.

---

## Costing the two options

### (a) Responsive patch — make the existing UI survive a phone

Per-app work, roughly in priority order:

1. **Real phone breakpoint that collapses/hides side panels** instead
   of relying on `clamp()` alone (which is provably insufficient below
   the panels' combined floor width). Same conceptual fix needed in
   both apps — they've independently converged on the identical
   side-panel-flanking-board layout pattern, so it's one pattern
   design, two applications.
2. **Convert every drag flow to Pointer Events** (`pointerdown/move/up`
   — unifies mouse+touch+pen, standard fix, avoids hand-rolling
   parallel touch listeners next to the existing mouse ones). Killteam
   has ~6 distinct drag flows (move/dash/fallback, shoot-drag,
   fight-drag, markerlight-drag, cast-drag, terrain-paint); 40k has ~3
   (movement, casualty-allocation, terrain-paint). Mechanical per flow,
   but each needs real-interaction re-verification (`touch-action: none`
   CSS is usually also needed so the browser's own scroll/pinch doesn't
   hijack the drag — an easy thing to miss per flow). **This is the
   single largest line item in the patch — realistically the majority
   of total effort**, and it's needed regardless of which option is
   chosen, since even a mobile-first mode needs *some* non-mouse way to
   specify movement/targeting.
3. **killteam-specific:** replace `title=`-only disabled-reason/
   description text with a tap-reachable fallback. Large surface
   (~20 call sites) — can be done incrementally, highest-traffic first
   (action-button disabled reasons before ability/ploy descriptions).
4. **killteam-specific:** radial menu edge-clamping — one function
   (`showRadialMenu`/the weapon-submenu positioning math), bounded
   scope, moderate manual-testing surface (many token positions).
5. **40k-specific:** cap + internally scroll the Shooting phase's
   "select a unit to shoot" list; bump its button height to 44px. Small,
   mechanical, high value given the severity found in item 1.
6. **Both:** an actual-device verification pass before calling this
   done — Chromium touch emulation is a reasonable proxy, not a
   substitute for real Safari/Chrome-on-Android.

Net: a real, multi-session body of work per app — not a quick pass.
killteam is somewhat larger (more drag flows, more `title=` debt); 40k
somewhat smaller (fewer drag flows, cleaner hover story, already
mid-fix on the layout side via W40K-UX1).

### (b) Mobile-first mode — separate phone-shaped UI, desktop unchanged

A second, purpose-built UI per app for "take your turn" — tap-first,
single-column, likely trading the spatial board-drag interactions for
stepped pickers (e.g. movement as a distance/direction choice instead
of a freehand drag — 40k's click-to-target shooting is already a working
precedent for "drag-free but still spatially meaningful"). This
sidesteps the side-panel squeeze and radial-edge-clamping problems
entirely (no side panels, no radial menu in a from-scratch phone flow),
and doesn't touch any code path the desktop UI runs (a real advantage
over (a): zero regression risk to the working desktop experience). It
does NOT sidestep the gesture problem in general — some non-drag way to
specify movement/targeting still has to be designed and built, just
inside a new shell instead of retrofitted into the old one.

This is bigger raw effort than (a) — it's most of a second small app's
worth of presentation work per game app, even though the underlying
game-state/Firebase-write layer is fully reusable as-is (a real
efficiency: the DATA side needs zero new work, only NEW rendering +
interaction code). Per CLAUDE.md's "build native, promote on a second
real consumer" rule, this should be built once, live, in whichever app
goes first — not designed as a shared "mobile shell" up front on
spec, even though killteam and 40k's underlying structure is similar
enough that a shared pattern would likely emerge naturally later.

### Recommendation

**Do the responsive patch's cheap subset (below) first, now — it's not
optional, the current state is "invisible," not "ugly."** Then treat
mobile-first mode as the real long-term answer to the brief's actual
"why" (play-by-link on a phone is the delivery vehicle, not an edge
case) — a separate, bigger initiative once there's been a real turn
taken on a real phone to learn from, rather than designing it blind.
The full responsive-patch item 2 (gesture conversion) is real,
unavoidable work under *either* path, so it isn't wasted effort if (b)
is chosen later — it's the same "how do I specify a move without a
mouse" problem either interaction model has to solve.

### Cheap high-value subset (per the brief's ask)

Three changes, CSS/small-JS only, no gesture work, that would take both
apps from **"can't see the board at all"** to **"board is visible and
usable, tap-driven actions work, dragging still needs the bigger fix"**:

1. A real mobile breakpoint (e.g. `max-width: 600px`) that **hides**
   (not shrinks) the side panels behind a toggle/drawer, in both apps —
   directly fixes killteam's 24px-wide board and most of 40k's
   collapse.
2. Cap and internally scroll 40k's "select a unit to shoot" list
   (and audit killteam's phase-bar for the same unbounded-content
   risk generally) instead of letting it evict the board.
3. Killteam's radial-menu edge-clamping — cheap, one function, stops
   buttons rendering off-screen for any token near a board edge.

None of these touch the drag-gesture problem — that's real work with no
shortcut — but together they're the difference between Nox's brother
being unable to see the board at all and being able to see it, read it,
and take simple tap-driven actions on it today.
