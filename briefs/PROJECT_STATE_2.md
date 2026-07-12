# PROJECT_STATE.md — v4, 2026-07-11. Monorepo root.
# Cold-start: read this + the touched subproject's DEVLOG.

## STRUCTURE
One repo ~/projects/warhammer, ONE branch: master. Any other
branch appearing is a bug — report, don't use. Git from the
UBUNTU TERMINAL ONLY, never PowerShell/\\wsl.localhost (Windows
git manufactures phantom changes and chokes on symlinks).
Remote: github.com/Lenny-glitch/warhammer. Sessions can't push —
commit + cite hashes, Nox pushes. node_modules/ and
.playwright-libs/ are gitignored repo-wide.

## DEPLOYMENT (changed — v3 said none exists)
LIVE: Firebase Hosting, https://warhammer-5f2f4.web.app —
root landing page → /roster/, /killteam/, /warhammer40k/,
/warhammer-fantasy/. Deploys are MANUAL: `firebase deploy
--only hosting` uploads the LOCAL working tree (not git; the
gitignored firebase-config.js ships correctly because of this).
No builds, no credits, no deploy branch. RULE: any user-facing
fix isn't done until pushed AND redeployed. firebase.json holds
hosting ignores; root index.html is the landing page.
ONE DATABASE — dev and live share Firebase. Backup habit:
console → Realtime Database → Export JSON before risky work and
before any play session with Nox's brother.

## GOAL / PRIORITIES — unchanged
Play by link with brother, fun > RAW, determinism non-negotiable,
description = player contract, edition pinned, disk beats chat,
verify-first, one session per subproject (CLAIMED lines).

## DATA CANON — unchanged
KT units: BSData. 40k units: flat pool (BSData 40k subtree
deprecated, delete at enrichment). rng null/absent = UNLIMITED
(engine-wide sentinel). No hand-edits to gameData/; patches.json.
Games read exports/, snapshot at creation.

## MAJOR ARCS CLOSED (since v3)
- BONUS ENGINE COMPLETE end-to-end: resolver v1.4.0 (28/28),
  onAttack trigger, catalog live, weapon keywords modify real
  dice in live KT games, dev readout explains applied bonuses.
  Verified in production by Nox (Fireblast, RNG ∞).
- KT-RS roster picker (games created from published exports).
- PIPE-H1 hygiene (rng extraction +62 weapons, descriptions,
  appliesTo, forced catalog re-upload).
- KT-2 Part 2: drag-to-shoot, damage floaters, injured pulse
  ring, dice tumble for Fight, all real-browser verified.
- WHF-4a + 4a.1: full shooting cycle, Stand-and-Shoot works,
  engaged state (interim: never clears until WHF-5), base-to-
  base charge geometry, Magic/Combat pass-through phases.
- WHF-5m: friendly-overlap prevention, movement bar, undo
  (refuses charged/fled), reach/range rings, index.html entry.
- ROSTER-UX-2: guided flow (Build Roster funnel, FactionPicker),
  Maintenance passphrase gate (MISCLICK BARRIER, NOT SECURITY —
  documented as such) over Unit Creator/Clean Drafts/export
  delete, router-level.
- Git incidents survived: leaked-PAT purge (old *-old repos must
  NEVER be pushed), stale main branch deleted, monorepo (GIT-2).

## NOX — open
- Push + `firebase deploy --only hosting` (ROSTER-UX-2 pending)
- Database JSON backup (first one!)
- Playtests: WHF-5m (overlap/bar/undo/rings), KT-2 P2 (drag,
  floaters, injured ring, melee tumble, click-flow regression)
- Bonus-readout screenshot (for the record)
- Two-device rehearsal (PC + phone, same game link) before
  brother session

## LANES — next briefs (after Nox playtests pass)
Nyx → Roster 3b Part 3: 40k sim reads chosenLoadout, retires
  KL-1/KL-2 (brief exists, needs path-corrected reissue first)
Hades → WHF-5: Combat phase (also unlocks engaged units)

## QUEUED
Composition validation (real rules + red banner; tri-state
badge shipped) · WHF backlog items 2/3/7 (wound display,
controls, shot feedback) and 4/5 (unit cards, medieval
aesthetic) · ghost-drag movement (pending Nox's 5m verdict) ·
BON-3 (CP bonuses, stun/markerlight tokens) · BON-4 (40k
bonuses, wound-split vocab, flat-pool enrichment) · KT-3..7
ladder, KT-7 = play-by-link catch-up (banner/arrows/replay) ·
upload.js --force per-path scoping · real auth (trigger:
strangers get links, not family).

## STANDING QUIRKS
KT dev mode: ?dev=true&game={id}. Nyx auto-memory keyed to
launch dir — always launch from repo root. Playwright works via
.playwright-libs/ libasound extraction. Fantasy/AoS: WHF is 5
phases deep; age-of-sigmar/ still empty.
