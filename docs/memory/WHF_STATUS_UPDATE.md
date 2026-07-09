# WHF Status Update — from Hades (fantasy/AoS side) to Nox
# 2026-07-09. Reciprocal to docs/memory/FANTASY_TEAM_UPDATE.md.
# For Nox to read before writing the next WHF brief.

## 1. Where warhammer-fantasy/ actually stands

Read against source (whf.js/html/css + DEVLOG), not just the DEVLOG's own
claims — one divergence found, see §2.

**Shipped:**
- WHF-1: Board & Regiment Engine — static SVG battlefield, click-to-inspect,
  two hardcoded test regiments (Empire Halberdiers, Bretonnian KotR).
- WHF-2: Movement Phase — full 8th-edition move/wheel/reform, ghost
  preview-then-commit pattern, 1" rule enforcement at commit.
- Data layer: 19 unit templates (10 Empire, 9 Bretonnia) + roster schemas
  in `gameData/warhammer-fantasy/{factionId}/...`, matching the
  `gameData/{system}/...` convention the rest of the monorepo uses.

**Not started:** WHF-3 (Charge — no brief written yet), WHF-4 (Shooting),
WHF-5 (Combat + Rank Collapse).

**Total surface:** whf.js 867 lines, whf.html 57, whf.css 378 — still
small. `age-of-sigmar/` is empty (CLAUDE.md + DEVLOG only), no work
started there.

**Since the monorepo migration (GIT-2):** only one substantive commit has
touched this subproject (`shared/bonus-resolver.js` relocated to repo
root, its old vendored copy removed). No feature work has landed here
since 2026-06-28.

## 2. Divergence found (verify-first flag)

`warhammer-fantasy/DEVLOG.md` (Phase 1, and again in "Things The Next AI
Should Know") states Firebase credentials exist at
`warhammer-fantasy/firebase-config.js`, gitignored. **Not true** — I
checked: no `firebase-config.js` and no `firebase-config.example.js` in
that directory. This matches root `CLAUDE.md`'s note that
`warhammer-fantasy/` "never got a live Firebase config set up," which is
the correct claim. The DEVLOG line looks aspirational/copy-pasted from the
40k-side pattern rather than verified at the time. I'd suggest correcting
the DEVLOG line rather than leaving it to mislead the next session — I can
do this in the next brief that touches this file, or now if you'd rather.

**Practical effect:** nothing in `warhammer-fantasy/` can talk to live
Firebase right now. Movement/board work so far has all been against
hardcoded in-memory test units, so this hasn't blocked anything yet — but
it will block any brief that needs to read the 19 uploaded unit templates
live instead of hand-stubbing them.

## 3. Suggestions for efficiency (for you to weigh, not decided)

- **Bonus resolver adoption is now unblocked and cheap to scope.**
  `shared/bonus-resolver.js` is proven live in KT combat and just got
  relocated to repo root (one canonical copy, no more vendoring). WHF's
  own DEVLOG already earmarked `system: "warhammer-fantasy"` and
  `gameData/warhammer-fantasy/bonuses/{bonusId}` as reserved paths, and
  flagged Fear/Panic as riding the same condition-token machinery as KT's
  stunned/markerlight. A small WHF-BON1 brief (map WHF stat vocabulary
  onto the resolver's abstract stats, additive-only) could land
  independently of WHF-3/4/5 and de-risk psychology rules before combat
  (WHF-5) needs them.

- **Roster app relationship is an open architecture question, not yet an
  open task.** `FANTASY_TEAM_UPDATE.md` (§3) says WHF "should extend
  [roster/], not build a separate roster tool" — but as built,
  `warhammer-fantasy/` is a self-contained SPA (board + movement + stat
  panel) with its own hardcoded test units, entirely independent of
  `roster/`. If the long-term intent is roster/ builds the army list and
  whf.html plays it (mirroring how killteam/40k consume roster exports),
  that's worth a brief of its own before WHF-3/4/5 pile up more
  assumptions on the standalone-SPA shape. If WHF was always meant to stay
  standalone, no action needed — just flagging that nothing on disk
  currently states which of these is true.

- **Character stat debt is still open.** General of the Empire / Empire
  Captain stats are from training-knowledge, not sourced against
  8th.whfb.app like the rest of the roster. DEVLOG flags this unblocks at
  WHF-5 (combat) — still true, no rush before then, but worth keeping on
  the queue so it doesn't get forgotten once combat work starts.

- **Known geometry simplification, not urgent:** `frontCorners()` uses
  model slot centres, not outer edges — arc distance runs ~0.6" short on
  a 5-wide unit during wheels. Accepted at the time as a simplification;
  only matters if a future brief wants tighter charge-range fidelity
  (WHF-3 territory).

## 4. What I'd suggest as the next brief

WHF-3 (Charge) is the natural next step — it's a pure extension of
existing, tested geometry primitives (`modelPosition`, `facingVector`,
`frontCorners`, the wheel/pivot math from WHF-2) and doesn't require
resolving the roster-app or Firebase-config questions above first, since
it can keep working against hardcoded test units like WHF-1/2 did. The
bonus-resolver adoption (WHF-BON1) could run in parallel or before it —
they don't block each other.
