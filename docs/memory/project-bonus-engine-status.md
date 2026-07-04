---
name: project-bonus-engine-status
description: "Status and hard rules of the cross-system bonus/modifier engine effort (BON-1 through BON-2) — data-pipeline is the sole writer to gameData, killteam engine doesn't consume bonuses yet."
metadata: 
  node_type: memory
  type: project
  originSessionId: 15f145b3-221a-49c7-94f6-ee885a549083
---

**What this is:** a generic bonus/modifier schema (`data-pipeline/BONUS_ENGINE_BRIEF.md`
v3 + `BON1B_ADDENDUM_BRIEF.md`) replacing an abandoned effort to get
Kill Team/40k ploy/stratagem text card-exact. Weapon keywords, ploys,
stratagems compile into structured `{trigger, scope, effects[]}` bonus
objects a shared pure resolver (`data-pipeline/shared/bonus-resolver.js`)
can apply. `output/mapping-review.txt` is the standing human-readable
review artifact (one block per catalog entry, regenerated every
`compile-keywords.js` run).

**Status as of 2026-07-04:**
- BON-1/1b/1c done. Resolver at v1.2.0 (added `appliesTo: actor|target` as
  pure caller-facing metadata — resolver stays single-sided on purpose,
  confirmed design decision, do not widen its signature without a fresh
  decision).
- Full catalog is **live in Firebase**: `gameData/kill-team/bonuses/` (29),
  `gameData/warhammer-40k/bonuses/` (20), plus all 47 KT factions + both
  40k factions + rules glossaries, via `node parsers/upload.js`.
- **BON-2 (killteam engine actually consuming bonuses) is NOT done** —
  double-checked the brief 2026-07-04, found the engine has none of the
  hooks the brief assumed: crits are hardcoded to natural-6 in both
  `rollShot` and `confirmFightTarget`, no variable defDice/atkDice/reroll
  mechanics exist, and `buildOperatives()` actively strips any
  `bonuses`/`keywords` array off weapons at game-creation time. See
  `killteam/DEVLOG.md`'s "BON-2 double-check" entry for specifics before
  attempting this — it's a bigger rewrite than the brief scoped, not a
  quick wire-up.

**Binding rule, established after losing two manual corrections to a
pipeline re-run:** NO hand-edits to `gameData/` in Firebase, ever. Every
correction goes in `data-pipeline/parsers/patches.json`, applied at parse
time (fails loud — process exits 1 — if a patch stops matching a unit,
never silently drops it). `data-pipeline` is the only writer to `gameData/`.

**`upload.js` behavior notes:**
- `exists()` had a URL-construction bug (fixed 2026-07-04) that made every
  skip-if-exists check in the file silently return false — this is *why*
  the first full upload overwrote pre-existing KT faction data instead of
  skipping it, not (only) a path-shape mismatch as first assumed.
- Faction uploads (`uploadKtFaction`/`upload40kFaction`) intentionally no
  longer skip existing data — the pipeline is authoritative now, overwrite
  is correct-by-design. Instead `main()` prints an upfront pre-upload
  manifest of what already exists and gates on one confirmation.
- `--only=slug1,slug2` does a targeted re-upload (skips
  rules/ploys/stratagems/bonuses entirely) — use this for one-off
  faction-only patches instead of re-running the whole pipeline.

See [[reference-firebase-warhammer5f2f4]] for the Firebase side and
[[feedback-verify-briefs-against-source]] for how the BON-2 gap was found.
