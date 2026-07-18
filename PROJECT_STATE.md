# PROJECT_STATE.md — v6, 2026-07-18. Monorepo root.
# COLD START: this + the touched subproject's DEVLOG = full context.
# For a fresh planner chat: upload this file, say "you're my
# Warhammer planner, here's the state." That's the whole handoff.

## THE GOAL
Nox plays Warhammer with his brother (Aaron), by link, for fun.
It is WORKING — they've now played multiple real games of Kill
Team and 40k against each other. Everything below serves that.

## PRIORITIES (in force, do not relitigate)
1. Fun with the brother > rules-as-written. Neither is a rules
   lawyer. Generic legible bonuses beat card-exact recreations.
2. Determinism between clients is non-negotiable (that's
   mechanics, not fidelity).
3. LEGIBILITY IS CORRECTNESS. The engine is usually right and
   unhelpful — "told not shown" has been the #1 recurring
   complaint. A description IS the player contract.
4. Edition pinned; data updates only when Nox chooses.
5. Disk beats chat: briefs live in briefs/, amendments go INTO
   brief files, state lives here.
6. Verify-first: sessions check briefs against source and report
   divergence. This has saved the project repeatedly — planner
   briefs have been wrong many times, INCLUDING on 2026-07-18
   (planner assumed one map size; assumed casualty-alloc was a
   drag; invented a "~5x" zoom number — all caught by sessions).
7. *** NEW FOCUS: MOBILE. Aaron plays by link on a PHONE and said
   he'd play MORE if it worked there. Play-by-link IS a phone use
   case. As of 2026-07-18 both apps are mobile-ready ON EMULATION
   but UNVERIFIED ON A REAL PHONE. That real-device check is the
   single highest-value open action in the project. ***
   Prior focus order (ROSTER -> 40K -> KILLTEAM, WHF parked) still
   holds for non-mobile work.

## WORKING PROCESS
- Nox runs TWO Claude Code lanes (historically "Nyx" = KT/40k/
  pipeline, "Hades" = WHF — names are habit; the real rule is
  ONE SESSION PER SUBPROJECT, enforced by a "CLAIMED: <date>"
  line committed into the brief file).
- Planner (this chat) writes briefs -> Nox saves to briefs/,
  commits, points a lane at the FILE (never pastes contents).
- Sessions cannot push. They commit + cite hashes; Nox pushes.
- NOX'S PREFERENCE (important): test requests must be NUMBERED
  CHECKLISTS with exact steps and pass/fail criteria — never
  buried in prose. He multitasks heavily. Casual swearing fine.
  Be direct, dry, no padding. He works best from bullets, not
  walls of text.
- BRIEF NAMING: give near-identical bugs DISTINCT names. The
  briefs/ folder has duplicate-download collisions (e.g.
  "PHASE14_BRIEF (2).md") and two "unlimited range" concepts got
  briefly confused on 2026-07-18. Distinct names prevent
  ferrying the wrong file.

## STRUCTURE / GIT
One repo ~/projects/warhammer, ONE branch: master. Any other
branch is a bug — report, don't use.
GIT FROM THE UBUNTU TERMINAL ONLY. Never PowerShell over
\\wsl.localhost — Windows git invents phantom changes and chokes
on symlinks (cost a whole debugging session once).
Remote: github.com/Lenny-glitch/warhammer.
node_modules/ and .playwright-libs/ gitignored.
.firebase/ SHOULD be gitignored — .firebase/hosting..cache is a
deploy artifact that keeps showing up staged/modified. Add it.
Old *-old repos exist on disk and contain a purged-but-present
leaked PAT in history — NEVER push them anywhere.

