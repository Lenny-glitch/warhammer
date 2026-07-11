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

## 2026-07-04 — BON-1b: keyword coverage addendum

Nox reviewed `output/_unmapped_keywords.txt` from BON-1 and authorized four
decisions (`BON1B_ADDENDUM_BRIEF.md`, saved to the repo alongside the v3
`BONUS_ENGINE_BRIEF.md`, which was never actually committed during BON-1 —
both now live here instead of only in chat/`~/Downloads`).

**Decision 1 — "when" vocab additions:** added `halfRange` and
`noCritScored` to the resolver's when-vocabulary comment and test suite
(19/19 passing, up from 15). No resolver *logic* changed — `effectApplies`
already checks arbitrary fact strings against `context.facts`, so this was
new tests + new mappings, not new code. Mapped: Melta x (both `dmgNormal`
and `dmgCrit`, since 40k has one unified Damage stat, not KT's split),
Rapid Fire x (`atkDice`), Severe (mirrors `rending`'s existing
"convert-as-approximate" shape, inverted condition).

**Decision 2 — procedural flags:** added assault, pistol, precision, hot,
hazardous, psychic, extraAttacks, brutal, shock as pass-through flags
(same shape as existing blast/torrent/silent). Psychic needed entries in
*both* keyword maps: KT weapons carry `PSYCHIC` in raw text but KT's own
`.gst` never formalized it as a sharedRule, so parse-kt.js now falls back
to the 40k glossary to resolve the id (see parser fixes below) — the KT-side
bonus is a separate `system: "kill-team"` object from 40k's native one.

**Decision 3 — deferrals recorded, no code:** Twin-linked/Sustained
Hits/Anti-/Lance stay unmapped pending a wound-stat vocab decision at BON-4.
Limited x/One Shot deferred indefinitely (weapon property, not a bonus
effect). Bespoke named abilities stay raw. All recorded in the DEFERRED
register at the bottom of the new `output/mapping-review.txt`.

**Decision 4 — parser fixes in `parse-kt.js`:**
- Markdown-bold unwrap (`**PSYCHIC**`) before custom-marker detection — the
  old code's single trailing-star strip mangled it into `**PSYCHIC*`.
- Cross-glossary fallback: KT matching now falls back to the 40k glossary
  when the KT glossary has no match, specifically for PSYCHIC. Restricted to
  whole-token matching only — an early version also allowed it inside
  compound-split recovery and a "Blast 1&quot; Heavy (Reposition only)"
  token wrongly split into `["Blast", "1\" Heavy..."]` because bare "Blast"
  cross-matched 40k's plain `blast` flag before the correct split point
  ("Blast 1\"" / "Heavy (Reposition only)") got a chance. Fixed by keeping
  split-recovery on the KT glossary only.
- Trailing stray apostrophe strip (`Twin Torrent'`, `Wreathed'` — genuine
  bespoke abilities, now display clean and correctly stay unresolved).
- Leading-distance-prefix strip for Devastating's area variant (`1"
  Devastating 3` → matches `Devastating 3`).
- Glued-digit fix (`Piercing1` → `Piercing 1`).
- Generic two-way compound-split recovery for missing commas (`Brutal
  Severe`; `Blast 1" Heavy (Reposition only)`) — only accepted when both
  halves independently and exactly match a known glossary entry.
- Whitespace normalization in matching (`\s+` → single space) — one BSData
  line uses a non-breaking space (` `) inside `Heavy (Reposition
  only)` where every other occurrence uses a plain space; literal string
  equality was failing on that single instance.
- **Piercing Crits 2 root cause (investigated per brief):** only "Piercing
  Crits 1" was ever authored as a literal glossary alias; the old parametric
  fallback only swapped a trailing number for `x`, giving `"Piercing Crits
  x"` — which isn't the glossary's canonical name (`"Piercing x"`, no
  "Crits"). Any Crits value other than 1 silently fell through. Fixed with a
  `Crits `-stripped candidate before the numeric swap.
- **Re-audit classifications:** `Torrent 0"` is a real rule (has its own
  local per-file description) deliberately excluded from the generic
  Torrent x mapping — mapping it would incorrectly grant secondary targets
  it explicitly doesn't have. `Custom` is the star-stripped display form of
  a bespoke per-unit placeholder, not a data error. Both documented in
  `mapping-review.txt`.

**Before → after (all 49 files: 47 KT + AM + Craftworlds Eldar):**
| | before | after |
|---|---|---|
| keyword instances seen | 1591 | 1628 |
| mapped | 1082 | 1497 |
| unmapped (known rule, no bonus) | 509 (18 rules) | 131 (6 rules) |
| unresolved (no glossary match) | 146 | 111 |
| catalog entries | 30 | 49 |

New standing artifact: `output/mapping-review.txt`, regenerated on every
`compile-keywords.js` run — one block per catalog entry (keyword, raw
effect JSON, auto-derived plain-English line) plus the DEFERRED register
and re-audit classifications.

**Status:** BON-1b done per addendum spec. Upload still NOT run for real
(dry-run verified: 29 kill-team + 20 warhammer-40k bonuses staged). Nox to
skim `mapping-review.txt`, then run the bonus catalog upload and unit data
upload together.

## 2026-07-04 — BON-1c: pre-upload catalog patch (`BON1C_PATCH_BRIEF.md`)

Double-checked the brief against the actual codebase before implementing —
one of its three premises didn't hold as stated.

**Fix 1 (`appliesTo` field) — brief's premise was wrong, picked the
conservative resolution:** the brief claimed "resolveStats applies
target-directed effects to target stats (context already carries both)."
Checked `bonus-resolver.js`: `context.actor`/`context.target` only ever
carried `{ keywords }`, never stat blocks, and `resolveStats` takes exactly
one `baseStats` in and returns exactly one `stats` out — there was no
second stats channel for anything to route into. Asked Nox whether to (a)
keep `resolveStats` single-sided and make `appliesTo` pure caller-facing
metadata, or (b) change its signature to take an actor/target pair; got no
response in time, so went with (a), the one already marked recommended —
least invasive, keeps the existing 19-test call shape intact. `appliesTo:
"actor"|"target"` (default actor) is now validated in `validateBonus` for
all effect types and passed through untouched on `applied` and
`conditions` entries; `resolveStats` itself stays agnostic to it. **If this
isn't what was meant, it's a one-comment-block change to reverse** — flagged
prominently since it was a judgment call, not a confirmed decision.
Resolver bumped to 1.2.0. Tests: 19 → 24.

**Fix 2 (Severe/Rending → true convert):** confirmed against the schema —
both were single-effect "approximate" mods that only added the gained stat
without spending the normal success they're supposed to convert. Now two
effects each (`retainCrit +1` / `retainNormal -1`, same `when`), no longer
marked approximate. `mapping-review.txt`'s renderer got a matching
`isConvertPair` detector so the pair renders as one "Converts one normal
success to a critical success" line instead of two separate +/- lines.

**Fix 3 (Stun → condition):** confirmed the *conclusion* was right for a
reason slightly different from the brief's stated one — the brief said the
old mapping was "implicit instant" (it was actually already declared
`untilEndOfActivation`), but either way a bare `mod` effect can't persist
past the one `resolveStats` call it's part of without state tracking, which
doesn't exist yet (BON-3, same as markerlight). Remapped to `{type:
condition, condition: "stunned", appliesTo: "target", when: critScored}`.
Added "stunned" to the condition vocabulary note in
`BONUS_ENGINE_BRIEF.md`. `mapping-review.txt` renders it via a
per-condition-id override (the "-1 APL, resolved in BON-3" phrasing isn't
derivable from the schema fields, so it's the brief's dictated text, not a
guess).

**Recorded simplifications, no action:** Ceaseless=Relentless collapse and
distance-variant Devastating→flat Devastating are now written into
`mapping-review.txt`'s own notes section as told.

**Numbers:** mapping coverage unchanged (1497 mapped / 131 unmapped / 111
unresolved / 49 catalog entries) — this patch only changed effect shapes on
3 existing rows, not coverage. Resolver: 24/24 passing. Dry-run re-verified
(29 kill-team + 20 warhammer-40k staged). Upload still NOT run for real.

**Status:** BON-1c done, with the Fix 1 caveat above flagged for Nox to
confirm before treating `appliesTo` as load-bearing anywhere else.

## 2026-07-04 — Full pipeline upload run + `PATCH_OVERLAY_BRIEF.md`

**Full upload executed.** `node parsers/upload.js` (no flags — everything:
KT rules, all 47 KT factions, KT ploys, 40k rules, both 40k factions, the
bonus catalog) ran clean, no errors. Per Nox: the overwrite of the 7
scraper-era KT factions + astra-militarum was the intended end-state, not
an incident — the pipeline was always going to supersede that data.

**Two manual `countsAs` corrections were lost in the overwrite**
(`tau-pathfinders/mb3-recon-drone` and `ork-kommandos/bomb-squig`) — they
were hand-applied straight to Firebase after the original scraper run and
never recorded anywhere upstream. Root cause per Nox: no home in the
pipeline for hand-corrections, so anything living only in the destination
database is deleted by design the moment the source-of-truth pipeline
re-runs. Fixed the home, not just the data:

- **`parsers/patches.json`** — the two corrections, plus `reason` fields.
- **`parsers/apply-patches.js`** — applied at parse time (after the faction
  object is built, before it's written to `output/`). Fails LOUD (throws,
  `parse-kt.js` catches it specifically and calls `process.exit(1)` rather
  than the normal per-file log-and-continue) if a patch no longer matches a
  unit — tested by injecting a deliberately bad entry, confirmed exit code
  1, then removed it.
- `compile-keywords.js` now lists active patches in a `PATCHES` section of
  `mapping-review.txt` — visible in the standing review artifact, not just
  the parse console output.
- Rule going forward (binding): **no hand-edits to `gameData/` in Firebase,
  ever. Every correction is a `patches.json` entry. The pipeline is the
  only writer.**

**Found and fixed a real, pre-existing bug while re-uploading just these
two factions:** `exists()` built its Firebase REST URL by appending
`?shallow=true` to the path *before* handing it to `firebaseRequest`, which
then appended `.json` — producing `.../info?shallow=true.json` (the
`.json` landing inside the query string value). Firebase 301-redirects
that instead of answering it, and `exists()`'s try/catch silently turned
every single redirect into `false`. **Every skip-if-exists check in this
script has been dead code since it was written** — not just the
faction-upload guard the brief flagged. This is *why* the original full
upload overwrote the 7 pre-existing factions in the first place; the
`.../info`-path theory from the same-day incident report was real but
incomplete — even a matching path shape would never have been detected as
existing. Fixed by moving the query param onto the URL object after
`.json` is appended (`firebaseRequest` now takes an optional `query` arg).
Re-verified: KT/40k rules, KT ploys, and both bonus catalogs now correctly
report SKIP on a repeat dry-run; only factions (guard intentionally removed
per below) still overwrite.

**Guard note, implemented:** `uploadKtFaction`/`upload40kFaction` no longer
skip existing factions silently — the pipeline is authoritative now, so an
existing faction is the normal case, not protected data. In exchange,
`main()` now prints an upfront **pre-upload manifest** (which factions in
this run already exist and WILL be overwritten) with one confirmation gate
for the whole batch, before the per-item write prompts. Also added
`--only=slug1,slug2` for targeted re-uploads (used below) — skips
rules/ploys/stratagems/bonuses entirely, just the matching faction files.

**Targeted re-upload:** dry-run then real `node parsers/upload.js
--only=tau-pathfinders,ork-kommandos`. Both `countsAs` values confirmed
live in Firebase afterward, sourced through the pipeline this time, not a
hand-edit.

**Part 2 (roster repair) — could not execute, deferred to Nox.** The
Draft Cleaner (`roster/index.html`, `#clean-drafts`) needs an authenticated
browser session — confirmed no admin/service-account credentials exist
anywhere on this machine for the `warhammer-5f2f4` project (only an
unrelated `scope-rpg` one), and anonymous REST reads on `rosters/` (the
parent path, not individual roster children) return "Permission denied" —
matches the brief's own note that this is app-side, not pipeline-side.
**The Draft Cleaner needs no code changes either way**: it was never a
fixed old→new ID table (checked `roster/index.html` directly) — it's a
generic heuristic (exact match → strip trailing `-\d+` → name-match within
the faction), the same shape needed here. Also worth noting: the
`boss-nob-001`-style IDs from the *original* 2026-06-26 migration were
already gone before today — replaced by the *scraper's* clean slugs back
then. Today's BSData pipeline write produced the **same clean slugs**
(`boss-nob`, `mb3-recon-drone`, etc.) for at least the units checked, so
this overwrite may not have broken roster references the way the original
scraper migration did — worth running the Draft Cleaner as a health check
regardless, since it wasn't verified unit-by-unit here.

