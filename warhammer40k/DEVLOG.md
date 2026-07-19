# Warhammer 40K Simulator — Development Log

> **For AI collaborators:** This document is the ground truth for where this project stands, how it got here, and where it's going. Read this before touching any code. The conversation history lives in the Claude session JSONL but this log captures the non-obvious decisions.

---

## Project Overview

A turn-based, two-player Warhammer 40K tabletop simulator playable remotely via shared link. Browser-only frontend (vanilla JS, no framework) backed by Firebase Realtime Database. No server. No build step.

**End goal:** Three separate repos — this simulator, a standalone roster builder (`roster`), and a Kill Team variant (`killteam`) — merge into one unified platform. All three are owned by Lenny-glitch on GitHub.

---

## Repo Layout

```
/home/nox/projects/
  warhammer40k/     ← this repo (simulator)
  roster/           ← standalone roster builder (github.com/Lenny-glitch/roster)
  killteam/         ← Kill Team variant     (github.com/Lenny-glitch/killteam)
```

### Inside `warhammer40k/`

```
index.html              entry point, script load order matters
css/styles.css
js/
  utils.js             escHtml, showScreen helpers
  firebase-init.js     initialises window.db
  units.js             UNIT_STATS legacy stat block (keep — dev presets depend on it)
  roster.js            RosterLoader: fetches rosters + gameData, builds unit instances
  shooting.js          attack pipeline (ranged + melee), dice resolvers
  state.js             Firebase read/write — createGame, joinGame, all phase advances
  lobby.js             Lobby UI: create form, join form, waiting screen
  board.js             Canvas/SVG board renderer
  game.js              Game UI: all phase renderers, unit cards, phase bar, listeners
  app.js               Entry: routes URL params to Lobby or Game
firebase-config.js      (gitignored) real Firebase credentials
firebase-config.example.js
scraper/
  scrape_40k.js        Wahapedia HTML scraper (Node, no external deps)
  write_firebase.js    Writes scraped JSON to Firebase REST API
scraped-data/
  wh40k-astra-militarum.json    134 units
  wh40k-craftworlds-eldar.json  97 units
ArmySheets/            PDF reference sheets
SPEC.md                original Phase 1 spec
```

---

## Tech Stack Decisions

| Decision | Choice | Why |
|---|---|---|
| Frontend framework | None (vanilla JS) | Matches Kill Team project pattern; no build tooling needed |
| State sync | Firebase Realtime Database | Both players see live updates; free tier sufficient for playtest scale |
| Auth | None (localStorage tokens) | Playtest only — real auth is a future concern |
| Scraping | Node + built-in `https`/`fs` | No puppeteer needed; Wahapedia serves static HTML |
| Unit data in Firebase | `gameData/warhammer-40k/{factionId}/{unitId}` | Separates game data from game state; roster builder can write here too |

---

## Firebase Structure

```
games40k/              ← legacy name, now actually `games/` in code
games/{gameId}/
  status               waiting | active | complete
  boardWidth           inches (from GAME_PRESETS)
  boardHeight
  terrainBudget
  terrain/             { [squareKey]: 'rough'|'chestHigh'|'tall' }
  terrainOwner/        { [squareKey]: 'guard'|'eldar' }
  players/
    guard/  { name, token, joined, cp, rosterId }
    eldar/  { name, token, joined, cp, rosterId }
  units/               { [modelId]: model instance }
  turn/
    number
    activePlayer
    phase              command|movement|shooting|charge|fight|morale|terrain|deployment|initiative
    shotLog/           { [pushKey]: shot entry }
    fightQueue/        array of { groupId, faction }
    battleShockLog/
  pendingCasualties/   { [groupId]: count }
  undeployedGroups/    { guard: [groupId, ...], eldar: [groupId, ...] }
  startingStrength/    { [groupId]: { models, wounds } }
  initiative/          { guardRoll, eldarRoll }
  battleShocked/       { [groupId]: bool }
  gameOver/            { winner, reason }

gameData/warhammer-40k/
  astra-militarum/     { [unitId]: unitDef }
  craftworlds-eldar/   { [unitId]: unitDef }

rosters/{rosterId}/
  meta/  { name, factionId, factionName, pointsTotal, gameFormat }
  units/ [ { instanceId, unitId, unitName, modelCount } ]
```

### Test Roster IDs (Combat Patrol, 495pts each)

| Faction | Roster Name | Firebase ID |
|---|---|---|
| Astra Militarum | Cadian 8th | `-OvwjCrKkEQjW-hYsIFa` |
| Craftworld Eldar | Biel-Tan | `-OvwjCsdqkL4JEk3UdrT` |

These are the IDs players paste in the lobby to start a real game. They're already in Firebase.

---

## Phase History

### Phase 1 — Core game loop
Two hardcoded squads (Guard Infantry Squad, Eldar Guardian Defenders), 6-phase turn structure, Firebase sync, shareable link. Units built by `buildInitialUnits()` with hardcoded positions. CP tracked but not spendable.

### Phases 2–12 — Mechanics layering
Movement (drag + coherency), shooting (range/LOS/dice), charge (2D6 roll + movement), fight (engagement range), morale (battle-shock), terrain (pre-game placement), deployment (zone-based), initiative roll-off, deferred casualty allocation. Each phase is a separate Firebase write; both players see updates live.

### Phase 13 — Game Size Presets
`GAME_PRESETS` in `state.js`: Combat Patrol (44×60), Incursion (44×60), Strike Force (44×72). Board dimensions are dynamic from `game.boardWidth`/`boardHeight`. Lobby slider lets creator pick size.

### Phase 14 — Wahapedia Scraper
`scraper/scrape_40k.js` scrapes unit stat blocks and weapon tables from Wahapedia.

**Two bugs fixed in this session:**
1. **Multi-word faction keywords** (`['ASTRA']` instead of `['ASTRA MILITARUM']`): lazy regex `/([\s\S]*?)<\/span>/g` stopped at the first inner `</span>`. Fixed with a depth-counting balanced-span walker `extractBalancedTooltipkSpans()`.
2. **All melee weapons showing `type: "ranged"`**: table-header detection was unreliable. Fixed by checking `rangeStr === 'Melee'` per-weapon inside `extractWeapons()` — overrides type regardless of which table the weapon came from.

Scraped data written to Firebase via `write_firebase.js` (HTTPS PUT, no auth needed for gameData path).

**Unit counts:** 134 AM units, 97 Eldar units.

**Stat string format from scraper:**
- `M: "6\""` — already includes the inch mark
- `SV: "5+"`, `LD: "7+"` — already includes the `+`
- `T: "3"`, `W: "1"` — plain numbers as strings

**Weapon fields:** `{ name, type, range (number), attacks (string, may be "D6"/"2D6"), skill (number), S (number), AP (number), D (string) }`

### Phase 15 — Roster Integration

**Part 1:** Two mock Combat Patrol rosters written to Firebase `rosters/` collection (see IDs above).

**Part 2 (current state):**

`roster.js` — `window.RosterLoader`:
- `fetchRoster(rosterId)` — reads `rosters/{id}` from Firebase
- `loadFactionData(factionId)` — reads `gameData/warhammer-40k/{factionId}`, caches in module
- `getUnitDef(factionId, unitId)` — cache lookup
- `buildUnitsFromRoster(roster, faction, boardHeight)` — generates model instances; each model gets `factionId`, `unitId`, `unitGroup`, `label`, `type` (= unitId, for legacy fallback), `wounds`/`maxWounds` from `stats.W`
- `FACTION_MAP`: `{ guard: 'astra-militarum', eldar: 'craftworlds-eldar' }`

`state.js` changes:
- `createGame(playerName, faction, devMode, gameSize, rosterId, devRosterId)` — fetches P1 roster, builds units, stores `rosterId` on player record
- `joinGame(gameId, playerName, rosterId)` — fetches P2 roster, builds units, updates game to `active`
- Battle-shock reads `LD` from `getRosterUnitDef` with `UNIT_STATS` fallback
- `undeployedGroups` uses real `instanceId` strings (e.g. `'unit-001'`), not hardcoded names

`shooting.js` changes:
- `parseStat(val)` — strips `"`, `+` suffixes → int
- `resolveCount(val)` / `avgCount(val)` — handles D6, D3, 2D6 strings
- `getRangedWeapon(unit)` / `getMeleeWeapon(unit)` — reads from `getRosterUnitDef` first, falls back to `UNIT_STATS[unit.type].weapon`
- `getTargetProfile(unit)` — reads `T`, `SV`, `baseRadius` from gameData, falls back to `UNIT_STATS`
- All six attack functions (estimate + resolve, ranged + melee, LOS) updated to use these helpers

`lobby.js` changes:
- `triggerRosterPreview(inputId, previewId, getFaction)` — 500ms debounced roster fetch, shows faction mismatch error or unit list
- Create form: Roster ID input (pre-fillable via `?roster=` URL param) + live preview + dev opponent roster field
- Join form: Roster ID input + live preview (faction auto-assigned, so mismatch detection works)
- `handleCreate` / `handleJoin` both validate and pass `rosterId` to GameState

`game.js` changes:
- `init()` is now `async` — pre-loads faction gameData from both players before subscribing, so first render has stats
- `groupLabelCache` — `{ [groupId]: label }` populated from `u.label` at top of every `render()` call; `groupLabel()` checks this first
- `unitCardsHTML` reads M/T/SV/W/LD/OC from `def.stats`, ranged weapon stats from `def.weapons`, falls back to `UNIT_STATS` for dev presets

---

## Key Invariants

**Never remove `UNIT_STATS`** (`js/units.js`). Dev presets in `game.js` hardcode legacy unit IDs (`guard_0`, `guard_sgt`, `eldar_0`, etc.) that rely on it. These presets let you jump to mid-game states for testing without running through setup.

**`type: unitId` on model instances** — each model has `type = unitId` (e.g. `'cadian-shock-troops'`). This means new code can read `unit.factionId` + `unit.unitId` for gameData lookups, while legacy code that reads `unit.type` still works (finds nothing in `UNIT_STATS` and shows `?`, which is fine for new unit types).

**Script load order in `index.html` matters:**
`firebase-init` → `units` → `roster` → `shooting` → `state` → `lobby` → `board` → `game` → `app`

**Firebase writes are unauthenticated** for `gameData/` and `rosters/` in the current rules. This is intentional for the playtest phase.

---

### Phase 15 — Roster key collision bug (fixed in Phase 16)

Root cause: both rosters used `instanceId` values `unit-001` through `unit-005/006`. When the Eldar player joined, `joinGame` wrote units at Firebase paths like `units/unit-001_0` etc., silently overwriting the AM models at identical paths. Only the Commissar (`unit-006_0`) survived because Eldar only goes up to `unit-005`.

**Fix (roster.js):** Model IDs and `unitGroup` are now faction-namespaced: `guard_unit-001_0`, `eldar_unit-001_0`, etc. No collision possible across factions. Existing games created before this fix must be recreated.

---

### Phase 16 — Post-playtest bug fixes

Five bugs fixed based on real cross-machine playtest findings:

1. **Single-model coherency** — `calcCoherency` required ≥1 neighbour, which no lone model can satisfy → permanent red rings on Castellan, Commissar, Farseer, Leman Russ, Chimera, Wraithlord. Fixed: early-return full OK set when `groupModels.length ≤ 1`; coherency zones never drawn for single-model groups.

2. **Movement M stat** — board.js drag clamp read `UNIT_STATS[unit.type].move` exclusively, never gameData. Added `getUnitMove(unit)` helper that reads `def.stats.M` via `getRosterUnitDef` first (handles `"6\""` strings correctly), falls back to UNIT_STATS. Guards get 6", Eldar 7", Wraithlord 8", vehicles 10".

