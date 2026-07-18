# CLAUDE.md

This is Jonathan's ("Nox") Warhammer companion-app monorepo. He plans and
reviews work as "Nox"; you implement as "Nyx". Planner-authored work briefs
live in `briefs/`; this file plus `PROJECT_STATE.md` plus the relevant
subproject's `DEVLOG.md` are meant to be everything a fresh session needs.

## Always, at session start
1. Read `PROJECT_STATE.md` (repo root) — current priorities, what's done,
   what's queued, standing decisions.
2. Read the `DEVLOG.md` of whichever subproject the task touches (each
   subproject keeps its own — `roster/DEVLOG.md`, `killteam/DEVLOG.md`,
   etc.). Don't assume `PROJECT_STATE.md` alone has the detail.

## Standing rules (do not relitigate without a new decision recorded)
- **Verify-first.** Check a brief's claims about the codebase against
  actual source before implementing. Several briefs this project have been
  rewritten by findings from doing this — it earns its keep. Report
  divergence rather than silently bending the implementation to match a
  wrong assumption.
- **No hand-edits to `gameData/` in Firebase, ever.** Corrections go in
  `data-pipeline/parsers/patches.json`, applied at parse time, fail loud if
  a patch stops matching.
- **Snapshot rule.** Game apps copy the relevant bonus catalog into the
  game document at creation and never re-read `gameData/*/bonuses/` for
  that game — re-running the pipeline must not change the rules of a game
  in progress.
- **Determinism is non-negotiable.** Both clients must compute identical
  results from the same inputs. This is a mechanics requirement, not a
  rules-fidelity one.
- **Legibility over rules-as-written.** A bonus's description is the
  player-facing contract. Generic, understandable modifiers beat faithful
  card-exact recreations — neither player is a rules lawyer.
- **Commit per milestone.** Push before reporting; cite commit hashes in
  reports back to Nox.
- **Disk beats chat.** Briefs, amendments, and state live in this repo,
  not only in conversation history.
- **Build native to the project you're working in.** Don't design a
  general/shared version of something before it has one real, proven
  implementation and a second concrete consumer that actually needs it.
  This does not mean write throwaway code — keep interfaces uncoupled
  from incidental project details wherever that costs little, so
  promotion to `shared/` later is a relocation, not a rewrite (WHF-3's
  `chargeReach` is the model). The trigger for promoting something to
  `shared/` is a concrete second consumer with an actual need, not "this
  seems generally useful." `bonus-resolver.js` is the precedent: built
  for KT, proven live, promoted once WHF had a real need for its
  condition machinery.

## Pointer / touch / pan-zoom canon (hard-won, MOBILE-1 + MOBILE-2, 2026-07-18)
Three landmines two sessions already stepped on. They exist so the next
session doesn't rediscover them.

- **`touch-action: none` must be a permanent CSS rule** on the drag
  element, never set reactively inside a `pointerdown` handler. Setting
  it reactively is too late — the browser decides scroll-vs-drag before
  your JS runs, so the first gesture is lost. Applies to every drag flow
  in all three games.
- **Do not call `preventDefault()` on `pointerdown` indiscriminately.**
  It breaks tap-to-place interactions (40k deployment placement, and any
  "click empty space to put something there" flow). If a flow needs both
  drag and tap-to-place, gate the `preventDefault` on actual drag
  movement, not on the initial press.
- **Convert drag flows by REPLACING mouse listeners with pointer
  events, never by ADDING pointer listeners beside the mouse ones.**
  Both firing is a double-fire — a duplicate Firebase write, a client
  desync. Determinism between clients is non-negotiable. Pointer events
  fire for mouse, touch, and pen through one code path, so desktop keeps
  working through the same handlers unchanged — this is why pointer
  events, not a parallel touch-listener set, and not Hammer.js (native
  pointer events made those obsolete).