## 2026-07-04 — Roster repair closed out

Nox fixed the actual root cause in the Firebase console: `rosters` was
missing `.read: true` at the parent node (only `rosters/$rosterId` had it),
so `ref('rosters').once('value')` — what the Draft Cleaner and every other
whole-collection read needs — was permission-denied even though individual
roster reads worked fine. Confirmed live via plain REST immediately after:
`/rosters.json` went from `permission_denied` to a full data dump.

With read open, ran the Draft Cleaner's exact logic (exact-match → strip
trailing `-\d+` → name-match within the faction) directly against
production data instead of needing the browser. Result: **1 draft roster
total, 0 repairs needed** — all 11 unit references already resolved
against current `gameData`.

**Amendment (2026-07-04, per Nox):** that "0 repairs needed" reflects the
state *after* the actual Draft Cleaner had already run in the browser and
applied 11 ID fixes to that same Kommandos draft — this check just
confirmed the fix had already taken. It wasn't that nothing needed fixing;
it's that it had already been fixed by the time this ran. (They were
already using clean slugs, same ones the BSData pipeline produces.) The
BON-1c/upload overwrite did not
break it. The other 6 roster entries are `published`/`ready` — out of
Draft Cleaner scope by design, denormalized exports, unaffected.

Noted in passing, unrelated: one roster entry is keyed literally
`"undefined"` (a failed `push()` key) — pre-existing data hygiene issue,
not touched.