3. **Melee Attacks (A)** — resolved correctly from gameData when cache is populated. Added `getMeleeWeaponForFighter(unit, fighterIndex)`: fighter index 0 gets the first melee weapon (sergeant's chainsword, A3), all others get the last/basic weapon (close-combat-weapon, A1). This is an index-based approximation — see Known Limitations below.

4. **Dice log overflow** — added `.dice-log-scroll` wrapper with `flex: 1; min-height: 0; overflow-y: auto` inside the right panel. The `min-height: 0` is necessary to allow the flex child to shrink below content height and activate scroll.

5. **Multi-weapon units** — `resolveAttacks` and `estimateAttacks` now iterate `getAllRangedWeapons(unit)` per model (all ranged weapons fire at the chosen target). Shot log entries include `weaponResults` array for per-weapon breakdown in the dice log. Unit card expanded view shows all ranged weapon profiles. See Known Limitations below.

---

## Known Limitations — RETIRED (40K-P3, see Phase 18 below)

### KL-1: Melee weapon assignment uses fighter index, not model role — RETIRED

**Original symptom:** In a 10-model Cadian Shock Troops squad, the first model in the Firebase array got the chainsword (A3) and the rest got close-combat-weapon (A1). Approximated the sergeant/trooper split but depended on array order, not actual model role.

**Retired, not fixed as originally planned.** The `composition`/`role` field this note proposed never landed — the roster export format that shipped instead (`chosenLoadout`, per-unit embedded weapon profiles) still has no per-MODEL role data, only per-squad. `getMeleeWeaponForFighter` (the index hack) is deleted outright; `getMeleeWeapon(unit)` now returns the resolved unit's best-Strength melee profile (ties broken by better AP) when more than one exists — no fight-time weapon-choice UI exists to defer to instead. See Phase 18 / `js/shooting.js`.

### KL-2: Multi-weapon units fire every weapon on the datasheet, not their equipped loadout — RETIRED

**Original symptom:** A Leman Russ fired all 10 ranged weapons simultaneously. In reality a specific Leman Russ has ONE turret weapon and one or two sponson/hull choices.

**Retired.** `chosenLoadout` (written by roster's publish flow, read from `exports/warhammer-40k/{id}` — not the old draft `rosters/{id}` this repo used to read) now drives what a unit actually fires. Full writeup, including a real severity finding beyond this note's own framing (the bug compounds per-model on multi-model squads, not just per-vehicle) and a wargear-pattern distinction found via live data (single-special-model slots vs. uniform squad-wide swaps) — see Phase 18.

---

## Cross-Project Status — 2026-06-27

All three repos share Firebase project `warhammer-5f2f4`. Current state per repo:

| Repo | Branch | Last work | Next |
|---|---|---|---|
| warhammer40k | deploy | Phase 16 complete + Netlify deploy | Phase 17 (KL-1 composition, KL-2 loadout) |
| roster | deploy | Phase 3b Part 1 (unit search + lazy migration for 40k) | Phase 3b Parts 2–3 (40k builder flow + sim integration) |
| killteam | master | KT-2 Part 2 (drag-to-shoot) | KT-2 Parts 3–4 (fight, firing arc) |

The 40k sim (this repo) is **blocked on roster Phase 3b** — Part 3 of that brief is the sim integration that hooks `chosenLoadout` into `buildUnitsFromRoster()`. That's Phase 17 KL-2.

---

### Phase 18 — 40K-P3: Roster Picker + Sim Reads chosenLoadout (2026-07-14)

**Brief:** `briefs/W40K_PART3_BRIEF.md` (supersedes the old, pre-monorepo
`ROSTER_3B_PART3_BRIEF.md`). **Files:** `js/lobby.js`, `js/roster.js`,
`js/shooting.js`, `css/styles.css`.

Two interlocking changes: a real roster picker in the lobby (retiring the
free-text Roster ID fields that produced "child failed: path argument was
an invalid path" on a pasted URL), and the sim actually reading
`chosenLoadout` instead of firing a unit's entire datasheet — closing
KL-1 and KL-2 above.

**Verify-first found the picker and the chosenLoadout fix are the SAME
underlying change, not two separate ones.** `roster.js`'s `fetchRoster()`
read the OLD draft `rosters/{id}` collection — `{ meta, units: [{
instanceId, unitId, unitName, modelCount }] }`, no weapon data at all,
requiring a separate gameData lookup per unit. Only PUBLISHED exports at
`exports/warhammer-40k/{id}` carry `chosenLoadout` plus each unit's own
resolved stats/weapons embedded inline (self-contained, no gameData lookup
needed for the common case). So picking rosters from `exports/` (item 1)
and reading `chosenLoadout` (item 2) both require the same source switch.
**Fallout, expected not fixed:** this repo's own two hardcoded "Test
Roster IDs" (`-OvwjCrKkEQjW-hYsIFa` / `-OvwjCsdqkL4JEk3UdrT`) are drafts,
not exports — confirmed live (`exports/warhammer-40k/-OvwjCrKkEQjW-hYsIFa`
returns null; `rosters/` has it) — they no longer resolve through the
lobby. Same tradeoff killteam's KT-RS made switching to `exports/kill-team`.

**Lobby picker** (`js/lobby.js`): ported KT-RS's `fetchRosterList`/
`renderRosterPickerList`/`selectLobbyRoster` pattern, generalized to
THREE simultaneous picker instances this app needs that Kill Team's
single-roster flow didn't (create-form's own roster, the dev-mode
opponent roster, the join-form's roster) — each filtered to the relevant
faction (`meta.factionId`), reloading when the faction-card selection
changes. Deleted the old debounced single-ID `triggerRosterPreview`/
`rosterPreviewHTML` (redundant once the picker shows everything up
front — same call KT-RS made). Kept a pasted ID/URL field as a fallback
per the brief ("if trivial"): `extractRosterIdFallback()` just takes the
last non-empty `/`-separated segment, since Firebase push keys never
contain a slash either way.

**chosenLoadout resolution** (`js/roster.js`) — the actual KL-1/KL-2
retirement. A roster unit's exported `weapons` array is the FULL
datasheet catalog (every alternative across every valid configuration —
this IS KL-2's root cause); `chosenLoadout` narrows exactly the optional
slots resolved at publish time, keyed by roster's own self-describing
slot name (`Replace X` / `Optional: X` / `Optional (up to N)` — see
`roster/index.html`'s `_parseWargear`). `resolveLoadout()` reads ONLY
those key strings plus a small, targeted read of gameData's
`wargearOptions` prose (already fetched for squadSize fallback, see
below) — NOT a re-implementation of `_parseWargear` itself, just its
"replace X with one/N of the following" pattern family, needed for a
reason verify-first surfaced only by testing against Nox's real
Craftworlds Eldar export, not the brief's own description:

1. **A "Replace X" slot name only identifies the ONE default weapon being
   swapped out — not the other un-chosen alternatives for that same
   slot.** Guardian Defenders' Heavy Weapon Platform slot has FOUR
   alternatives (missile launcher / bright lance / scatter laser /
   starcannon); chosenLoadout only names whichever one was picked.
   Excluding just the named default left the other three still firing —
   a smaller, but still real, residual KL-2. Fixed by parsing gameData's
   `wargearOptions` text (already loaded) for the same "one of the
   following: A B C D" list roster's own picker built from, and excluding
   every alternative by normalized-prefix match (handles "missile
   launcher" prose matching both its "– starshot"/"– sunburst" profiles).
2. **Not every "Replace X" slot means "one special model has this."**
   Guardian Defenders' HWP slot does (ONE Heavy Weapon Platform model in
   an 11-model squad) — that weapon should fire once for the whole squad,
   not once per model. But Wraithguard's own wargear text reads "**All**
   of the models in this unit can **each** have their wraithcannon
   replaced with 1 D-scythe" — every model shares the SAME choice
   uniformly. Conflating these would have made a real 5-model Wraithguard
   squad fire its Wraithcannon once total instead of five times.
   Distinguished by testing the literal "each"/"all ... models" phrasing
   in the wargear sentence itself (`isUniform()`) — the only signal the
   data offers; `resolveLoadout()` returns `chosenPerModel` and
   `chosenOnce` separately, `perModel` tagged accordingly.
3. **`modelCount` is `null` (dropped by Firebase) for every FIXED-size
   unit** — roster only writes a real value for variable-size squads (see
   `roster/index.html`'s `_addOperative`). `buildUnitsFromRoster` now
   falls back to gameData's `squadSize.min` when absent, then 1. Verified
   live: Guardian Defenders (squadSize 11/11) and Wraithguard (5/5) both
   built the correct headcount — the OLD code's flat `modelCount || 1`
   fallback would have built just 1 model for either.

**`js/shooting.js`:** `getAllRangedWeapons`/`getAllMeleeWeapons` read
`unit.equippedRanged`/`equippedMelee` (attached once per squad at
`buildUnitsFromRoster` time) when present, falling back to their existing
gameData/UNIT_STATS path otherwise — old exports without `chosenLoadout`,
and dev presets, "behave as today" unchanged (both paths tag their
weapons `perModel:true` to match). `getMeleeWeaponForFighter`'s index
hack is deleted; `getMeleeWeapon(unit)` returns the resolved set's
highest-Strength profile (AP as tiebreaker) when more than one exists —
no fight-time weapon-choice UI exists to defer to instead, matching the
brief's own stated fallback. **The real fix for KL-2's severity**:
`firingInstances()` in `resolveAttacks`/`estimateAttacks` — a `perModel`
weapon fires once per alive model that can reach/see the target
(unchanged); a once-per-squad weapon fires from exactly ONE eligible
model, regardless of squad size. Verified live: an 11-model Guardian
Defenders squad's Shuriken Catapult correctly fires 22 attacks (11 × 2),
its chosen Missile Launcher fires exactly 1 (not 11) — the actual bug
this brief exists to close, confirmed against real published data, not a
synthetic fixture.

**Testing:** jsdom (real, `runScripts: 'dangerously'`) against LIVE
Firebase reads — no synthetic-only shortcuts for the acceptance case.
Confirmed: the lobby picker renders real rows for Eldar (13 units, 1950pts,
correct name/faction/points/date) and correctly shows the empty state for
Astra Militarum (no AM exports published yet, not a crash); Guardian
Defenders' HWP slot resolves to exactly 2 ranged weapons (Shuriken
Catapult + chosen Missile Launcher, all 4 alternatives and the replaced
default excluded) firing 22 + 1 attacks respectively; Wraithguard's
uniform swap resolves to Wraithcannon only (D-scythe excluded), firing
per-model (5 attacks from 5 models, not 1); Fuegan/Solitaire (no
chosenLoadout at all) resolve their real weapons unchanged, confirming
"no chosenLoadout behaves as today." No live Howling Banshees export
exists yet to test the brief's own named example directly — the
Guardian-Defenders/Wraithguard pair exercises both wargear patterns
(single-special-model and uniform squad-wide swap) the general mechanism
needs to handle, which should generalize to Banshees' Mirrorswords choice
whichever pattern it turns out to use. Test scripts not committed
(one-off, same jsdom pattern WHF's sessions use for this project).

**Commits:** `3fba1a0`.

---

## Current Status (as of Phase 18)

The game is playable end-to-end with real roster data:
1. Creator picks a published roster from the lobby (`exports/warhammer-40k`)
   → creates game → shares link; pasted ID/URL still works as a fallback
2. Joiner picks their own roster the same way → joins → game goes active
3. Terrain placement → Deployment → Initiative roll → 5-turn game loop
4. Unit cards show all weapon profiles from Wahapedia-scraped data
5. Attack pipeline rolls against real T/SV/W/M values from gameData
6. A unit fires EXACTLY its published chosenLoadout — fixed troop weapons
   scale with headcount, a chosen special/replaced weapon fires once for
   the squad or per-model depending on the wargear pattern (Phase 18)
7. Multi-model squads maintain coherency rules; single models exempt
8. Dice log scrolls without affecting board layout; per-weapon breakdown shown for vehicles

**What still uses hardcoded data:** Dev presets (Jump to T1/T2/T3 states) use legacy `guard_0`/`eldar_0` unit IDs from `buildInitialUnits()`. These exist for testing only and are independent of the roster flow.

---

## Convergence Plan (Three Repos → One)

The three projects share a Firebase project and the same faction data in `gameData/warhammer-40k/`. The convergence path is:

1. **Roster builder** (`roster/`) — standalone web app where players build and save rosters to Firebase `rosters/`. Outputs the roster push-key ID.
2. **Kill Team** (`killteam/`) — separate game mode, same lobby/link pattern.
3. **40K simulator** (this repo) — game engine, reads rosters written by the roster builder.

When merged, the lobby will offer game mode selection (40K / Kill Team), and the roster builder will be a shared tool. The `gameData/` Firebase path is the shared data layer all three read from.

---

## Things The Next AI Should Know

- **Don't touch `DEVLOG.md` for task notes** — update it only when phases complete or architectural decisions are made.
- **The scraper is run manually** (`node scraper/scrape_40k.js` then `node scraper/write_firebase.js`). It is not part of the game runtime.
- **Firebase credentials** are in `firebase-config.js` (gitignored). The example file shows the shape.
- **No TypeScript, no bundler, no linting config.** Keep it that way unless the user explicitly asks.
- **Phase numbers** are informal labels from planning docs, not reflected in code. Don't add phase comments to source files.
- **The board is in inches**, not pixels. The canvas renderer scales inches to pixels internally.
- **`roster.js` reads `exports/warhammer-40k/{id}`, not `rosters/{id}`** (40K-P3). Only published exports carry `chosenLoadout` + embedded weapon profiles. The lobby picker sources from the same collection — don't reintroduce a `rosters/`-reading code path without re-deciding this.
- **`perModel` on a weapon object (40K-P3) means "fires once per alive model"; `false` means "fires once for the whole squad."** Set at `buildUnitsFromRoster` time from `roster.js`'s `resolveLoadout()` — fixed troop equipment and UNIFORM wargear swaps (e.g. Wraithguard's wraithcannon-or-D-scythe, "all models can each...") are `true`; a single-special-model slot (e.g. Guardian Defenders' one Heavy Weapon Platform) is `false`. Read `resolveLoadout()`'s own comments before changing this — the distinction was found by testing live data, not assumed.

---

## BON-1 — Generic Bonus Engine landed in data-pipeline (2026-07-02)

Same bonus-resolver work noted in killteam/DEVLOG.md. Specific to this repo:

- `shared/bonus-resolver.js` (master copy lives in data-pipeline) needs to
  be vendored into `warhammer40k/js/bonus-resolver.js` when BON-4 (40k
  integration) starts. `data-pipeline`'s `check-resolver-sync.js` currently
  reports it ABSENT — expected until that copy step happens.
- Confirmed while cross-checking Firebase paths for that work: this repo's
  live-game collection is `games/`, not `games-40k/`. killteam/DEVLOG.md
  has a noted someday-plan to rename to `games-{system}/` — that hasn't
  happened. Don't assume `games-40k/` exists anywhere yet.
- Flagged a real gap in the bonus schema's abstract stat vocabulary that
  will matter when BON-4 wires this up: it has a single `hit` roll-target
  stat with no separate `wound` stat, so Twin-linked, Anti-, Sustained
  Hits, and Lance (all of which modify the Wound roll specifically) came
  back unmapped in `data-pipeline/output/_unmapped_keywords.txt`. Worth a
  vocab decision before BON-4, not something to guess into place then.

---

## BUG_40K_PREGAME — 5 pre-game blockers ahead of brother game 5 (2026-07-16)

**Item 1 (blocker) — terrain placement infinite loop.** Turn-alternating
"Pass Turn" placement could strand a player with an active turn and no
budget left while the other player still had budget and no way to act.
Replaced with simultaneous placement: both players paint terrain against
their own budget at the same time, each hits "Done with Terrain"
independently (`terrainDone: {guard, eldar}` on the game doc), and the
phase advances to Deployment once both are done. `passTerrainTurn`
removed from `state.js`'s API, replaced by `confirmTerrainDone`.
`board.js`'s paint logic was already budget-scoped per player — no
changes needed there.

**Item 2 — same-faction games (e.g. Eldar vs Eldar) were blocked.** Root
cause: `players.guard`/`players.eldar` conflated two different things —
the structural/positional SLOT (deployment side, turn order, unit
ownership prefix) and the player's ARMY FACTION, derived via
`FACTION_MAP[slot]`. Fixed at the source: `roster.js`'s
`buildUnitsFromRoster` now derives `factionId` from the roster export's
own `meta.factionId` (the export already knows its army), not from the
slot — `FACTION_MAP` survives only as a defensive fallback for a roster
missing `meta.factionId`. `state.js`'s `createGame`/`joinGame` no longer
take a `faction` parameter at all; slot assignment is purely positional
(creator = guard-slot, joiner = eldar-slot) and each player's
`factionName`/`factionId` is stored from their own roster. `game.js` and
`lobby.js`'s hardcoded "Astra Militarum"/"Craftworld Eldar" labels
(game-over screen, initiative screen, player strip, waiting screen, join
form) now read `players.{slot}.factionName` with a slot-keyed fallback
for pre-fix games. Audited `board.js` and `shooting.js` — both already
used `.faction` (slot) correctly for ownership/ally-vs-enemy detection
and `.factionId` for gameData lookups, so neither needed changes; the
`roster.js` fix alone corrects the whole downstream chain. Verified with
a stubbed-Firebase smoke test: both players joining with the same Eldar
roster get distinct slots, no `unitGroup` collisions, and
`shooting.js`'s `findValidTargets` correctly treats the two same-army
groups as enemies of each other, not friendlies.

**Item 3 — roster list gated behind faction select.** Resolved as a
direct consequence of item 2: the "Choose Your Faction" card selector is
gone entirely from `lobby.js`'s create/join forms. The roster picker is
now the first thing shown, loads all published rosters unfiltered
(`loadRosterPicker(..., null, ...)`), and picking a roster is what sets
the faction (per the brief's preferred approach). Pasted roster ID/URL
fallback input is unchanged.

**Item 4 — shooting "no one in range."** Investigated both suspects the
brief flagged: (1) weapon range parsing — `roster.js`'s `tagWeapons`
reads `profiles.RANGE`, and the export's Firebase-key sanitizer
(`_FIREBASE_KEY_MAP` in `roster/index.html`) only remaps `BS/WS` → `bsws`;
`RANGE` is untouched, so this reads correctly. (2) inches-to-board-units
conversion — board `x`/`y` are inches directly (1:1), confirmed via
`state.js`'s `GAME_PRESETS` (`boardWidth`/`boardHeight` match real 40k
table sizes: 44×30/44×60/44×90) and `shooting.js`'s own range-check
(`Math.hypot(...) <= weaponRange`, no scaling factor anywhere). No
root-cause bug found in either place. Regardless, per the brief's
legibility mandate: added `shooting.js`'s `explainNoTargets()`, wired
into both `shootingTargetingHTML` render paths in `game.js`. When a
shooter group has no valid targets, the phase bar now says why — nearest
enemy's distance vs. the longest-ranged weapon's name and range (e.g.
"Nearest enemy is 28.0\" away — Wraithcannon range is 18\"."), or "in
range but blocked by terrain" if in range with no line of sight, or "no
enemy units remain" — instead of a bare "No valid targets in range or
line of sight." Verified with a stubbed smoke test covering all three
cases.

**Item 5 — port-worthy note only.** Logged in `killteam/DEVLOG.md`
(2026-07-16 entry): 40k's deployment auto-advance-to-next-unit is wanted
in KT's Firefight activation loop. Not built — note only, per the brief.

**Testing:** two stubbed-Firebase Node smoke tests (terrain
simultaneous-done ordering; same-faction game creation + enemy-detection)
and one pure-function smoke test (`explainNoTargets`), all deleted after
verification per the project's one-off-test convention — not committed.

Files: `warhammer40k/js/state.js`, `warhammer40k/js/roster.js`,
`warhammer40k/js/game.js`, `warhammer40k/js/lobby.js`,
`warhammer40k/js/shooting.js`, `killteam/DEVLOG.md`.

---

## W40K-UX1 — Table Feel Parity: hover, deployment log, layout scroll (2026-07-17)

Brief: `briefs/W40K_UX1_BRIEF.md`. From Nox's brother-game 5 playtest (first
real two-player 40k game, roster chain worked end to end). Brief said to
port killteam's own fixes for all three rather than reinvent — read
killteam/DEVLOG.md's `BUG_KT_PLAYTEST_1_1`/`KT-3`/`KT-5` entries first,
then ported the actual mechanisms (not just the gist) into 40k's
differently-structured codebase (KT is single-file `index.html`; 40k
splits `board.js`/`game.js`/`state.js`/`css/styles.css`).

**Item 1 — enemy hover labels.** Ported KT-3 item 3's exact pattern: a
native SVG `<title>` per token (`board.js`'s `drawUnits`) reading
`"{label} — {wounds}/{maxWounds}W"`, plus a `.token-hoverable` class with
`cursor:pointer` gated behind `@media (hover:hover)` (touch devices never
get a stuck pointer cursor). Readable name comes from `unit.label`
(roster-built games already carry this — see roster.js's
`buildUnitsFromRoster`); legacy dev-preset units (no `.label`) fall back
to the same `guard_squad`/`eldar_squad` names `groupLabel()` already uses,
then the type string. Applies to both sides' live tokens and destroyed
tokens (skull icon) alike. Verified live in a two-army dev-mode game
(13-unit Astra Militarum vs 13-unit Craftworlds Eldar): both sides' tokens
carry correct titles ("Krieg Command Squad — 3/3W", "Wraithguard — 3/3W").

**Item 2 — deployment placement log.** Ported KT-3 item 4's structured-
record reasoning exactly, scoped to the brief's explicit "minimum useful
version": a new `logAction(gameId, record)` in `state.js` pushes to
`games/{id}/actionLog` (schema comment updated), called from `deployGroup`
with `{type:'deploy', faction, playerName, groupId, unitLabel}` — the
caller (game.js's deployment placement handler) already had the deploying
player's name and the unit's real label in scope, so no extra Firebase
read was needed. `describeActionLogEntry()` (game.js) is the only place
that turns a record into English ("Nox deploys Krieg Command Squad") —
unknown record types render as nothing rather than guessing a sentence,
same as KT's own function. Rendered in a new "Log" section of the
deployment screen's left side panel (`actionLogHTML()`), reusing KT's own
`.log-panel-list`/`.log-panel-line` class names (added to `styles.css`,
didn't exist in 40k yet) for a consistent look across both apps. Verified
with two independent browser contexts (real create → join → deploy flow):
one player's deploy write shows "Nox deploys Krieg Command Squad" on
BOTH clients' panels, not just the deployer's own. Not extended to
non-deployment actions (movement/shooting/etc.) — the brief's "Done when"
only requires deployment narration; matching KT-3's full action-log
instrumentation for every phase is real additional surface, not "cheap,"
and wasn't attempted.

**Item 3 — layout scroll (recurring bug class, third occurrence).**
Reproduced first, deliberately, before touching CSS: a real two-army
13-unit game (Aaron's actual roster, `Jon-2000`) forced into the main
turn loop measured `scrollHeight=1436–1468px` against an 800px viewport
at both 1280px and 640px widths — confirmed the bug, not assumed it.
Root cause, read directly off `killteam/DEVLOG.md`'s `BUG_KT_PLAYTEST_1_1`
item 3 and matching exactly: `.screen { min-height: 100vh }` is a floor,
not a ceiling, so `.game-main`'s `flex:1`/`min-height:0`/`overflow:hidden`
never actually contains anything — a long unit list just grows the whole
page. Fixed by giving `#screen-game` a real `height: 100vh` (on top of
the inherited floor, pinning it exactly) plus `#game-content`'s own
`min-height: 0` so its flex children can actually shrink. 40k has no
`#app` wrapper the way KT does (screens are direct `body` children, and
`body` carries no competing padding), so this needed no extra
app-fullbleed toggle — simpler than KT's version by construction, not by
omission. Re-ran the same 13v13 repro after the fix: `scrollHeight ==
innerHeight` (800==800) at both widths.

Found live during verification, same as KT-5 item 2 found for KT: the
existing `.side-panel` was a fixed `210px`/`min-width:210px` — technically
zero page scroll, but at 640px-tiled width that crushed the board to
~220px (barely usable), same "satisfies the literal wording, misses the
point" gap KT-5 already fixed once. Ported the identical fix: `width:
clamp(130px, 15vw, 220px)` instead of a fixed width. Board width recovered
to ~380px at the same 640px viewport post-fix.

### Testing

Real headless Chromium (`.playwright-libs` workaround, borrowed from
`roster/` since `warhammer40k/` doesn't have its own copy — Playwright
itself is already a devDependency here, only the missing system
`libasound.so.2` needed the workaround), real `createGame`/`joinGame`/
`deployGroup` writes against live Firebase, disposable games deleted
implicitly (never referenced again, not cleaned up — matches this
project's existing 40k test-game hygiene). All Playwright scripts
one-off, not committed. Scroll repro/fix (2 viewport widths, before and
after), hover tooltip content on both factions (2), two-browser-context
deployment log narration on both clients (8 checks), lobby boot smoke
test (0 console/page errors).

Files: `warhammer40k/css/styles.css` (`#screen-game`/`#game-content`
height fix, `.side-panel` clamp, `.token-hoverable`, `.log-panel-*`/
`.side-panel-empty`), `warhammer40k/js/board.js` (`drawUnits` tooltips),
`warhammer40k/js/state.js` (`logAction`, `deployGroup` extended),
`warhammer40k/js/game.js` (`describeActionLogEntry`, `actionLogHTML`,
deployment panel wiring).

---

## 2026-07-17 — BUG_CRITICAL_ROUND6 items 2 & 5: investigation only, no code changed

Brief: `briefs/BUG_CRITICAL_ROUND6.md` (killteam-primary; this
subproject's two items investigated as part of the same session — see
`killteam/DEVLOG.md` for the full brief and its other items). **No
warhammer40k files touched** — a separate concurrent session was
actively editing `js/board.js`/`game.js`/`state.js` while this
investigation ran; kept to read-only grep/Read throughout specifically
to avoid collision, confirmed via `git status` before writing this entry
that DEVLOG.md itself was still clean.

**Item 2 — dead models blocking the Command Phase: audited thoroughly,
not reproduced.** Checked every `.alive`-dependent gate in `game.js`:
`unmovedeGroups`/`unShotGroups`/the charge-queue builder all correctly
exclude dead units; the four `.every(u => u...ThisTurn)` phase-sync
checks (lines ~1386-1436) all correctly `.filter(u => ... && u.alive)`
first; `getPendingCasGroups`/casualty allocation's `isAutoWipe` branch
correctly handles a fully-wiped group. Live-tested two scenarios with
real published rosters (Astra Militarum "Jon-2000" + Craftworlds Eldar,
13 unit-groups each): (a) one group fully wiped (6/6 dead) plus a
1-model group wiped, walked all five phases (movement→shooting→
charge→fight→command) via real `End Phase` clicks — no blocking, no
errors, both dead groups correctly excluded from every "select a unit
to X" list; (b) a mixed-casualty group (2 already dead, `pendingCasualties=2`
more) driven through the real casualty-allocation click-to-select UI —
worked correctly once tested against genuinely-alive tokens (first
attempt clicked models that happened to already be dead by test-fixture
construction, which board.js correctly ignores — a test artifact, not
an app bug, caught by isolating with a direct `dispatchEvent` vs
`elementFromPoint` check). Given item 1's cache-staleness hypothesis and
that every code path checked out clean, this is very plausibly a cache
ghost too — flagging rather than guessing further without a live
re-test.

**Item 5 — 40k weapon stats showing "Rng ? A ? BS ? S ? AP 0 D ?":
root-caused precisely, exact unit not identified.** `game.js`'s
`weaponRow()` (in `unitCardsHTML`) has two paths: a real roster-def
weapon (`w`), or — when that's falsy — a fallback to `lw = ((window.
UNIT_STATS||{})[u.type]).weapon || {}`, the *legacy* hardcoded default-
army stat table from `units.js`. Every field on an empty `lw` reads
`undefined` → renders `'?'`, **except** `AP`, which has its own explicit
`lw.ap !== undefined ? lw.ap : '0'` default — this is the *exact*
mechanism producing "AP 0" while every other field shows "?", confirmed
by reading the ternaries directly, not fabricated. Root cause is one
level up: `def = window.getRosterUnitDef(info.factionId, info.unitId)`
(→ `RosterLoader.getUnitDef`, a plain `cache[factionId][unitId]` lookup
into the flat-pool `gameData/warhammer-40k/{factionId}`) returned null
for whichever unit Nox screenshotted — a `factionId`/`unitId` key that
doesn't resolve in the flat pool, matching the brief's own "key mismatch
after the publish sanitizer?" suspicion exactly. Did not identify the
specific unit (no screenshot to work from, and roster-built `unitId`s
are roster-instance-specific, not something to guess at without the
real export) — next step if this recurs: check the browser console for
`getUnitDef`'s inputs (`u.factionId`, `u.unitId`) for the affected unit
and diff against `gameData/warhammer-40k/{factionId}`'s actual keys.

Files: none (investigation only).

---

## W40K-UX2 — Board Readability & Deployment Fixes (2026-07-17)

Brief: `briefs/W40K_UX2_BRIEF.md`. Sibling to W40K-UX1, from brother-game
5's second run — his own words are the spec for items 2–4.

**Item 1 — token size reflects base size.** Checked gameData directly
first: `baseRadius` is uniformly `0.5` for every real unit in the flat
pool, vehicles and titanic units included — no per-unit mm data exists
anywhere to read, exactly the situation the brief anticipated. Derived a
coarse visual tier from each unit's own `keywords` instead (real BSData-
sourced vocabulary, not invented): `TITANIC` → 1.4, `VEHICLE`/`MONSTER`/
`WALKER`/`FORTIFICATION` → 0.95, `MOUNTED`/`ARTILLERY` → 0.7, default
(infantry/character) → 0.5 unchanged. New `getTokenVisualRadius()` in
`board.js`, used only by the token-drawing/ghost-preview/drag-highlight
render paths — deliberately NOT wired into `calcCoherency` or any LOS/
range math, which keep the old flat `UNIT_STATS` default, since changing
those would shift real gameplay outcomes (out of scope per the brief's
own "any rules changes"). Verified live against Aaron's real 13-unit
Astra Militarum roster: Leman Russ variants render at 0.95, the
Stormlord (TITANIC) at 1.4, Rough Riders/Artillery Team (mounted/
artillery) at 0.7, every infantry squad unchanged at 0.5.

**Item 2 — deployment zone clarity.** Brother: *"I put my terrain on
your side... we need a way to make it more clear what side you are
starting on."* Root cause: the board's zone tint was static (always
guard-top/eldar-bottom, ~0.07 opacity) and the one PERSPECTIVE-aware
highlight that existed (`deployZone`/`deployZoneFaction`) only appeared
during actual deployment and followed whoever's turn it currently was —
during Terrain there was no perspective-aware indicator at all, and
during deployment it showed the ACTIVE player's zone, not necessarily
the viewer's own. Replaced with a `opts.myFaction`-driven render in
`board.js`: the viewer's own half gets a diagonal hatch pattern (new
`<pattern id="my-zone-hatch">`), a gold outline, and a "YOUR ZONE" label;
the opponent's half is grayed down. This is now constant across turns —
your zone is always yours, whoever's turn it is — wired into both the
Terrain and Deployment phase renders in `game.js` (`buildBoardOpts`,
both `boardOpts` branches). **Bonus (done): warn, don't block.** Terrain
phase now shows "⚠ N of your squares are in the OPPONENT's deployment
zone" if any of the player's own painted squares fall in the other
half — recomputed every render (so it stays accurate through erases,
not a one-shot check), never blocks placement. Verified live: hatch +
label render correctly in both phases, painting in the opponent's zone
triggers the warning without blocking the write.

**Item 3 — undo (deployment + movement).** Brother: *"we need an undo
button."* Ported WHF-5m's phase-scoped snapshot pattern (read
`warhammer-fantasy/DEVLOG.md`'s Phase 8 entry first, per the brief) —
same shape, adapted to 40k's per-group commit model:
- **Movement**: `movementSnapshot` (new game-doc field) is written inside
  `advancePhase()` at the exact moment a player's Movement phase begins
  (same branch that already resets `movedThisTurn`, reusing its own
  `units` read — no extra Firebase round-trip). `undoMove(gameId,
  groupId)` reverts that group's models to their snapshot x/y and clears
  `movedThisTurn`, refusing (returns `{undone:false}`) if the group
  hasn't moved this turn or nothing was actually revertible. Rendered as
  an "Already moved — undo?" list in the movement queue view
  (`movementQueueHTML`'s new `movedGroupIds` param), one button per
  already-moved group.
- **Deployment**: no per-model position snapshot needed — an undeployed
  group is hidden from the board purely by its membership in
  `undeployedGroups`, so undoing a deploy just means putting the group
  back in that list; stale x/y on its models is harmless until the next
  real placement overwrites it. `lastDeploy` (new game-doc field, `{
  faction, groupId, playerName, unitLabel, prevUndeployedGroups,
  hadNextPlayer }`) gets overwritten by every `deployGroup` call — mine
  or the opponent's — which is what makes "the opponent hasn't acted
  since" free to check: `undoDeployment(gameId, faction)` just compares
  `lastDeploy.faction` against the caller. If the undone deploy had ended
  the phase (advanced to Initiative), it's reverted back to Deployment
  too. Deliberately scoped to the deployment phase's own UI only — no
  undo affordance is wired into the Initiative screen, so a deploy that
  ends the phase can no longer be undone once Initiative renders
  (matching the brief's "do not allow undo after any action with
  opponent-visible side effects": initiative rolls can start immediately
  on that screen).

Verified with two real browser contexts (not dev mode — dev mode's
deployment view always follows `turn.activePlayer` for "my" perspective,
which can never reproduce "my own screen, opponent's turn," the exact
case this item needs): the deployer's own screen shows an undo button
after passing the turn to the opponent, the OTHER player's screen does
not; undo correctly restores the undeployed-group count and reverts
`turn/activePlayer`. Movement: `advancePhase` genuinely writes the
snapshot on phase entry, a real commit+undo round-trip restores exact
position and `movedThisTurn`, and a second undo attempt on an
already-reverted group correctly refuses.

**Item 4 — model arrangement within a unit.** Brother: *"make it auto
move them around to keep them from being on top of each other or
leaving weird gaps."* Deployment already auto-arranges (existing
`onDeployPlaced` grid-cluster math) — the real gap was after a move,
since models drag individually with no re-tidy on confirm. Added: on
`btn-confirm-move`, for any group with more than one model, the
raw dragged positions are discarded in favor of a clean grid centered on
their own centroid (same spacing/cols formula as deployment's cluster,
independently reimplemented in `game.js` rather than reaching into
`board.js` for a five-line formula) — direction/intent of the drag is
preserved, per-model overlap/gaps are not. Clamped to board bounds;
terrain-passability of the arranged positions is NOT re-checked
(noted, not fixed, per the brief's own "if not cheap, note it and
stop" — the drag itself already validated the raw positions, and
re-validating a different set post-arrangement is real additional
work). Manual rearrangement was not attempted for the same reason —
auto-tidy was confirmed to be the ask that mattered. Verified with real
mouse-drag interactions (not synthetic state injection): dragged every
model in a 6-model squad to the same overlapping spot, confirmed the
move, and the final Firebase-written positions form a perfect 3×2 grid
at exactly 2" spacing with zero overlaps.

### Testing

Real headless Chromium (`.playwright-libs` workaround, same as
W40K-UX1) against live Firebase throughout, real `createGame`/
`joinGame`/`deployGroup`/`advancePhase`/`confirmUnitMove` calls — no
fixture, no mocked state. All Playwright scripts one-off, not committed.
Notable methodology point carried from W40K-UX1: raw REST writes to
`turn/phase` are fine for pure layout/render checks but **wrong** for
anything whose side effect lives inside `advancePhase()` itself
(`movementSnapshot`) — those need the real client function called, not
the phase value alone.

Files: `warhammer40k/js/board.js` (`getTokenVisualRadius`, zone
hatch/label rendering, `my-zone-hatch` pattern), `warhammer40k/js/game.js`
(`buildBoardOpts` myFaction wiring, terrain out-of-zone warning, undo-
deploy button + handler, `movedGroups`/undo-move UI, move-confirm
auto-arrangement), `warhammer40k/js/state.js` (`undoDeployment`,
`movementSnapshot` write in `advancePhase`, `undoMove`).

---

## MOBILE-1-40K — Make a phone turn possible in 40k (2026-07-17)

Brief: `briefs/MOBILE_1_40K_BRIEF.md`. Written by a planner with no repo
access from `MOBILE_AUDIT_REPORT.md` — verify-first mattered here more
than usual. Success condition: Aaron can take a complete turn on his
phone. Commits: `1c5a3ef` (item 1), `cd55c99` (item 2), `47eae19`
(item 3).

### Item 0 — housekeeping

Confirmed clean: W40K-UX1 landed (`a88019d`) and both things the audit
flagged as in-progress at the moment it ran (`_tmp_scroll_repro.js`, an
uncommitted `clamp()`/hover-cursor styles.css diff) are gone — no stray
temp files anywhere in `warhammer40k/`, `git status` clean before this
brief's own work started. The audit's snapshot was accurate for the
moment it was taken, mid-session, before that session's own cleanup and
commit; nothing to report beyond that.

### Item 1 — layout: the board must be visible

**Verified the audit's root-cause claim directly, and it diverged from
killteam's diagnosis exactly as the brief warned it might — but in this
codebase it was correct.** The Shooting phase's `shootingQueueHTML()`
(and, found while auditing the same shape elsewhere per the brief's
instruction, `movementQueueHTML()`/`chargeQueueHTML()` too) renders one
button per unit-group with no cap, inside `.phase-bar`, which had no
`max-height`/`overflow`. Since `.game-main` (the board row) is the
`flex:1` element and `.phase-bar` isn't, an uncapped list just grows
`.phase-bar` and evicts the board — a class of bug (three renderers
share the exact same unbounded shape), not one instance.

**Fix, two parts, exactly as scoped:**
- (a) `.phase-bar { max-height: 25vh; overflow-y: auto; }` — a container-
  level fix rather than patching each queue list individually, so any
  future unbounded content inside the phase-bar is contained for free.
- (b) A mobile breakpoint (`@media (max-width:600px), (max-height:500px)`
  — same trigger the parallel killteam session used, confirmed via its
  own brief so the two apps don't diverge) hides `.side-panel-left`/
  `.side-panel-right` behind a tap-to-open drawer (`mobilePanelTogglesHTML()`/
  `bindMobilePanelToggles()`, shared across all three phase renderers —
  terrain/deployment/main turn loop — rather than each building its own).
  Even the existing `clamp(130px,...)` floor left the board only ~130px
  wide out of 390px; the audit was right that this specific floor isn't
  the vertical-collapse culprit, but it's still a real width problem this
  brief's own "Done when" (board dominant) implicitly covers.

**Measured before/after, both orientations, real 13-unit-group roster
(Jon-2000), Shooting phase active** — reverted the CSS via `git stash`
first to get a genuine "before" number rather than trusting the audit's
possibly-stale one:

| | before | after |
|---|---|---|
| portrait 390×844 | board 130×0 | board 390×390, phase-bar 211 |
| landscape 844×390 | board 584×0 | board 844×143, phase-bar 98 |

Board is dominant over the phase-bar in both orientations post-fix.
Landscape is tighter (as the brief predicted — less vertical room to
spare), but still clearly usable, not collapsed.

### Item 2 — gestures: the core item

**Verify-first divergence, reported as instructed rather than built
around silently:** the brief lists 3 drag flows (movement, casualty
allocation, terrain paint). Reading `board.js` end to end (every
`mousedown`/`mousemove`/`mouseup`/`document.addEventListener` site) found
only **2 genuine drag flows** — movement and terrain paint, both driving
continuous position updates across `mousedown→mousemove→mouseup`.
Casualty allocation (`onModelToggled`) is a single `mousedown`-click
toggle with no drag state at all — the *same* shape as shooting/charge
target selection, which the brief itself already calls out as "good
news, already touch-shaped." It isn't one of the 3 flows; it just reads
like it might be from the brief's own description.

**Converted the 2 real flows, movement first per the brief's stated
priority:** `mousedown`/`mousemove`/`mouseup` → `pointerdown`/
`pointermove`/`pointerup`, as a straight **replacement** (the old mouse
listeners are gone, not left running alongside — both firing on a real
touch tap would double-write to Firebase, an actual desync given
determinism between clients is non-negotiable here). Terrain paint's
listeners are scoped to the SVG element itself (unlike movement's, which
already tracks via `document`), so added `svg.setPointerCapture(e.pointerId)`
on its `pointerdown` — without it a fast finger-drag that strays outside
the SVG's screen bounds mid-stroke would silently stop receiving
`pointermove`/`pointerup`. Added `touch-action: none` on `.board-svg` —
JS `preventDefault()` alone isn't reliable across browsers for
suppressing the default scroll/pan gesture claim; some decide
touch-action from CSS before the handler runs at all. Board pan/zoom is
explicitly out of scope, so disabling every default touch gesture on the
board costs nothing.

**Verified with real CDP touch events (`Input.dispatchTouchEvent`), not
`.click()`, per the brief's explicit requirement**, then re-verified
with a real desktop mouse drag on both flows to confirm no regression:
- Movement: a genuine touch-drag on a token registers the move, shows
  Confirm Movement, and writes the new position + `movedThisTurn` to
  Firebase on confirm. Desktop mouse drag re-verified identically after.
- Terrain paint: a genuine touch-drag paints squares owned by the
  correct faction, written to Firebase. Desktop mouse re-verified after.
- Casualty allocation and shooting/charge target selection (not
  converted, per the finding above) were touch-tap-verified anyway,
  matching the brief's own instruction to "verify under real touch and
  leave it alone otherwise" for already-touch-shaped flows — both
  genuinely work via a real CDP touch tap once positioned in a realistic
  in-range scenario (the first attempt at this used a scenario where
  units were still ~83" apart, correctly showing "no valid targets" —
  not a bug, a test-setup gap, caught and fixed before trusting the
  result).

### Item 3 — touch targets

Shooting-queue "select a unit" buttons measured 235×35px against actual
source (confirmed the audit's number) — under the 44px minimum. Bumped
`.btn`'s vertical padding globally (0.6rem → 0.9rem; iterated from 0.8
through 0.85 to 0.9rem, measuring the real rendered height each step
rather than trusting arithmetic — browser font-metric rounding meant the
first two guesses landed at 42px and 43px) rather than only touching the
flagged queue buttons, so every button in the app meets the minimum
consistently instead of leaving the same undersized shape everywhere
else once one instance got fixed. Also widened the gap between stacked
queue buttons (movement/shooting/charge/undo-move — 4 sites) from
0.4rem to 0.6rem margin-bottom. Measured post-fix: buttons 45px tall,
10px gap between wrapped rows.

Unit cards left untouched, per the brief (already fine at 108×116–133px).

**Board tokens — measured post-item-1-fix, not resized from the audit's
non-reading, across all three game-size presets** (board aspect ratio
varies a lot: 44×30 / 44×60 / 44×90):

| preset | board-svg (390×844 viewport) | smallest-tier token |
|---|---|---|
| combat-patrol | 374×387px | 9×9px |
| incursion | 374×387px | 6×6px |
| strike-force | 374×387px | 4×4px |

Genuine finding, not a layout bug: even at the best case (combat-patrol,
the squattest board), a small-tier token is only 9×9px on a 390px-wide
phone — the SVG's own `preserveAspectRatio="xMidYMid meet"` scales by
whichever axis is more constrained, and a 44"-wide board only gets ~4.3–8.5
px/inch depending on preset when fit into a roughly-square screen area.
The invisible hit-area circle board.js already draws is meaningfully
bigger than the visual token (`Math.max(r, 0.7)` vs the visual `r`), so
actual tap-ability is better than the visual size alone suggests, but
this is a real, worth-flagging concern for a future brief (larger unit
counts and/or a portrait-oriented board rendering, not something to
guess a fix for here) — not something this brief's scope covers fixing.

### Item 4 — forward-looking hover-label audit

Confirmed the audit's baseline: exactly 3 `title=` attributes exist,
all on dev-only preset buttons (`DEV_PRESETS` rows) — unchanged, still
dev-only. 40k does not have killteam's "disabled-reason exists only on
hover" disease and this pass didn't introduce it.

**Flagged, as instructed:** W40K-UX1's token hover tooltip (an SVG
`<title>` element reading `"{label} — {wounds}/{maxWounds}W"`) has no
tap-reachable fallback on mobile — SVG `<title>` is a pure hover
tooltip, and touch devices have no hover state at all, so it will never
show on a real phone. Mitigating factor: the same unit name (though not
live per-model wounds) is already visible without hovering, in the
always-present unit-cards side panel — now reachable via item 1b's
drawer toggle on mobile, so the information isn't fully lost, just not
available at a glance on the token itself. Not retrofitted in this
pass — the rule this brief establishes ("any NEW hover label ships with
a tap fallback") postdates that addition; flagging it is what the brief
asked for, not a mandate to go back and rebuild it.

Also checked my own new additions from this session: the mobile-panel-
toggle buttons (`‹`/`›`) carry `title="Show left/right panel"`. Judged
this is not the same failure class — these are real, always-tappable
`<button>` elements whose function doesn't depend on reading the
tooltip (tap it, the panel opens), unlike killteam's actual disease
(a *disabled* control whose only explanation for being disabled was
hover-only text). Left as-is; noted here for transparency rather than
silently deciding it was fine without saying so.

### Testing

Real headless Chromium (`.playwright-libs` workaround, borrowed from
`roster/`) against live Firebase throughout — `createGame`/`joinGame`/
`advancePhase`/`confirmUnitMove`/`writeTerrain` real calls, no fixture.
Real CDP touch events (`Input.dispatchTouchEvent` — `touchStart`/
`touchMove`×N/`touchEnd`) for every touch-drag and touch-tap claim in
this report, never `.click()` standing in for touch. Every fix
re-verified with real desktop mouse interaction after the touch pass, to
satisfy the brief's explicit no-regression requirement. Two real browser
contexts were not needed for this brief specifically (no cross-client
state-race concern in any of these 4 items — unlike W40K-UX1/UX2's
deployment-undo and action-log work, which did need it), but the
mandate is noted and was already the working pattern for anything that
does need it. All Playwright scripts one-off, not committed, per this
project's established convention.

### Anything this brief failed to anticipate

- Item 2's premise (3 drag flows) was one flow short of accurate —
  casualty allocation isn't a drag. Worth correcting in
  `MOBILE_AUDIT_REPORT.md` if that document gets reused for the
  killteam-side brief or a future pass here.
- Constructing a genuine touch-testable "target in range" scenario in
  dev mode took real iteration (dev-mode units start ~83" apart on a
  strike-force board, and a naive teleport-one-model-closer approach hit
  a second, unrelated snag: the teleported model landed underneath a
  much larger vehicle token's z-order at that exact screen point, so
  even a real *mouse* click missed it). Neither was a product bug; both
  cost debugging time before the test scenario was trustworthy.
- Item 3's token-size finding (9×9 to 4×4px across presets) is real and
  worth a future brief's attention if Aaron reports mis-taps on tokens
  specifically, but doing anything about it (larger base-relative token
  minimums? a different board aspect ratio at mobile sizes?) is a real
  design question, not a bug fix, and wasn't attempted here.

Files: `warhammer40k/css/styles.css` (`.phase-bar` cap, mobile
breakpoint + drawer CSS, `.board-svg` touch-action, `.btn` padding),
`warhammer40k/js/board.js` (pointerdown/move/up conversion + pointer
capture for movement and terrain paint), `warhammer40k/js/game.js`
(`mobilePanelTogglesHTML`/`bindMobilePanelToggles`, queue-button gap).

---

## MOBILE-2-40K — Pan/zoom the board (2026-07-18)

Brief: `briefs/MOBILE_2_40K_PANZOOM_BRIEF.md`. Exists because of
MOBILE-1's own item-3 finding (tokens as small as 4×4px). Success
condition: Aaron can take a complete turn on his phone. Commit: (this
DEVLOG entry's own commit — see hash below).

### FIRST TASK — map size list

`window.GAME_PRESETS` (state.js): exactly 3 sizes, all 44" wide —
**combat-patrol** 44×30, **incursion** 44×60, **strike-force** 44×90
(the largest, used as the capstone's worst case). Everything below was
checked against all three, not one.

### Verified vs diverged

- **Verified**: the board is a fixed SVG `viewBox` with zero gesture
  handling anywhere in `board.js` (`grep` for `wheel`/`gesture`/
  `touchstart`/`pinch` — one hit total, the static `viewBox` string at
  SVG creation). viewBox mutation was the right mechanism, exactly as
  the brief said.
- **Verified**: `render()` fully rebuilds the `<svg>` element from
  scratch (`container.innerHTML = ''`) on every single Firebase update
  — meaning zoom/pan state has to live in a module-level variable
  outside `render()`'s own scope, or it silently resets to default on
  every opponent action. Designed for from the start, not discovered as
  a bug afterward.
- **Diverged (minor)**: the brief's item 4 framed "1 square = X inches"
  as possibly varying per map size ("the answer may differ per map").
  Checked `drawGrid()` directly: the grid step is a flat constant (2"),
  not derived from `bW`/`bH` — all three map sizes use the same square
  size, they just fit different numbers of squares. Still sourced the
  indicator from that one real constant (`GRID_SQUARE_INCHES`, now
  shared with `drawGrid()` itself) rather than hardcoding a second "2"
  independently, in case that ever changes.
- **Latent gap found and fixed while implementing pinch**: MOBILE-1's
  movement-drag `docMove`/`docUp` (document-level pointermove/pointerup)
  never checked `pointerId` — harmless before pinch existed (nothing
  ever had a second live pointer mid-drag), but a real hazard now that a
  second finger touching down for a pinch could otherwise feed into an
  in-progress single-token drag. Added `pointerId` scoping to both.

### Item 1 — pan/zoom via viewBox

State: `{ bW, bH, scale, cx, cy }`, module-level in `board.js`, keyed by
board size (a differently-sized board starts fresh at default — same
game, size never changes mid-game, so this only matters across
different games). `MIN_SCALE = 1` (today's default: the whole board).
`computeMaxScale()` is **dynamic, never hardcoded** per the brief's own
explicit warning: reads the SVG's actual on-screen size right now via
`getBoundingClientRect()`, and derives whatever scale makes a
`SMALLEST_TOKEN_DIAMETER` (1.0 board-unit, the "small" tier's 0.5
radius — the worst case) reach 44 screen px. Self-corrects across
orientation change/resize since it's recomputed, not cached. Zoom
centers on the gesture (`zoomAt()` holds a board-space point visually
fixed across a scale change — standard "zoom to point" formula, derived
and written out, not copied from anywhere). Pan (`panByBoardDelta()`)
converts a screen-pixel delta to board-units using the live `scale`,
not `toSVG()` re-derivation (which would drift once panning starts
moving the very viewBox `toSVG()` reads from). Everything funnels
through `clampState()` before ever touching the DOM.

**Measured, every map size, 390×844, default AND max zoom** (max-zoom
number should read exactly 44.0 — that's the point of the dynamic
derivation, not a coincidence):

| map | default zoom | max zoom |
|---|---|---|
| combat-patrol (44×30) | 8.5×8.5px | 44.0×44.0px |
| incursion (44×60) | 6.5×6.5px | 44.0×44.0px |
| strike-force (44×90) | 4.3×4.3px | 44.0×44.0px |

Pan clamping verified separately (zoomed in, then dragged an extreme
distance repeatedly in both directions): viewBox stayed within `[0,44]`
×`[0,90]` (strike-force) in every case — board never goes fully
off-screen.

### Item 2 — gesture disambiguation (the core risk)

Resolution, verified to fit this app rather than assumed:
- **One finger on a token** — untouched. Pan/zoom's `pointerdown`
  handler is a genuinely separate listener (not a replacement), added
  first but never calling `stopPropagation()` — it only acts on
  empty-board touches, so movement's own `pointerdown` (which already
  no-ops if the target isn't a token) never sees any interference.
- **One finger on empty board** — pans, but **only for touch/pen**
  (`e.pointerType !== 'mouse'`). Desktop's left button is completely
  excluded from this path on purpose — every existing left-drag
  behavior (movement, terrain paint, deployment's click) had to keep
  working unchanged, and the brief's own desktop section names a
  *different* trigger for desktop pan anyway.
- **Two fingers** — pinch-zoom + pan combined (`pinchPrev` tracks the
  previous frame's distance + midpoint; scale change and midpoint
  translation are applied as two composed steps, both centered through
  the same-frame `toSVG()` conversion so they stay consistent with each
  other). Available in every phase/mode — no flow in this app uses 2
  concurrent pointers for anything else, so there's nothing to collide
  with.
- **Real bug caught before it shipped**: my first draft called
  `e.preventDefault()` unconditionally on the touch-empty-board
  pan-start branch. That suppresses the browser's synthetic `click`
  event that deployment's placement handler depends on (deployment was
  never converted to pointer events — it's click-based, not a drag).
  Fixed by only calling `preventDefault()` once real movement is
  detected in `pointermove`, not on `pointerdown` itself — a bare tap
  (pointerdown → pointerup with no real movement) now leaves the native
  click untouched, so deployment placement, casualty allocation, and
  target selection all still fire correctly through their existing
  paths. Caught by re-reading my own draft against the deployment code
  before testing, not by a failing test — worth flagging since it would
  have been a real regression if shipped.

**Item 2's terrain-paint collision, resolved exactly as the brief
suggested**: paint mode is modal. One-finger-drag-on-empty-board already
means "paint" in that phase (pre-existing), so one-finger pan is
disabled while `opts.terrainPlacement` is active — checked with a
`paintModeActive` flag before ever starting a pan. Two-finger pinch is
unaffected (no collision to resolve there) and still works during
terrain placement.

**Verified with real CDP touch events** (`Input.dispatchTouchEvent`,
multi-point for pinch — never `.click()`), each proven independently
and proven not to trigger the others:
- Two-finger pinch zoomed a token from ~4px to 22px with **zero**
  Firebase writes (confirmed no unit's `x`/`y` changed).
- One-finger drag on a token still triggered Movement's Confirm UI
  (pan wiring doesn't interfere).
- One-finger drag on empty board changed the viewBox, wrote **no**
  Firebase state, and did **not** open the move-confirm UI.
- Terrain phase: one-finger drag on empty board still painted squares
  (existing behavior, unchanged) and did **not** also pan the view;
  two-finger pinch still zoomed during terrain placement.

### Item 3 — touch-action, permanently

Already satisfied — MOBILE-1 already added `.board-svg { touch-action:
none; }` as a static CSS rule (not set reactively inside a handler).
Confirmed still in place, updated its comment (previously said "pan/zoom
is out of scope for this brief," now stale) and confirmed it also
correctly blocks the browser's own pinch-to-zoom-the-page gesture from
hijacking two-finger touches before board.js's own pinch handler sees
them (verified as part of the pinch tests above — they wouldn't have
registered at all otherwise).

### Item 4 — scale indicator

Persistent HTML overlay (`.board-scale-indicator`, bottom-right of
`.board-wrap`) reading `1 square = 2"` — plain HTML, not an SVG
element, so its on-screen size stays fixed regardless of the current
zoom (an SVG text element would need its own counter-scaling to avoid
visibly growing/shrinking with every pinch, extra complexity for no
benefit). Sourced from `GRID_SQUARE_INCHES`, the same constant
`drawGrid()` itself now reads, not a second hardcoded "2" — see the
verify-first divergence above re: this not actually varying per map.

### Desktop mouse — re-verified, no regressions

- **Wheel = zoom**, `{ passive: false }` + `preventDefault()` so it
  never scrolls the page (verified directly: `scrollHeight` stayed at
  `innerHeight` through 10+ wheel notches). Verified it zooms toward the
  cursor position, not the board origin — wheeled near the board's
  right/top edge and confirmed the post-zoom viewBox shifted toward that
  side rather than staying anchored at the old top-left.
- **Middle-drag = desktop pan** (the brief's "pick one, report which" —
  chose middle-drag over space+drag: no keyboard-modifier state to
  track, and it doesn't require excluding the left button from
  anything it wasn't already excluded from). Verified: panned the
  viewBox with zero interference from anything else.
- **Left-drag on a token still moves it** — re-verified end to end
  (drag → Confirm Movement appears → confirm → position written to
  Firebase) after the wheel/middle-pan tests ran first, to make sure
  those didn't leave any state that would break it. No regression.
- **Left-click target selection still works** — re-verified end to
  end (select shooter → click target → phase-bar shows the target
  name). No regression. (Needed a fresh game + reload to test cleanly:
  the earlier wheel/pan tests left the view zoomed into an arbitrary
  spot, and SVG's default `overflow:hidden` clips content outside the
  current viewBox — a teleported-for-testing unit at a fixed board
  coordinate can end up genuinely off-screen if the view is still
  zoomed/panned from an unrelated earlier interaction. Not a bug: a
  real player who zoomed away from their army would have the same
  “can’t click what isn’t visible” experience, and would pan back
  first — exactly what this test had to do too.)

### Library vs hand-rolled

**Hand-rolled**, kept in one section of `board.js` (a `---- Pan/Zoom
----` block, not a separate file — no build step in this project, and
this is tightly coupled to the same SVG/render lifecycle already
living in this file). Reasoning: no build step means a library is a
vendored file either way, so there's no integration-cost win over
hand-rolling; general-purpose pan/zoom libraries (panzoom,
svg-pan-zoom) default to CSS-transform-based implementations
internally, which is exactly what this brief forbids for the
coordinate-math-must-stay-untouched reason — using one would mean
fighting its own defaults, not being handed anything for free. The
actual math (~180 lines including comments) is well-understood and
small. Did not consider Hammer.js or similar touch-gesture libraries,
per the brief's explicit instruction (pointer events are native and
made them obsolete).

### CAPSTONE — one continuous real-touch turn, 390×844, strike-force (largest map)

Real ~13-unit-group Astra Militarum roster (`Jon-2000`). All steps via
`Input.dispatchTouchEvent`, never `.click()`:

1. Selected a unit from the movement queue (real button tap).
2. Token measured 4.2px on-screen (strike-force default zoom) —
   pinch-zoomed in, centered on the token itself, to 33.3px.
3. Real touch-drag on the now-tappable token → Confirm Movement
   appeared → tapped it → position + `movedThisTurn` actually written
   to Firebase.
4. Fresh game/reload for a clean Shooting scenario (same reasoning as
   the desktop target-selection re-test above), selected a shooter,
   pinch-zoomed onto the target, tapped it → selected as target →
   tapped Confirm Shooting → shot actually resolved and written to
   `turn/shotLog`.
5. **End Phase required scrolling `.phase-bar`'s own internal scroll
   area to reach** — 12 of 13 groups hadn't shot yet, so the unshot
   queue plus the shot-result summary pushed the button below the
   25vh cap MOBILE-1 set. Not a bug — the exact "scroll instead of
   evicting the board" behavior that fix was built for, and exactly
   the tradeoff flagged (not fixed) in MOBILE-1's own report. Scrolled
   `.phase-bar` (same as a real player would), tapped End Phase — phase
   advanced from Shooting to Charge.

**9/9 checks passed. The capstone succeeds on the largest, worst-case
map.** Nothing blocks a complete turn.

### Testing

Real headless Chromium (`.playwright-libs` workaround) against live
Firebase throughout, real `createGame`/`advancePhase`/`confirmUnitMove`/
`confirmUnitShoot` calls. Real CDP touch events for every touch claim —
single-point drags via `Input.dispatchTouchEvent` `touchStart`/
`touchMove`×N/`touchEnd`, genuine two-point pinch via two simultaneous
`touchPoints` per event (not two separate one-finger sequences). No
Firebase writes came from this brief's own pan/zoom code at any point
(confirmed directly — pinch-zoom test asserted zero unit position
change) — this brief didn't need two-browser-context testing per its
own "if you find yourself writing to Firebase, stop and report" rule,
and that check came back clean. All Playwright scripts one-off, not
committed.

Files: `warhammer40k/js/board.js` (pan/zoom state + math, gesture
wiring in `setupInteraction`, `pointerId` scoping fix for movement drag,
`GRID_SQUARE_INCHES`), `warhammer40k/css/styles.css`
(`.board-scale-indicator`, `.board-svg` touch-action comment update).

---

## BUG-40K-CASUALTY-LOCK — one root cause for both symptoms (2026-07-18)

Brief: `briefs/BUG_40K_CASUALTY_LOCK_BRIEF.md`. From Nox's live playtest:
#12 (5 Wraithguard, 1 wounded, needs 4 removed, only some models clickable,
hard lock) and #5 ("can't click units to remove, can't confirm removal —
rejoin fixed it").

**Root cause, confirmed by reproduction, not guessed:** `board.js`'s
casualty-allocation click handler resolved the clicked model with
`e.target.closest('[data-unit-id]')` — that only ever returns the
**topmost** element at that screen pixel. Two things routinely put a
different, ineligible token in that same pixel: a dead model keeps its
board position (skull icon still paint-hit-testable, no z-index concept in
SVG — paint order is DOM/`Object.values(units)` order) and any other
group's models can sit within the 0.7"-radius hit-area of an alive
in-group model (melee engagement range is ~1", comfortably inside 2×0.7").
Whichever token happened to be later in DOM order silently absorbed the
click; the handler's own eligibility check (`unit.unitGroup ===
allocationGroup && unit.alive`) then just `return`ed with no fallback,
leaving the actually-intended model untouched. Once a player got capped
below the required count this way, `Confirm Removal` stayed permanently
disabled — matching both symptoms from the same mechanism (#12's "2
un-clickable models" and #5's "can't confirm removal"). The brief's other
suspicion — stale local state needing a real transaction, per the
terrain-deadlock precedent — was checked and ruled out: `subscribeToGame`
uses `ref.on('value', ...)`, which always delivers the complete current
node, not a partial/stale merge, so there's no read-then-write race in
this particular flow to fix with a transaction. **One bug, not two.**

**Reproduced before fixing:** built synthetic Firebase game fixtures (raw
REST `PUT` to `games/{id}`, no client code involved) with a 5-model
Wraithguard unit and `pendingCasualties: 4`, then drove real Chromium
clicks via Playwright (`.playwright-libs` workaround, same as prior 40k
sessions) at each token's exact center. With two other tokens (one dead
ally, one enemy) placed at the same coordinates as 2 of the 5 Wraithguard,
clicking those 2 tokens' centers registered nothing — selection capped at
3/4, Confirm stayed disabled — the exact hard lock #12 describes.

**Fix** (`js/board.js`, casualty-allocation `mousedown` handler only):
replaced the single-element `closest()` lookup with
`document.elementsFromPoint(e.clientX, e.clientY)`, which returns every
element stacked at that pixel in paint order, then takes the first one
that resolves to an eligible (alive, in-group) token. Re-ran the exact
reproduction fixture post-fix: all 4 previously-blocked clicks now
register, count reaches 4/4, Confirm enables and writes correctly.

**Scope note, flagged not fixed:** the shooting/charge target-click
handler right below the fixed one (`onTargetSelected`/`validTargetGroups`)
uses the identical single-`closest()` pattern and is exposed to the same
occlusion risk (a token from an ineligible group sitting on top of a valid
target). Not touched — no symptom reported against it yet and the brief's
own scope is casualty allocation specifically; worth a fast follow-up if
Aaron ever reports a target he "can't click."

### Test — 4 required checks, all pass

Real headless Chromium via Playwright/CDP against live Firebase (synthetic
fixtures, not a full played-out game — the exact click-occlusion mechanic
doesn't depend on how the units got there). All four disposable test
games deleted from Firebase after verification.

1. **5-model unit, 1 wounded, needs 4 removed, 2 forced-occluded (repro of
   #12's exact shape).** PASS — pre-fix: 2 clicks silently no-op, capped
   at 3/4, Confirm disabled forever. Post-fix: all 4 register, Confirm
   enables, confirming writes exactly 4 dead + 1 alive to Firebase,
   `pendingCasualties` cleared to `null`.
2. **Full-wipe (all 5 die, `pendingCasualties: 5`).** PASS — auto-wipe
   branch (`isAutoWipe`) shows "Remove All Models", one click removes all
   5, `pendingCasualties` cleared. This path never depended on per-model
   click resolution to begin with, confirmed still correct.
3. **#5's reload-fixes-it path.** Root cause is the SAME occlusion bug
   (confirmed above, not a separate stale-state issue) — with clicking now
   correctly resolving through occluding tokens, Confirm no longer gets
   stuck below the required count, so no reload is needed. Did not find a
   second, independent stale-state bug to fix on top of this.
4. **Other client sees the same result — no desync.** PASS — two real
   separate browser *contexts* (not dev-mode single-tab perspective
   switch), eldar client resolves the allocation, guard client's own
   independent Firebase subscription shows the identical post-allocation
   model count with no extra propagation delay beyond the write itself.

**The game can no longer dead-end in casualty allocation from this
mechanism** — every model that must be selectable to reach the required
count now resolves correctly regardless of what else is occupying that
pixel.

Files: `warhammer40k/js/board.js` (casualty-allocation click handler).

---

## BUG-40K-BOARD-BATCH item 1 — target-click occlusion (2026-07-18)

Brief: `briefs/BUG_40K_BOARD_BATCH_BRIEF.md`. Pre-emptive fix for the exact
landmine BUG-40K-CASUALTY-LOCK flagged: the shooting/charge target-click
handler right next to the casualty-allocation one used the identical
single-`e.target.closest()` lookup, so a valid target token sitting behind
an ineligible one (wrong faction, out of range, a corpse) at the same
screen pixel could never be clicked — the ineligible token silently wins
paint order and the click resolves to nothing.

**Fix:** same pattern as the casualty fix, applied to this handler too —
`document.elementsFromPoint(e.clientX, e.clientY)` walks the full z-stack
for the first `[data-unit-group]` whose group is actually in
`validTargetGroups`, instead of only ever considering the topmost element.

**Reproduced before fixing** (synthetic Firebase fixture, real
Playwright/CDP clicks, `.playwright-libs` workaround): a guard shooter, a
valid eldar target, and a friendly guard "occluder" token placed at the
exact same board coordinates as the target (key-ordered to paint later,
same trick BUG-40K-CASUALTY-LOCK's repro used). Confirmed the friendly
occluder is never itself a valid target (different `unitGroup`, and
`validTargetGroups` only ever contains enemy groups per
`findValidTargets`), so pre-fix this was a hard "can't click it" case, not
just imprecision.

### Test — both required checks, pass

1. **Stacked target (the back one).** PASS — clicking the exact screen
   spot shared by the occluder and the real target resolved shooting
   targeting to "Wraithguard (target)" (the actually-intended, occluded
   group), reaching the resolved/Confirm-Shooting state.
2. **Normal, un-stacked targeting.** PASS — a second, unoccluded enemy
   group at a different spot on the same board resolved correctly to
   itself when clicked, same session, no regression.

No corresponding symptom had been reported for this path — fixed
pre-emptively per the brief, same mechanism, same fix shape, no new
pattern invented.

Files: `warhammer40k/js/board.js` (target-click handler for
shooting/charge targeting).

---

## BUG-40K-BOARD-BATCH item 2 — units can stack on placement (2026-07-18)

Brief's own item 2 (bug #1): during deployment, models could be dropped
onto the same square as an existing unit, overlapping.

**Investigated first, per the brief.** `deployValid()` (`board.js`'s
`setupInteraction`, deployment-placement block) checked deployment-zone
bounds and terrain (`modelOverlapsTerrain`) — **no check against other
units at all**. Movement, by contrast, already has a real model-vs-model
collision rule: `circleOverlapsCircle()` is used twice in the drag handler
(live block-check during drag, and a final re-check at the snapped
drop position), rejecting the move (snapping back) on overlap. Placement
had no equivalent — confirmed by reading, not assumed.

**Fix:** reused the exact same primitive rather than inventing a second
rule. Built an `otherModels` list from `units` (already-deployed models
only — `setupInteraction`'s own `units` param is `deployedUnits`, the
undeployed-groups-filtered set `game.js`'s `renderDeployment` already
constructs, so the group currently being placed was never in it to begin
with — no "exclude my own models" logic needed the way movement's
sync-drag has). `deployValid()` now also rejects if any computed cluster
position would `circleOverlapsCircle` an existing model. Matches
movement's own choice of behavior on overlap: **reject** (click is a
no-op, `console.log`'s the existing "click blocked" message), not a
nudge — brief allowed either, movement's precedent decided it.

**Verify-first misstep worth recording:** my first reproduction attempt
computed screen-pixel-to-board-inch scale as `rect.width / viewBox.width`
directly and got it wrong — the SVG element's own box aspect ratio didn't
match the viewBox's aspect ratio, so `preserveAspectRatio="xMidYMid meet"`
was letterboxing one axis, and a naive per-axis ratio silently used the
wrong (non-constraining) scale. Caught by cross-checking against the
already-rendered token's own `getBoundingClientRect()` (ground truth,
immune to the letterboxing math) instead of hand-deriving scale — a
reminder that this project's boards are routinely non-square (44×30 /
44×60 / 44×90, see MOBILE-2-40K) and any test math assuming uniform
per-axis scale needs to check against a real rendered element first.

### Test — both required checks, pass

1. **Two models on the same square.** PASS — a synthetic fixture (already-
   deployed Wraithguard at board (20,54), a second undeployed Eldar group
   about to be placed) via Playwright/CDP: clicking exactly on the
   deployed unit's own rendered screen position left `undeployedGroups`
   unchanged (still queued) — the drop was rejected, not written.
2. **Normal placement with space still works.** PASS — same session,
   clicking 5 board-inches clear (still inside the eldar deployment zone)
   placed the new unit correctly at that exact spot, `undeployedGroups`
   cleared.

Files: `warhammer40k/js/board.js` (deployment-placement `deployValid`).

---

## BUG-40K-BOARD-BATCH item 3 — individual moves snapping to formation (2026-07-18)

Brief's own item 8: Nox moved a squad's models individually; after
accepting the move, they re-formed as if shift-click/formation-moved —
his actual per-model placements were lost.

**Investigated first, per the brief.** Found it immediately in the
`btn-confirm-move` handler (`game.js`): W40K-UX2 item 4 added an
auto-arrange-into-a-clean-grid step on confirm, "so a squatter looks like
a squad, not a scatter" — but it fires **unconditionally** whenever
`groupModels.length > 1`, with no check for HOW the models got there. A
plain drag (no shift held) is already the default, single-model move —
dragging three models of a squad one at a time, the ordinary way, is
"individual placement" in every meaningful sense, but the confirm handler
couldn't tell that apart from a deliberate shift-held whole-group
formation move. Both discarded the raw per-model positions in favor of a
fresh centroid-centered grid. This is exactly the reported bug, not a
guess — read directly off the code before touching anything.

**Fix:** threaded a `sync` flag through the movement drag pipeline so the
confirm handler can finally tell the two cases apart:
- `board.js`: the drag object already computed `syncGroup = e.shiftKey`
  at drag-start; now stored on `drag` itself and passed as a 5th argument
  to `onModelMoved` at drop time.
- `game.js`: `activateGroup` now seeds `moveState.usedSoloDrag = false`.
  All three `onModelMoved` call sites (initial activation, board-only
  re-render, and `renderBoard()`'s default branch — kept in sync
  manually, matching this file's existing pattern of near-duplicated
  board-opts builders) set `usedSoloDrag = true` the moment any drag
  arrives with `sync` false. It's a sticky per-activation flag, not
  per-model — one individual drag taints the whole activation, since a
  player who deliberately placed even one model by hand clearly isn't
  asking for the rest to be reformatted either.
- The confirm handler's auto-arrange condition is now
  `groupModels.length > 1 && !moveState.usedSoloDrag` — a lockstep
  shift-drag (the deliberate "form up" path) still tidies exactly as
  before; any activation containing a plain per-model drag now keeps
  every model's actual placed position, snapToGrid rounding aside.

**Verify-first note:** confirming this against a synthetic fixture
surfaced a real "spread-out squad fails coherency" prompt
(`btn-confirm-move-yes`) as an expected side effect of spreading models
far apart individually — not a bug, the existing coherency-warning gate
working as designed; the test had to click through it like a real player
would.

### Test — both required checks, pass

1. **3+ individual, non-formation moves.** PASS — three separate plain
   (no-shift) drags on a 3-model squad, each to a distinct, deliberately
   far-apart spot (>5" from each other, avoiding any inter-model
   collision from the still-live BUG-40K-BOARD-BATCH-item-2-adjacent
   movement collision rule), confirmed through the resulting coherency
   prompt. Final Firebase positions matched each individually-placed spot
   (within `snapToGrid` rounding) — no formation grid, no
   centroid-recentering.
2. **Deliberate formation move still works.** PASS — same fixture,
   fresh reseed, ONE shift-held drag on a single model (moves the whole
   group in lockstep, per the existing sync-drag mechanic) — confirm
   produced the exact expected 2"-spaced grid centered on the new
   centroid, unchanged from pre-fix behavior.

Files: `warhammer40k/js/board.js` (drag state gains `syncGroup`, passed
to `onModelMoved`), `warhammer40k/js/game.js` (`activateGroup`,
three `onModelMoved` call sites, `btn-confirm-move` auto-arrange gate).

---

## 40K-AUTO-ALLOCATE — one-click wound allocation (2026-07-18)

Brief: `briefs/40K_AUTO_ALLOCATE_BRIEF.md`. Manual casualty allocation
works (6981b0b), but clicking models one at a time is tedious for big
units — adds an optional "Auto-Allocate" shortcut alongside it.

**Leader/special-model signal: verified none exists, fell back as
instructed.** Checked `roster.js`'s `buildUnitsFromRoster` directly: a
squad's `equippedRanged`/`equippedMelee` (including the `perModel:false`
tag `resolveLoadout`/`tagWeapons` attach to a chosen/replaced special
weapon — see 40K-P3) are computed ONCE per roster unit and assigned
IDENTICALLY to every model instance in that squad's build loop — WHICH
specific model actually carries a once-per-squad weapon is resolved
dynamically at fire time (`shooting.js`'s `firingInstances` just picks
any eligible alive model), never written back onto a model id. `units.js`
has a hardcoded `sergeant` type, but that's the legacy dev-preset table
only (`grep` confirmed `sergeant`/`leader`/`role` appear nowhere in
`roster.js`) — real roster-built games never touch it. This matches KL-1's
own retirement note (Phase 18, this same DEVLOG): "no per-model role
data, only per-squad." **Conclusion: no clean signal, so the RAW-mandatory
tier (already-wounded models finish first) is the only tier that exists —
plain-vs-leader-vs-special ordering was not invented.**

**Implementation** (`js/game.js`): `computeAutoAllocation(aliveModels,
count)` sorts wounded-first (`wounds < maxWounds`) then everyone else, and
takes the first `count` ids — that's the entire ordering rule. A new
"Auto-Allocate" button renders only in the non-wipe branch of
`buildAllocationBarContent` (the wipe branch's existing "Remove All
Models" already IS a one-click, decision-free removal — a second button
doing the identical thing there would be redundant, not a feature). Its
click handler computes `deadIds` via `computeAutoAllocation` and calls
`window.GameState.allocateCasualties(...)` — **the exact same function
the manual Confirm Removal button calls**, same arguments shape, no
parallel write path. Manual per-model toggle selection is completely
untouched — the two buttons sit side by side, either one usable per the
brief's "shortcut, not a replacement."

### Test — all 4 required checks, pass

Synthetic Firebase fixtures + real Playwright/CDP interaction (disposable
test games, deleted after verification), matching this project's
established one-off-test convention.

1. **5-model unit, model_0 already wounded (1/3), 3 pending wounds.
   Auto-Allocate.** PASS — model_0 (wounded) died along with 2 fresh
   models (3 dead total, 2 alive), `pendingCasualties` cleared to `null`
   in one click — no separate Confirm step needed since the button IS the
   confirm action.
2. **Other client sees the same result.** PASS — two real separate
   browser contexts; both showed identical post-allocation "2 models"
   for the eldar player strip, no desync.
3. **Manual allocation untouched.** PASS — fresh fixture, manually
   clicked 2 models (no Auto-Allocate interaction at all), Confirm
   Removal worked exactly as before BUG-40K-CASUALTY-LOCK/this brief.
4. **Full wipe edge (wounds ≥ unit size).** PASS — the wipe branch's
   pre-existing "Remove All Models" one-click (this brief's "via
   auto-allocate" is already satisfied by that path — no per-model
   decision exists to make when everyone dies, so no second button was
   added there) still removed the whole 5-model unit cleanly; confirmed
   `#btn-auto-allocate` correctly does NOT render in this branch.

**Determinism:** no randomness anywhere in `computeAutoAllocation` — a
pure sort + slice over the same `units` snapshot both clients already
have, writing through the identical `allocateCasualties` path manual
allocation uses. Test 2 confirms no observed divergence.

Files: `warhammer40k/js/game.js` (`computeAutoAllocation`,
`buildAllocationBarContent`, new `btn-auto-allocate` handler).

---

## 40K-INFO-LEGIBILITY item 1 — health visible at full, not just when damaged (2026-07-18)

Brief: `briefs/40K_INFO_LEGIBILITY_BRIEF.md`. Nox's #10: a 13-wound Leman
Russ and a 1-wound trooper look identical at full health — health only
shows once a model is already damaged.

**Investigated first.** Found the single existing on-token health visual:
`board.js`'s `drawUnits` draws MISSING wounds as a red pie wedge, gated
`if (u.wounds < u.maxWounds)`. Grepped the rest of the codebase for any
other wound display — none exists besides this wedge and the hover-only
SVG `<title>` tooltip (W40K-UX1's `"{label} — {wounds}/{maxWounds}W"`,
already flagged elsewhere as not touch-reachable and, same complaint
here, not glance-reachable either).

**Removing the gate alone can't fix this, confirmed before writing code:**
the wedge represents the MISSING fraction of max wounds — at full health
that's mathematically 0% regardless of whether max is 1 or 13, so even
with the `if` deleted a fresh 1-wound trooper and a fresh 13-wound vehicle
would still both draw a literal zero-degree wedge (nothing). A pure
percentage can't carry absolute magnitude. Left the wedge itself
completely untouched (it does its one job — missing proportion — 
correctly already) and instead added the thing that actually carries
magnitude: a small always-drawn `${wounds}/${maxWounds}` text below each
token, using the exact same technique already used for the `abbrev` type
letter right above it (a plain SVG `<text>`, same font/weight
convention) — reusing the existing presentation's own drawing style
rather than introducing a new indicator type. Damaged models render this
text in the same red the wedge already uses, so the two signals read as
one coherent system instead of two competing ones. No per-viewer
branching exists anywhere in `drawUnits` — this text renders for every
alive token regardless of whose faction is looking, same as the wedge
already did.

### Test — all 3 required checks, pass

Synthetic Firebase fixture + Playwright (disposable test game, deleted
after):

1. **Fresh unit, no damage.** PASS — a 1-wound trooper at full health
   shows `1/1`, a 13-wound vehicle at full health shows `13/13`. Neither
   was blank.
2. **Damage it, confirm updates + no regression.** PASS — dropping the
   13-wound vehicle to 5 wounds updated the text to `5/13` (turning red)
   and the pre-existing red wedge still drew exactly as before —
   untouched code path, confirmed still firing.
3. **1-wound vs 13-wound read differently at full health.** PASS — `1/1`
   vs `13/13`, distinguishable at a glance without any damage having
   happened yet.

**Opponent visibility confirmed directly**, per the brief's explicit
ask: loaded as the eldar player and read the GUARD player's own trooper
token — `1/1` renders identically for the non-owning viewer, since
`drawUnits` has no faction-gating on this text (or the wedge, or the
tooltip) at all.

Nothing here turned out bigger than expected — this was genuinely a
"the info exists, just wasn't shown" fix, one new text element reusing
an existing drawing pattern.

Files: `warhammer40k/js/board.js` (`drawUnits` — new always-on wounds
text, wedge untouched).

---

## 40K-INFO-LEGIBILITY item 2 — army-at-a-glance (2026-07-18)

Brief's own #3, deliberately open ("investigate and propose before
building").

### Investigated first

Read how the enemy force is currently presented:
- **Token colors**: fixed per faction (guard olive, eldar blue) — no
  per-unit-TYPE distinction.
- **Token size**: already keyword-tiered (TITANIC/VEHICLE/MOUNTED/default,
  W40K-UX2 item 1) — the closest existing thing to "type at a glance,"
  but coarse (4 tiers) and not what this item is about.
- **Hover tooltip**: name + wounds, but hover-only — already flagged
  elsewhere (MOBILE-1) as not touch-reachable; same complaint applies
  here for "at a glance" on desktop too (you still have to point at one
  token at a time).
- **The unit-list side panel** (`unitCardsHTML`): exists and is genuinely
  good (name, alive/total, full stat block) — but **both of its call
  sites always pass the LOCAL viewer's own faction**
  (`localFaction`/`myFac`). The opponent's roster is never shown
  anywhere. This is the actual gap, confirmed by reading, not guessed.
- **Fog-of-war check** (brief's explicit ask before proposing anything):
  grepped the whole codebase for `fog`/`concealed`/`hidden.*deploy`/
  `stealth` — nothing. `drawUnits` already renders every alive model of
  BOTH factions with real position and current wounds unconditionally
  (confirmed again for item 1 above). There is no hidden-information
  concept in this simulator to accidentally violate.

### Chosen fix and why

**Show the opponent's unit list**, the brief's own first-listed
candidate — picked over the other two for being genuinely cheapest:
it reuses `unitCardsHTML`'s existing grouping logic and CSS classes
almost entirely (a new `enemyUnitsHTML`, not a rewrite), needs zero new
interaction/click-handling, and adds zero clutter to the BOARD itself
(a real constraint here — MOBILE-1 already found tokens as small as
4×4px on some presets; a per-unit board label or a new
color/icon-by-type system would compete for the same cramped space that
work fought hard to win back). The other two candidates were rejected,
not just skipped:
- **A per-unit board label** would need its own always-legible sizing
  independent of token size, real risk of re-clutter on exactly the
  small-token cases MOBILE-1 flagged, and duplicates info the panel can
  show more cheaply.
- **Color/icon by unit type** is a real, bigger design surface (needs a
  type→icon/color taxonomy, decisions about what counts as a "type,"
  and touches the token rendering MOBILE-1/2 already tuned carefully) —
  explicitly the kind of "if your best idea is big, propose and stop"
  case the brief warns about. Not attempted.

**Deliberately a LIGHTER render than the full unit card** — name +
alive/total only, no stat row, no expand-on-click (`enemyUnitsHTML` has
no `data-card-group`, so it's inert, not wired into the existing
expand-listener at all) — a full mirrored stat card for BOTH rosters
stacked in the same panel would double the vertical footprint for detail
nobody asked to glance at; reusing `.unit-card`/`.unit-card-name`/
`.unit-card-count` keeps the visual language identical while staying
compact. Appended as a second "Enemy Army" section under the existing
"Units" title in the SAME left side panel — no new panel, no layout
change, matches existing style by construction since it's the same CSS
classes.

Wired into both places `#panel-units`'s HTML gets built: the main
render() (`js/game.js`) and the delegated own-card-expand click handler,
which rebuilds `#panel-units`'s innerHTML on every own-card click — had
to add the enemy section there too or it would vanish the moment a
player expanded one of their own cards.

### Test — before/after readability, both required checks

Synthetic Firebase fixture (guard: a 3-model squad + a 13-wound Leman
Russ; eldar: 5 Wraithguard, 1 already dead) + Playwright, disposable
game deleted after:

- **Before** (this brief's own baseline, confirmed by reading
  `unitCardsHTML`'s faction filter): the only way to know what the
  enemy has is hovering each token one at a time, reading wounds off a
  tooltip, with no name/count summary available anywhere.
- **After**: guard's own panel now also lists "Wraithguard — 4/5 models
  · 1 lost" under "Enemy Army" without touching the board at all — one
  glance at a static panel section, not N hovers.
- **Symmetric check**: loaded as the eldar viewer too — sees "Cadian
  Shock Troops — 3/3 models" and "Leman Russ Battle Tank — 1/1 models"
  under their own "Enemy Army" section. Confirms this isn't a one-sided
  fix.
- **Partial re-render regression check**: clicked one of the viewer's
  OWN unit cards (the existing expand/highlight interaction) —
  confirmed the Enemy Army section survives that re-render rather than
  disappearing, since that code path rebuilds `#panel-units` from
  scratch.

Nothing here turned out bigger than the brief anticipated — investigated
first, picked the cheapest option with a stated reason, stopped there.

Files: `warhammer40k/js/game.js` (`enemyUnitsHTML`, both `#panel-units`
build sites).

---

## 40K-BLOOD-FX — hit/damage visual feedback (2026-07-19)

Brief: `briefs/40K_BLOOD_FX_BRIEF.md`. Aaron wants more visceral feedback
on a hit/kill; stylized impact feedback (KT's tone), not gore.

### The seam — where the effect lives, what the caller passes

`js/hit-fx.js` (new file, `window.HitFX.play(svg, x, y, opts)`) is the
whole effect. It is genuinely game-agnostic: it takes an SVG element to
draw into, board-space coordinates, and `{ kind: 'wound'|'kill',
intensity }` — it never looks up its own SVG, never reads a unit object,
never touches Firebase. "A function KT could call tomorrow with its own
numbers" per the brief's own framing: KT would need its own SVG board
element and its own (x, y, kind, intensity) — nothing else. Positioning
is entirely in board units (inches, same space `drawUnits` already draws
tokens in), so the COORDINATE TRAP the brief calls out doesn't apply —
this never touches `rect.width/viewBox.width` or any screen-pixel math
at all, so pan/zoom (an SVG viewBox mutation) carries an in-flight effect
for free.

The TRIGGER — deciding WHEN a wound/kill happened — is 40k-specific and
lives entirely in `board.js`'s `drawUnits` (a new `collectHitFX`
helper + a module-level `lastKnownHealth` snapshot, same pattern
`game.js`'s existing `lastShotKey` already uses for the shot tracer, so
this isn't a new architectural idea in this codebase). Every render
compares each unit's CURRENT `wounds`/`alive` (the real Firebase-synced
fields — never a client-local `pending` drag overlay) against the
LAST time this render loop saw that unit; a drop in wounds or an
alive→dead flip queues an effect at that unit's real board position.
Effects are drawn in a second pass AFTER every token is appended, so a
flash always paints on top regardless of unit iteration order. A unit
with no prior snapshot (first render after join/reload, or a squad that
just deployed) is seeded silently — rejoining mid-game doesn't replay
every historical hit.

### Intensity: scales with damage, not flat

Cheap to compute since the snapshot already holds the "before" wounds:
`intensity = prevWounds - currentWounds` for a wound, or `prevWounds` (at
least 1) for a kill — no extra reads, no extra state. Bigger hits draw a
larger flash with more radiating spikes; the module clamps the caller's
value internally so an extreme input can't produce a degenerate result.

### Visual design

Two CSS keyframe animations (`css/styles.css`, following the existing
`.tracer-line`/`@keyframes tracer-fade` pattern exactly — same
mechanism, not a new one): `.hitfx-wound` (420ms opacity fade) and
`.hitfx-kill` (750ms, bigger/more spikes/red vs amber). Each play() call
draws one `<g>`: a filled circle (impact flash) plus a handful of
radiating line spikes (impact marks / brief spatter) — matches the
brief's explicit "impact marks, brief spatter, hit flash," explicitly
not gore. Self-removes on `animationend`, with a `setTimeout` fallback
matching `playTracer`'s own precedent for the case a full board rebuild
detaches the node before the animation naturally finishes (an accepted,
pre-existing limitation in this codebase, not something new introduced
here).

### Determinism verified, not assumed

The trigger reacts to `game.units`, the same object BOTH clients receive
from their own independent Firebase subscription — there is no local
click path into it at all (confirmed by reading `collectHitFX`: its only
inputs are the unit object and the snapshot, no `moveState`/click-handler
involvement). Verified live with two real separate browser contexts
(not dev-mode single-tab perspective switching): a REST write killing a
guard model played the kill effect on BOTH the eldar ("shooter") and the
guard ("watching") client's own board, independently.

### Test — all 5 required checks, pass

Synthetic Firebase fixtures + Playwright/CDP (disposable games, deleted
after):

1. **Wound, model survives.** PASS — dropping a Wraithguard from 3→2
   wounds played a `.hitfx-wound` group at its exact board coordinates
   (20, 30), confirmed by reading the drawn circle's own `cx`/`cy`.
2. **Kill, model removed.** PASS — a `.hitfx-kill` group played and the
   token switched to the destroyed/skull rendering in the same render
   pass.
3. **Other client sees the same hit.** PASS — two real separate browser
   contexts; a kill triggered by one write showed the kill effect on
   BOTH clients independently, not just whichever page issued the write.
4. **Pan/zoom anchoring.** PASS — zoomed in (real wheel events, viewBox
   confirmed to actually change), then took a hit: the effect's drawn
   `cx`/`cy` were still the raw board coordinates (20, 30), unaffected by
   the current zoom — it rides the same viewBox transform every token
   already does.
5. **Big unit, many simultaneous hits.** PASS — one atomic 20-model
   Firebase update (all `alive:false` in a single `.update()`-shaped
   write, matching how a real big volley's `confirmUnitShoot` already
   writes) rendered all 20 destroyed tokens and 20 simultaneous kill
   effects within ~300ms (network round-trip included), no page errors,
   no hang. Not pooled or capped — 20 short-lived SVG groups that
   self-remove within under a second wasn't judged heavy enough to
   justify the extra mechanism; noted here as the actual scale tested,
   not asserted from a design he didn't measure.

### What KT would need to reuse this (one line, per the brief's own ask)

Its own board SVG element and a `{kind, intensity}` call at the right
(x, y) when ITS OWN wound/kill state changes — `hit-fx.js` itself would
not need to change at all.

Files: `warhammer40k/js/hit-fx.js` (new), `warhammer40k/js/board.js`
(`collectHitFX`, `lastKnownHealth`, wiring in `drawUnits`),
`warhammer40k/css/styles.css` (`.hitfx-wound`/`.hitfx-kill` keyframes),
`warhammer40k/index.html` (script tag).

---

## BUG-40K-LOSING-SCREEN — loser saw VICTORY instead of defeat (2026-07-19)

Brief: `briefs/BUG_40K_LOSING_SCREEN_BRIEF.md`. Live playtest report:
elimination win, both browser windows rendered the same "VICTORY /
<winner> / <loser> has been eliminated" screen.

### Root cause: option (b) — 40k's screen never had per-viewer logic

Read `renderGameOver()` (`js/game.js`, was ~line 1501) before touching
anything, per standing rule. It builds its HTML entirely from
`game.gameOver.{winner,reason}` — never reads `localFaction` at all, so
every client rendered the identical winner-perspective markup regardless
of who was actually looking at it. Not a broken copy of KT's screen
(KT's `renderGameOver(playerSlot)` — `killteam/index.html` ~line 1519 —
compares `winner === playerSlot` and has since KT-3); 40k's version
predates that pattern and never had one. Confirmed the correct identity
source: `renderInitiative()` two functions up already does exactly this
comparison (`iAmWinner = winner === localFaction`, `js/game.js:1395`)
for the roll-off screen, so this fix reuses that existing concept
instead of inventing a second one.

### Fix — same data, per-viewer render

`renderGameOver` now computes `iAmWinner = winner === localFaction` and
branches the DOM on it: title stays the winner's name either way (both
players should agree on WHO won), subtitle switches "Victory"/"Defeat",
detail text switches from "eliminated the loser" framing to "your force
was eliminated" framing, and the screen root gets an `is-victory`/
`is-defeat` class. CSS (`css/styles.css`): defeat's subtitle recolors to
`var(--red-bright)` (the same red already used for `.btn-primary`,
nothing new introduced); victory keeps the existing dim/gold look
untouched. Win-DETECTION (`state.js`'s three `gameOver` write sites) was
not touched, per the brief.

### Draw/mutual-wipe path: does not exist in 40k, confirmed by reading, not fixed

The brief asked me to check. All three `state.js` write sites
(`confirmMeleeAttack`, `confirmUnitShoot`, `allocateCasualties`) handle
a simultaneous double-wipe by picking a winner anyway (`deadFac ===
'guard' ? 'eldar' : 'guard'` off whichever unit happened to die) rather
than writing `winner: null` the way KT's `checkForWipeout` does. 40k has
no draw screen and no draw detection — a true mutual wipeout currently
gets attributed to one side arbitrarily. Out of scope here (brief:
"don't touch win-detection logic" and treats a winner as already
correctly found) — flagging as a real gap for a future brief, not
fixing it silently. If it *were* to fire today, this session's new
render code would make it worse in a specific way worth knowing:
`loser = winner === 'guard' ? 'eldar' : 'guard'` resolves `loser =
'guard'` when `winner` is null/absent, and `iAmWinner = winner ===
localFaction` is false for both viewers — both clients would show
DEFEAT, nobody would see victory. Noted for whoever picks up the draw
gap; not triggerable from current write-site code so not tested live.

### Test — two real browser contexts, MANDATORY per project rule

Local static server (`python3 -m http.server`) + Playwright/CDP via the
existing `.playwright-libs` `libasound.so.2` workaround (borrowed from
`killteam/`, same as prior 40k sessions — `warhammer40k/` still has no
copy of its own). Disposable `games/` fixtures written directly via the
Firebase REST API (full valid schema incl. `gameOver` pre-set, matching
KT_ELIMINATION_MODE's precedent) rather than playing a game to an actual
wipeout, since the only code path under test is the end-game render —
win-detection is untouched and covered by existing tests. Two separate
Playwright *browser contexts* (separate `localStorage`, so each can hold
its own `w40k_faction_{gameId}`), not two tabs in one context. Both
fixtures deleted from live Firebase after the run.

1. **Guard wins, eldar loses (`gameOver.winner: 'guard'`).** PASS —
   guard's window: `is-victory`, subtitle "Victory", detail led with the
   loser being eliminated. Eldar's window: `is-defeat`, subtitle
   "Defeat", detail led with "Your force has been eliminated," red
   subtitle color confirmed via `getComputedStyle` (`rgb(160,32,32)` =
   `--red-bright`).
2. **Both windows agree on WHO won.** PASS — both windows' title text
   was byte-identical (`"AaronP"`), read via `textContent` on the live
   DOM (not page-source regex — KT's own devlog flagged that exact
   false-pass trap once, checked here on purpose).
3. **Reverse case — eldar wins, guard loses.** Not in the brief's
   checklist but added since the first pass alone couldn't rule out a
   hardcoded-by-slot bug (e.g. "guard always sees victory" would have
   also passed check 1 by coincidence). PASS — guard's window showed
   `is-defeat`/"Defeat", eldar's showed `is-victory`/"Victory", proving
   the branch follows `localFaction` and not slot identity.
4. **Draw/mutual-wipe path.** Not tested live — confirmed by reading
   `state.js` that 40k cannot currently produce a `gameOver` write with
   a null/absent winner, so there is no reachable state to test. See
   above.

One flaky first run: eldar's screen read back `null` at a 1200ms wait on
the reverse-case check (second `newContext()`'s Firebase subscription
hadn't resolved yet) — not a product bug, raised the wait to 2000ms and
it passed consistently on rerun. Noted so a future session doesn't
mistake a short Playwright wait for a real intermittent bug here.

Files: `warhammer40k/js/game.js` (`renderGameOver`), `warhammer40k/css/
styles.css` (`.game-over-screen.is-defeat .game-over-subtitle`).
