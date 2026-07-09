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