**Also confirmed (unrelated to BON-2's own findings):** `killteam`'s
`buildOperatives()` currently drops any `bonuses`/`keywords` array a
weapon might carry — see `killteam/DEVLOG.md`'s BON-2 double-check entry.
Not a data-pipeline concern, but relevant context for whoever picks up
BON-2: the catalog and per-weapon `bonuses` arrays this repo produces
aren't reaching the KT game engine yet, for a reason on the app side.

## 2026-07-04 — `firebase-rules.json` committed

The console is no longer the only witness to the RTDB rules. Saved as
`firebase-rules.json` at repo root — a copy of what Nox applied directly
in the Firebase console (the `rosters` parent `.read: true` fix). This is
a record, not a deploy source: no Firebase CLI/admin credentials exist on
this machine (see earlier entry), so there's no automated push/pull
between this file and the live console rules — if the console rules
change again, this file needs a manual re-copy to stay accurate.

## 2026-07-10 — PIPE-H1: pipeline hygiene pass, shipped

Brief: `briefs/PIPE_HYGIENE_1_BRIEF.md`. Commits `912b8b3` (claim),
`b7c2e11` (resolver v1.4.0), `e892274` (extractor + catalog fixes).

**Item 1 (rng extraction gap):** swept all 47 KT factions distinguishing
genuine "no range = unlimited" (368 of 652 ranged weapons post-fix) from
actual extractor misses. Two real bugs found and fixed in `parse-kt.js`:
a source typo (Wyrmblade's "Rang 8"", missing the 'e' — `extractRange()`
now tolerates it), and a bigger structural gap — `collectWeapons()` only
walked one level of `selectionEntry`/`selectionEntryGroup` nesting, so a
weapon-upgrade entry with its own nested sub-choice (e.g. Wyrmblade's
"Pistol and Melee Weapon" → group "Pistol" → "Bolt pistol"/"Master-crafted
autopistol") was entirely invisible, not just missing rng. Made
`extractFromEntry` self-recursive. Ranged weapon count went 590 → 652.

Fireblast/Life siphon (the brief's named live-play test cases) were
**not** extractor misses — verified against raw XML, no "Range N"" text
exists anywhere for them, and that holds for every PSYCHIC-keyword weapon
in every faction that has one. Per Nox: this is correct, not a gap — KT
2024's actual default is unlimited range, "Range X" is the printed
exception, which is exactly why this pipeline's own convention already is
`rng: null` = unlimited. If the live-play symptom persists after this
upload, the bug is on the `killteam/` engine side (treating absent `rng`
as unshootable instead of unlimited) — not a data-pipeline problem, and
explicitly not something to chase with a `patches.json` guess at a
rulebook number.

**Item 2 (stat-key casing):** swept Operative (Move/Save/Wounds/APL) and
Weapons (ATK/HIT/DMG/WR) characteristic casing across all 48 source
files. Uniform TitleCase everywhere, Legionaries included — no fix
applied. Per Nox: the brief was wrong, not the sweep; the UPPERCASE data
the original "0-wounds bug" was diagnosed against was almost certainly
pre-pipeline scraper-era data (predates BSData), not this pipeline's
current output. `killteam/`'s case-tolerant `statVal()` defense stays as
permanent armor regardless. Closed, no action.

**Item 3 (onAttack trigger):** `shared/bonus-resolver.js` v1.3.0 → v1.4.0
(1.3.0 landed first via WHF-4a, wound/wardSave stats — this collided with
the brief's stated version number, bumped past it instead). A bonus
tagged `trigger:"onAttack"` now matches `context.trigger` of either
`onShoot` or `onFight`. 4 new tests (28/28 total). `compile-keywords.js`'s
`KEYWORD_KT_MAP`: 16 `onShoot`/`onFight` entries → `onAttack` (18 of 20
total, `heavy`/`psychic` correctly stay `always`). Closes the exact bug
named in the brief — Legionaries' Tainted chainsword carries Rending,
previously tagged `onShoot`-only, could never fire it in melee.

`KEYWORD_W40K_MAP` deliberately **not** touched — Melta/Rapid Fire/
Precision/etc. are genuinely shooting-only in real 40k rules, Fights
First/Extra Attacks genuinely melee-only. Blanket-converting per the
brief's literal "ALL weapon-keyword bonuses" would have silently traded
one wrong trigger assignment for another. Nothing reads 40k bonuses yet
(BON-4, future) so this cost nothing to defer — flagged for whoever picks
that up, not resolved here.

**Item 4 (catalog descriptions):** `compileWeaponBonuses()` now generates
`description` from the existing `describeBonusEffects()` machinery
(already used for `mapping-review.txt`) instead of the literal
"Flavor/reference text only" placeholder. Can't drift from the compiled
effects since it's derived from them. `killteam/`'s own generated-readout
text (name+effects) is unaffected — this only changes what the catalog
field itself says, for any other consumer.

**Item 5 (appliesTo on Piercing):** `appliesTo:"target"` added to
Piercing/Piercing Crits' `defDice` effect, per BON-1c's own spec. Engine
still routes by stat name (unambiguous, unchanged) — data now matches its
own schema doc.

**Ship:** dry-run reviewed and approved by Nox before the real write.
Real upload run with `--force` (needed specifically to get the bonus
catalog past its exists-check — a plain re-upload would have silently
skipped it, delivering nothing from items 3–5). Side effect worth
recording: `--force` is a global flag, so it also re-wrote the KT and 40k
*rules glossaries* (22 and 33 entries) even though neither was touched
this pass — `extract-glossary.js` wasn't modified and reads independent
source files, so this should be content-identical, but it was an
unintended-scope write, not a deliberate one. No 40k *faction/unit* data
was touched (the deprecated BSData 40k subtree stays untouched per
CLAUDE.md's data canon) — simply because `parse-40k.js` was never run
this session, so no 40k faction output existed to upload.

**Verified live in Firebase post-upload:** `gameData/kill-team/bonuses/
rending` carries `trigger:"onAttack"` and a generated description;
Wyrmblade's Master-crafted autopistol now exists at all and carries
`rng:"8\""`; Legionaries' Fireblast correctly has no `rng` key (Firebase
drops nulls — "absent" *is* "unlimited" here, confirming Nox's reading).

**Not done — queued for Nox:** the actual acceptance test from the
brief's "Done when" — fresh KT game from the Legionary export via
`?dev=true`, shoot with Fireblast, confirm the bonus lines read correctly
and (per Nox) that unlimited range doesn't block the shot. If it does,
the fix is in `killteam/`'s range-check, not here.
