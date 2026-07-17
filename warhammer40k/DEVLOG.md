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