## DEPLOYMENT
LIVE: Firebase Hosting, https://warhammer-5f2f4.web.app
Root landing page -> /roster/, /killteam/, /warhammer40k/,
/warhammer-fantasy/ (+ a joke "SUPER SCARY" button that plays 10
hours of screaming goat; it is load-bearing morale).
Deploys are MANUAL: `firebase deploy --only hosting`, uploads the
LOCAL tree (not git — which is why the gitignored
firebase-config.js ships fine). No builds, no credits.
RULE: a user-facing fix isn't done until pushed AND redeployed.
Push =/= deploy — a git push does NOT update the live site.
*** CACHE: RESOLVED 2026-07-18. firebase.json originally had NO
headers config -> stale JS served to returning players, the root
of a long string of ghost bugs. First fix used a glob that missed
directory URLs (/killteam/ has no ".html", so it fell through to
Firebase's default max-age=3600). Second fix uses
"source": "**" with Cache-Control: no-cache — verified live
(no-cache on /killteam/, revalidating). Ghost-bug engine is dead.
Retire any bug that only reproduced on stale cache; several
"known bugs" were confirmed to be cache ghosts (see below). ***
ONE DATABASE — dev and live share Firebase. Back up before risky
work: console -> Realtime Database -> Export JSON.

## DATA CANON (decided, do not relitigate)
- KT units: BSData pipeline (gameData/kill-team/factions/...)
- 40k units: OLD FLAT POOL gameData/warhammer-40k/{slug} —
  has squadSize/pointsTable, only 2 factions (astra-militarum,
  craftworlds-eldar). The BSData 40k unit subtree is DEPRECATED
  (zero consumers).
- Adding 40k factions: ruled = PARTITION (flat pool owns AM/
  Eldar; BSData owns anything new; no overlap). 38 BSData
  factions available, parse clean, lack composition — the roster
  has a lazy hand-author hook for that. NOT YET BUILT.
- rng null/absent = UNLIMITED range (engine-wide sentinel).
  The shoot flow honors this (BUG_KT_UNLIMITED_RANGE, claimed
  2026-07-11) so PSYCHIC weapons with no rng are shootable.
  DO NOT CHANGE THE SENTINEL — it's load-bearing for every
  psychic weapon. Caveat: it cannot distinguish an intentional
  no-rng psychic weapon from a DATA GAP (see KNOWN REAL BUGS).
- No hand-edits to gameData/ ever — data-pipeline/parsers/
  patches.json is the home for corrections (fail-loud on
  no-match).
- Games read exports/, NEVER rosters/. Snapshot at creation:
  games freeze their bonus catalog + unit data, so re-uploads
  never change a game in flight.
- 40k has 3 MAP SIZES, all 44" wide: combat-patrol 44x30,
  incursion 44x60, strike-force 44x90. Grid scale is a FLAT
  CONSTANT: 1 square = 2 inches, on all three.
- Firebase rules recorded at data-pipeline/firebase-rules.json
  (manual witness — console is the only deploy path).
- No auth anywhere. Links are access. Maintenance passphrase gate
  in the roster app is a MISCLICK BARRIER, not security, and is
  documented as such.

## POINTER / TOUCH CANON (learned 2026-07-18, see CLAUDE.md)
- `touch-action: none` must be PERMANENT CSS on the drag element,
  never a reactive JS toggle inside pointerdown (too late — the
  browser decides scroll-vs-drag before JS runs).
- Do NOT preventDefault() on pointerdown indiscriminately — it
  breaks tap-to-place (deployment placement). Gate it on actual
  drag movement.
- Convert drag flows by REPLACING mouse listeners with pointer
  events, never ADDING alongside (double-fire = duplicate write
  = desync).
- Pan/zoom = SVG viewBox mutation, NOT CSS transforms (transforms
  diverge visual position from the engine's coord math).

## MAJOR ARCS CLOSED
- BONUS ENGINE, end to end: shared/bonus-resolver.js (v1.5.0),
  weapon keywords modify real dice, dev readout explains applied
  bonuses in plain English. Verified in live play.
- CP + PLOYS (BON-3): 7 universal generic ploys, CP economy,
  usage limits, condition tokens (stun, markerlight).
- PSYCHIC POWERS (BON-3b): 8 real-named faction-locked powers
  across 6 factions, `damage` effect type, cast UI. Adding more
  is data-only. Deepest psychic factions: Warpcoven/Thousand Sons.
- CATALOGUE: parser-gap operatives fixed; remaining zero-weapon
  ones are RAW-correct (Machine/Turret/Bomber abilities).
- ROSTER: builds + validates + publishes both systems. Live
  legality banner (red/green/gray). 42 of 47 KT factions
  auto-authorable; 5 gap factions remain (strike-force-variel +
  warpcoven leader; chaos-cult + elucidian-starstriders +
  gellerpox-infected size).
- KT: KT-1..KT-5 shipped. Alternating activation, drag-to-shoot,
  action log, win/lose screens, dice legibility, board condition
  indicators, movement tweens, shot beams.
- 40K: Part 3 shipped. Lobby roster picker, same-faction games,
  simultaneous terrain, token sizes by base, zone clarity, undo,
  auto-arrange. Plus W40K-UX1/UX2: clamp side-panel width, hover-
  cursor gating, token size by keyword, gold-hatched "YOUR ZONE",
  one-level undo, auto-arrange grid-snap. Verified live vs Aaron's
  real 13-unit roster.
- WHF: movement, shooting, combat (WHF-5). Parked.
- *** MOBILE-1 (2026-07-18): both KT and 40k made phone-visible
  and phone-operable ON EMULATION. Breakpoint hides side panels
  behind a drawer (fires in BOTH orientations via max-width:600px
  OR max-height:500px). All drag flows converted to pointer
  events (KT 6 flows, 40k 2 — casualty-alloc turned out to be a
  click, not a drag). KT radial menu edge-clamped. 40k phase-bar
  capped + internally scrolled; shooting buttons bumped to 44px.
  Full real-touch capstone turn passed in BOTH apps under
  Chromium/iOS-Safari-UA emulation. ***
- *** MOBILE-2 (2026-07-18): 40k board pan/zoom via viewBox.
  Zoom range derived per map size; all 3 maps reach 44px tokens
  at max zoom. One-finger token = move, one-finger empty = pan,
  two-finger = pinch. Scale indicator "1 square = 2\"". Full
  real-touch capstone passed on strike-force (worst case). ***

## IN FLIGHT / IMMEDIATE
- *** NOX: REAL-DEVICE CHECK on an actual phone, portrait.
  Everything mobile is verified on emulation only — never real
  iOS Safari, which diverges most on pinch/touch-action/viewport
  units. Open both apps on the phone, confirm board fills width
  and a model can be dragged. This is the top open action. ***
- NOX: fold POINTER/TOUCH CANON into CLAUDE.md (draft exists).
- BUG_KT_MISSING_RANGE_BRIEF.md — ferried 2026-07-18, out with a
  lane. Investigate-first: is the Nemesis Claw missing-range a
  parser gap (whole-catalogue) or a source gap (patches.json)?
  Lane stops + reports if the audit list is large.
- briefs/BUG_WHF_TURNLOOP*.md — written, WHF parked. (Two copies
  on disk — the _1 is a duplicate download.)

## KNOWN REAL BUGS (not ghosts)
- Nemesis Claw / Night Lords: several ranged weapons have NO rng
  in data -> render as unlimited via the sentinel. Real data gap.
  Being investigated (BUG_KT_MISSING_RANGE). Root cause (parser
  vs source) not yet known.
- 40k "?" stats on a unit card: root-caused to a getRosterUnitDef
  lookup miss falling through to a legacy stat table. Exact unit
  not yet pinned — screenshot any "?" card in live play to close
  it. (Note: a Wraithguard "?" that "fixed itself" on 2026-07-18
  was a CACHE GHOST, not this bug — no 40k code changed.)

## MOBILE PAPERCUT — flagged, not yet briefed (2026-07-18)
- 40k: after the phase-bar was capped, "End Phase" can sit below
  the fold on a phone — the most-pressed control now needs a side-
  panel scroll every phase. Candidate: pin phase-advance controls
  outside the scroll region. Priority-3 legibility issue. Next
  40k pass, not urgent.

## BACKLOG (from real playtests — Aaron's words where quoted)
MOBILE (partially addressed above; remaining):
- KT `title=`-only debt: ~20 sites where "why is this disabled"
  text exists ONLY on hover -> invisible on touch. Real, systemic,
  deferred to a next phase. Highest-traffic first (action-button
  disabled reasons before ability/ploy descriptions).
- Real-device pass is still owed on everything mobile.
KILL TEAM:
- cover: no label/indicator; low cover blocks LOS but no cover
  save; high cover never prompts
- "thicker slower lasers, missed shots at a different angle"
- terrain with stairs/ladders/levels
- Vox-Trooper, Kasrkin Medic rules unimplemented?
- Terrorchem "doesn't actually do anything"; Hold Fast CP unusable
- blast: wants shoot-at-location with a visible blast zone
- action log: more Pokemon-flavored, color-coded
- game ends silently with tiny "ENDED" — wants elimination mode
- published roster list -> faction-then-team picker
40K:
- range + movement circles (KT has them); health bars (KT has)
- token selection on board (currently only via unit list)
- indirect fire unimplemented/unchecked; CP/stratagems unusable
- pacing: "tedious — just advancing units and having them auto
  form up and take cover when possible"
CROSS-GAME:
- MOVEMENT ANIMATION: A->B with dust + walk/drive/clank audio
  (all three games; explicitly late priority)
- CHESS TIMER: opt-in, both agree, ~10 min each, ticks + sfx
- LIVE vs MAIL as selectable modes (alternating activation is a
  live-play option, not a default — async would be worse)
- WHF backlog: wound display, controls visibility, shot drama,
  card/player-view parity, lean medieval, ghost-drag movement
- BON-4: 40k reads bonuses; wound-split vocab (Twin-linked/
  Sustained/Anti-/Lance)
- KT-7: play-by-link catch-up — permanent link, "since your last
  turn" banner, ghost arrows, step-through replay
- composition rules for 40k (gray "not validated" correct til then)
- upload.js --force is global; wants per-path scoping
- real auth (trigger: strangers get links, not family)

## STANDING QUIRKS
- KT dev mode: ?dev=true&game={id}
- Sessions' auto-memory is keyed to the LAUNCH DIRECTORY —
  always launch from ~/projects/warhammer
- Playwright works via .playwright-libs/ libasound extraction
  (apt-get download + dpkg -x + LD_LIBRARY_PATH, no root)
- Two-browser-context testing is MANDATORY for multiplayer
  work — single-window verification has shipped bugs repeatedly
- age-of-sigmar/ is an empty folder