- **Board pan/zoom is SVG `viewBox` mutation, never a CSS transform.**
  A CSS transform risks divergence between visual position and the
  coordinate math the engine uses; `viewBox` keeps all coord/LOS/range
  math in board units, untouched, regardless of zoom level.
- **Zoom range is derived per board size + screen size, never
  hardcoded.** 40k has 3 map sizes, all 44" wide: combat-patrol 44x30,
  incursion 44x60, strike-force 44x90. A fixed zoom max is wrong because
  more board in the same screen means smaller tokens. Grid scale itself
  is a flat constant across all three — 1 square = 2 inches, does not
  vary per map (also the permanent answer to "how many inches is a
  square?").

**Known mobile papercut, not yet fixed (flagged 2026-07-18):** after
MOBILE-1 capped `.phase-bar` with an internal scroll, 40k's "End Phase"
button can sit below the fold on a phone — the most-pressed control now
requires scrolling a side panel every phase. Candidate fix: pin
phase-advance controls outside the scroll region. Not yet briefed.

## Parallel sessions
More than one session may be working here at once. Before starting work on
a brief in `briefs/`, check its file for a `CLAIMED: <date>` line near the
top. If present and it isn't yours, stop and say so rather than duplicating
or colliding with that work. If absent, add one (`CLAIMED: <today's date>`)
and commit that alone before starting the real work, so the claim itself is
visible to any other session.

## Data canon (decided — see PROJECT_STATE.md for the reasoning if revisiting)
- **KT units:** BSData pipeline output, `gameData/kill-team/factions/...`.
- **40k units:** the OLD FLAT POOL, `gameData/warhammer-40k/{factionSlug}`
  — it has `squadSize`/`pointsTable`, 231 units total, and is canonical.
  The BSData-parsed 40k subtree (`gameData/warhammer-40k/factions/...`) is
  **deprecated** — zero consumers, do not read from it, do not delete it
  without a separate decision to do so.
- **Bonus catalogs** (`gameData/{system}/bonuses/`, both systems) stay
  canonical regardless of the above.
- Missing 40k composition data is handled by lazy hand-authoring through
  the Unit Creator, on demand — not by deriving it from BSData XML (tried,
  rejected: ~25% confident-derivation coverage plus a real silent-corruption
  risk from ambiguous sibling selection-entries).

## Layout
- **No live deployments exist** (Netlify hosting dropped 2026-07-04, build
  minutes exhausted — everything runs on local servers against live
  Firebase until there's a usable product). Push-to-`master` on any
  subproject carries zero ship risk right now. `netlify.toml` stays in the
  repo, dormant — the revival kit if hosting comes back (likely Firebase
  Hosting, decided later), not a currently-active config.
- `roster/`, `killteam/`, `warhammer40k/`, `data-pipeline/`,
  `warhammer-fantasy/`, `age-of-sigmar/` — subprojects, each still has its
  own `DEVLOG.md`.
- `shared/bonus-resolver.js` — the ONE copy (no more per-app vendored
  copies; that pattern and its drift-checker were deleted in the GIT-2
  monorepo migration). Reference it directly, e.g. `../shared/` from a
  sibling subproject.
- `briefs/` — every work brief, historical and active, flat.
- `docs/memory/` — Claude's own persistent session-memory files, moved
  here because the repo is the source of truth, not a private cache.
- `PROJECT_STATE.md` — regenerated at milestones by Nox's planner;
  read this first, every session.
- **Local setup (fresh clone):** `roster/`, `killteam/`, and
  `warhammer40k/` each need a gitignored `firebase-config.js` in their own
  directory before they'll run (each has a `firebase-config.example.js` —
  copy it and fill in real values, or ask Nox for the real file directly).
  `warhammer-fantasy/` doesn't have one yet — that subproject never got a
  live Firebase config set up. `data-pipeline/parsers/upload.js` reads its
  config from `../roster/firebase-config.js` (a sibling-directory relative
  path — this broke once already when `roster/` moved into the monorepo,
  fixed post-migration; don't re-hardcode an absolute path here again).
