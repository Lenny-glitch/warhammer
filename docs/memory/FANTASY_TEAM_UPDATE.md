# Fantasy Team Update — from the KT/40k side (Nox's planner)
# 2026-07-06. Save to ~/projects/warhammer/docs/ and upload to
# the fantasy planner chat as orientation.

## 1. THE REPO MOVED — this is the one that breaks you if missed
All six projects merged into ONE monorepo: ~/projects/warhammer
(subdirs: warhammer-fantasy/, age-of-sigmar/, roster/, killteam/,
warhammer40k/, data-pipeline/, shared/, briefs/, docs/).
- Old separate repos are renamed *-old and are DEAD: their git
  remote credential was revoked (leaked-PAT incident, purged from
  history). Never push them anywhere. Work only in the monorepo.
- Single branch: master. Remote:
  https://github.com/Lenny-glitch/warhammer.git
- Claude Code sessions have no push credential — commit locally,
  Nox pushes. Reports cite commit hashes.
- LAUNCH ALL SESSIONS FROM ~/projects/warhammer (memory is keyed
  to the launch directory; CLAUDE.md at root auto-loads and
  orients every session).

## 2. Conventions now in force (CLAUDE.md has the full set)
- Disk beats chat: briefs live in briefs/, amendments go INTO
  brief files, state lives in PROJECT_STATE.md at repo root.
- Claim a brief before working it: add "CLAIMED: <date>" line to
  the brief file and commit. Parallel sessions exist.
- Verify-first: check every brief's claims against actual source
  before building; report divergence instead of guessing.
- No hand-edits to Firebase gameData/ — data-pipeline/parsers/
  patches.json is the home for corrections.
- No live deployments anywhere (Netlify abandoned). Local servers
  + live Firebase until there's a usable product.

## 3. What exists that Fantasy should BUILD ON, not rebuild
- shared/bonus-resolver.js — the game-agnostic bonus/modifier
  engine (currently v1.2.1, v1.3.0 imminent). Pure functions:
  resolveStats/eligibleBonuses/validateBonus. Works in Node
  (require) and browser (window.BonusResolver). It is proven in
  live KT combat as of this week. WHF magic/psychology was always
  intended to ride this: the stat vocabulary extends additively
  (add WS/BS/Ld etc., never rename), conditions (Fear, Panic)
  use the same machinery as KT's stunned/markerlight. Read its
  header + data-pipeline briefs BON1–BON2 in briefs/ before
  designing any WHF modifier/buff system.
- The roster app (roster/) is multi-system by design — KT and
  40k flows exist; WHF as a third system should extend it, not
  build a separate roster tool. Exports are denormalized; games
  read exports/, never rosters/.
- Firebase project warhammer-5f2f4: rules recorded in
  data-pipeline/firebase-rules.json (manual witness — update the
  file if you touch the console). No auth anywhere; links are
  access.

## 4. Priorities (Nox's, project-wide)
Fun with his brother > rules-as-written. Determinism between
clients is non-negotiable. A bonus's plain-English description
is the player contract. Edition pinned. KT ships first; Fantasy
grows against the shared core and must not break KT (regression
awareness when touching shared/ or roster/).

## 5. Where the KT/40k side currently is (context, not tasks)
Bonus engine live in KT combat (weapon keywords affect real
dice). Roster builds+publishes both systems. In flight:
PIPE-H1 hygiene pass (data-pipeline), roster UX. Queued: 40k sim
reads loadouts, composition validation, KT play-by-link catch-up
features. Full detail: PROJECT_STATE.md + each DEVLOG.
