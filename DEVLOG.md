# Devlog

## 2026-07-01 — Ploy/stratagem validation halted; pivot to army bonus system

Ran a cross-check of `PLOY_VALIDATION_BRIEF.md` against `ploys/tau-pathfinders.json`.
Both known issues in the brief confirmed real:
- Point-Blank Fusillade's final sentence is genuinely truncated/mangled in the source file.
- Edition mixing is real: `supporting-fire` and `saviour-protocols` use 2021-era
  terms ("Engagement Range", "shooting attack") while `point-blank-fusillade` uses
  2024 terms ("control range") — same file, inconsistent editions.

Coverage check: only 1 of the 6 files the brief expects exists
(`ploys/tau-pathfinders.json`). `stratagems/` is empty; `void-dancer-troupe.json`,
`ork-kommandos.json`, `kasrkin.json` don't exist yet.

A follow-up "cross-check" message (relayed from Nox) proposed deleting two
ploys (`veterans-cunning`, `group-activation`) as 2021-only contamination,
patching one word in `take-cover`, and rewriting `supporting-fire` /
`saviour-protocols` to 2024 wording — sourced from Wahapedia again, the same
class of source the original brief flagged as unverifiable without a
physical card. Flagged this before editing anything.

**Decision (Jonathan, 2026-07-01):** don't chase card-exact ploy/stratagem
text at all. Most ploys are mechanically minor (movement/damage/accuracy
tweaks) and not worth the sourcing effort. Instead: build a generic **army
bonus system** — simple +/- modifiers (movement, damage, accuracy, etc.)
that 40k, Kill Team, and the "Fantasy" system can all read, rather than
each engine consuming faithful per-game rule text.

Existing files in `ploys/` and `stratagems/` are kept as-is, untouched, as
an unvalidated reference library for later porting into the bonus system —
not deleted, not corrected line-by-line.

**Status:** `validate-ploys.js` (Tasks 1-4 of the brief) is not being built —
superseded by the pivot. No ploy/stratagem files were edited. Next real work
here is designing the bonus-system schema, not more card-text validation.

## 2026-07-02 — BON-1: generic bonus engine built

Reviewed `BONUS_ENGINE_BRIEF.md` (v2) against the sibling repos (killteam,
warhammer40k, warhammer-fantasy) before building. Two of the brief's own
architectural claims didn't hold up and were corrected before build (Nox
confirmed both):
- Firebase path was inverted (`gameData/bonuses/{system}/...`) vs. every
  existing path in this project (`gameData/{system}/{category}/...`) — fixed
  to `gameData/{system}/bonuses/{bonusId}`. `any` is not a storage location;
  a `system: "any"` bonus fans out to every real system's path at write time.
- "Matches existing architecture" (vendoring `shared/` files by hand into
  both game apps) isn't actually a precedent that exists anywhere in the
  codebase — this is the first instance of that pattern, not a continuation
  of one. Added `parsers/check-resolver-sync.js` as the drift-detection tool
  from day one instead of bolting it on after the first divergence bug.

**Built:**
- `shared/bonus-resolver.js` — master copy of the pure resolver
  (`resolveStats`, `eligibleBonuses`, `validateBonus`), `BONUS_RESOLVER_VERSION`
  constant, header documents the vendoring + snapshot rule. Includes a `when`
  field on mod effects (Nox's addition) for crit-conditional rules like
  Piercing Crits — `when: "critScored"` gates on a fact in the resolution
  context, vocabulary open to extend the same way stats/flags are.
- `shared/bonus-resolver.test.js` — 15 plain-node tests, all passing: op
  ordering, cap non-stacking, add-cannot-cross-cap, improve direction on
  roll-target stats, flag passthrough, condition surfacing without state,
  conditional `when` effects (present/absent), oncePerGame/oncePerRound
  gating, aura range + `!`-exclusion keyword filter, passive-must-be-free
  validation.
- `parsers/compile-keywords.js` — maps weapon keywords to bonus objects
  across all 47 KT factions + Astra Militarum + Craftworlds Eldar (49 files,
  1591 keyword instances). 1082 mapped, 509 unmapped across 18 known rules
  (each with a recorded reason — mostly: rules that modify 40k's Wound roll
  separately from Hit, which the v1 stat vocab doesn't yet distinguish;
  weapon-fire-count limits, which aren't bonus effects; and rules needing
  `when` facts beyond `critScored` that weren't authorized this pass). Also
  surfaced 146 raw keyword strings that never resolved against the glossary
  at parse time at all — mostly genuine custom/named abilities, but some
  look like pre-existing parse-kt.js matching gaps (capitalization
  mismatches, a malformed distance-prefixed Devastating pattern, a couple of
  stray trailing apostrophes) that predate BON-1 and weren't touched here.
  Writes `output/_unmapped_keywords.txt` and `output/bonuses-catalog.json`
  (30 deduped entries: 23 kill-team, 7 warhammer-40k).
  Caught and fixed one bug before shipping: the catalog dedup step was
  keyed by bare bonus id, so KT and 40k entries sharing an id (blast,
  torrent, heavy) silently overwrote each other — fixed to dedup on
  `system:id`.
- `parsers/upload.js` — added `uploadBonusesCatalog`, same gates as every
  other upload function (skip-if-exists, `--force`, `--dry-run`, "Type YES"
  confirm). Verified the path/fan-out grouping logic in isolation
  (dry-run only, not run against the real database).
- `package.json` — added `compile-keywords`, `check-resolver-sync`, and
  `test-resolver` scripts.

**Not done (correctly, per brief):** no game-app integration, no UI, no
CP/AP spend, no condition-token state tracking, no Fantasy work, no faction
ploy/stratagem authoring as bonuses yet. `games-kt/` is confirmed as the
live KT game collection; the 40k equivalent is currently just `games/` (not
`games-40k/`), noted for whoever picks up the BON-2 snapshot write.

**Status:** BON-1 done per spec. Full keyword→bonus mapping table reported
to Nox for review — no Firebase write happens until that's approved.
