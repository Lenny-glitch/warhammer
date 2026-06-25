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

## Current Status (as of Phase 15, Part 2)

The game is playable end-to-end with real roster data:
1. Creator pastes AM roster ID → creates game → shares link
2. Joiner pastes Eldar roster ID → joins → game goes active
3. Terrain placement → Deployment → Initiative roll → 5-turn game loop
4. Unit cards show real stats from Wahapedia-scraped data
5. Attack pipeline rolls against real T/SV/W values

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
