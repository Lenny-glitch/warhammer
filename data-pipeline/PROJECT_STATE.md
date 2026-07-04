# PROJECT_STATE.md — regenerated at milestones by Nox's planner
# Last: 2026-07-04 (v2). Cold-start safe: this + repo DEVLOGs = full context.

## GOAL
Play Warhammer with my brother, by link, for fun. Pipeline feeds
Firebase; roster builds army lists; game apps play them. Finish
roster + pipeline + Kill Team to genuinely playable, THEN grow
other systems (40k, WHF, AoS) against the rules-agnostic core.

## PRIORITIES (in force)
1. Fun over rules-as-written; generic understandable bonuses.
2. Determinism non-negotiable (identical results on both clients).
3. Legibility: a bonus's description IS the player contract.
4. Edition pinned; data updates only when Nox chooses.
5. Disk beats chat: briefs, amendments, state live in repos.
6. Verify-first: Nyx checks briefs against source; three briefs
   were rewritten by findings this week — the rule earns its keep.

## DATA CANON (decided, do not relitigate)
- KT units: BSData pipeline, gameData/kill-team/factions/...
- 40k units: OLD FLAT POOL gameData/warhammer-40k/{slug} (has
  squadSize/pointsTable, 231 units). BSData 40k unit subtree
  DEPRECATED (zero consumers ever) — delete during future
  enrichment pass. Bonus CATALOGS (both systems) stay canonical.
- 40k weapon bonus enrichment: future (pre-BON-4), mechanical —
  flat-pool keywords are near-glossary strings.
- PIPE-2 (derive composition from BSData XML): REJECTED, 25%
  coverage + silent-corruption risk. PIPE-3: CANCELLED. Missing
  composition = lazy hand-author via Unit Creator, on demand.
- No hand-edits to Firebase gameData/ ever; patches.json is the home.

## GIT CONVENTION
- roster: canonical branch = deploy, pushes go LIVE via Netlify
  (accepted risk while Nox is the only user). master deleted
  after GIT-1.
- killteam / warhammer40k / data-pipeline: master, local only.
- Commits per milestone, push before reporting, reports cite hashes.
- GIT-1 (branch inventory/consolidation brief): status unknown —
  confirm it ran; no recency shortcuts, ancestry checks only.

## DONE (recent)
- Pipeline complete: BSData upload, patches overlay (fail-loud),
  manifest-gated uploads, firebase-rules.json recorded.
- Bonus engine: resolver 1.2.0 (24/24 tests), 49-entry catalog
  live both systems.
- Roster 3b Part 2 SHIPPED + verified in production: 40k build
  flow on flat pool, squad-size picker, live points, parsed
  loadout choices, hand-author hook (Cadian acceptance case
  passed), publish carries chosenLoadout (export bug caught
  pre-ship), shadow-spectres caveat visible. KT regression good.
- KT-2 Part 1 health arc: approved (damage visibility = polish).
- Draft Cleaner run (11 fixes), rosters root-read rule restored.

## ACTIVE / NEXT (Nyx, in order)
1. GIT-1 if not yet run
2. BON-2a: KT combat profile refactor + replay-identity test
   (brief: killteam/BON2_BRIEF_v2.md) → NOX CHECKPOINT: play one
   game, combat feels identical, say go
3. BON-2b: bonuses resolve in KT shoot/fight + dice readout
   (+ catch-up summary banner if cheap — records exist from 2b on)
4. Roster 3b Part 3: 40k sim reads chosenLoadout, retires KL-1/KL-2
   (brief: ROSTER_3B_PART3_BRIEF.md)

## NOX — open
- 2a checkpoint game when it lands (critical path)
- Boss Nob melee re-pick (if still open)

## QUEUED
- Composition validation: red "roster needs X" banner. FIRST
  REQUIREMENT: the current LEGAL badge on published 40k rosters
  is vacuous — hide it or mark "not validated" until real rules
  exist. Per-faction compositionRules, hand-authored.
- Cosmetic batch: trailing "+" on weapon names, "ops" label on
  40k rosters, author-dialog placeholder truncation, model count
  not shown on publish view.
- KT-2 Part 2 drag-to-shoot → KT-3..7 ladder. KT-7 = play-by-link
  catch-up: permanent link, summary banner ("since your last
  turn..."), ghost arrows, step-through replay (spec in v1 notes,
  Nox's words). Health-arc damage visibility rides along.
- BON-3: CP-spend generic bonuses (+1 tier), condition tokens.
- BON-4: 40k bonus integration; wound-split vocab; flat-pool
  enrichment + deprecated subtree deletion.

## STANDING ASSUMPTIONS
- Roster = only live deployment (Netlify/deploy). Others local.
- Player 2 = Nox until playable, then brother. No auth anywhere;
  links are access.
- Loadouts chosen in ROSTER only; games read chosenLoadout.
- age-of-sigmar/ empty; fantasy barely started (Hades' side).
- KT dev mode: index.html?dev=true&game={gameId}.
