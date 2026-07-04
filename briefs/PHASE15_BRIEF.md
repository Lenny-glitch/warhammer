# Phase 15 Brief — Mock Rosters + Roster Loading

## Goal
Write two real Combat Patrol rosters to Firebase in the agreed format,
then build roster loading into the game lobby so both players can
paste a roster ID (or use a URL param) and play a real game from those
rosters. This is the minimum needed to get a cross-machine playtest
working. No army builder UI — just two hand-crafted rosters and the
game's ability to read them.

## Part 1 — Write mock rosters to Firebase

Write these two rosters to Firebase under rosters/{rosterId}. Use
auto-generated Firebase push keys for the roster IDs (same as the
list builder would).

### Roster 1 — Astra Militarum, 495pts
```json
{
  "meta": {
    "name": "Cadian 8th - Combat Patrol",
    "gameSystem": "warhammer-40k",
    "factionId": "astra-militarum",
    "factionName": "Astra Militarum",
    "pointsTotal": 495,
    "status": "ready"
  },
  "units": [
    {
      "instanceId": "unit-001",
      "unitId": "cadian-castellan",
      "unitName": "Cadian Castellan",
      "category": "character",
      "modelCount": 1,
      "points": 55,
      "selectedLoadout": {}
    },
    {
      "instanceId": "unit-002",
      "unitId": "cadian-shock-troops",
      "unitName": "Cadian Shock Troops",
      "category": "infantry",
      "modelCount": 10,
      "points": 65,
      "selectedLoadout": {}
    },
    {
      "instanceId": "unit-003",
      "unitId": "cadian-shock-troops",
      "unitName": "Cadian Shock Troops",
      "category": "infantry",
      "modelCount": 10,
      "points": 65,
      "selectedLoadout": {}
    },
    {
      "instanceId": "unit-004",
      "unitId": "leman-russ-battle-tank",
      "unitName": "Leman Russ Battle Tank",
      "category": "vehicle",
      "modelCount": 1,
      "points": 185,
      "selectedLoadout": {}
    },
    {
      "instanceId": "unit-005",
      "unitId": "chimera",
      "unitName": "Chimera",
      "category": "vehicle",
      "modelCount": 1,
      "points": 85,
      "selectedLoadout": {}
    },
    {
      "instanceId": "unit-006",
      "unitId": "commissar",
      "unitName": "Commissar",
      "category": "character",
      "modelCount": 1,
      "points": 30,
      "selectedLoadout": {}
    }
  ]
}
```

### Roster 2 — Craftworlds Eldar, 495pts
```json
{
  "meta": {
    "name": "Biel-Tan - Combat Patrol",
    "gameSystem": "warhammer-40k",
    "factionId": "craftworlds-eldar",
    "factionName": "Craftworlds Eldar",
    "pointsTotal": 495,
    "status": "ready"
  },
  "units": [
    {
      "instanceId": "unit-001",
      "unitId": "farseer",
      "unitName": "Farseer",
      "category": "character",
      "modelCount": 1,
      "points": 70,
      "selectedLoadout": {}
    },
    {
      "instanceId": "unit-002",
      "unitId": "guardian-defenders",
      "unitName": "Guardian Defenders",
      "category": "infantry",
      "modelCount": 11,
      "points": 100,
      "selectedLoadout": {}
    },
    {
      "instanceId": "unit-003",
      "unitId": "dire-avengers",
      "unitName": "Dire Avengers",
      "category": "infantry",
      "modelCount": 10,
      "points": 150,
      "selectedLoadout": {}
    },
    {
      "instanceId": "unit-004",
      "unitId": "rangers",
      "unitName": "Rangers",
      "category": "infantry",
      "modelCount": 5,
      "points": 55,
      "selectedLoadout": {}
    },
    {
      "instanceId": "unit-005",
      "unitId": "wraithlord",
      "unitName": "Wraithlord",
      "category": "vehicle",
      "modelCount": 1,
      "points": 130,
      "selectedLoadout": {}
    }
  ]
}
```

After writing, output the two Firebase roster IDs (push keys) so they
can be shared with players.

## Part 2 — Roster loading in the game lobby

### Lobby UI changes
- Add a "Roster ID" text input to the lobby, below faction select
- Player pastes their roster ID into this field before creating or
  joining a game
- Alternatively, support ?roster=ROSTER_ID as a URL param that
  pre-fills this field (so the list builder can generate a direct
  link later)
- When a roster ID is entered, fetch that roster from
  Firebase rosters/{rosterId} and show a preview: roster name,
  faction, points total, unit list — so the player can confirm
  they loaded the right list before creating the game
- If the roster's factionId doesn't match the faction the player
  selected, show a clear error — don't allow mismatched faction/roster
  combinations

### Game creation changes
- Store the roster ID on the game doc at creation:
  `players/{faction}/rosterId: rosterId`
- The game reads the full roster from Firebase at game start (not
  stored inline on the game doc — just the ID, same pattern as
  everything else referencing Firebase by ID)

### Replacing hardcoded unit setup
- `buildInitialUnits()` currently generates a fixed set of 2 test
  models. Replace this with a function that reads the loaded roster
  and generates units from it:
  - For each unit in roster.units, look up the unit definition in
    `gameData/warhammer-40k/{factionId}/{unitId}`
  - Generate model instances based on modelCount and the unit's
    composition from gameData (e.g. a 10-model Cadian Shock Troops
    generates 9 shock_trooper models + 1 sergeant model)
  - Assign starting positions using the existing deployment-zone
    logic (players will place them in the deployment phase)
  - Each model instance gets a unique ID, its unitGroup (matching
    the instanceId from the roster), faction, type, stats from
    gameData

### Attack pipeline refactor (the important one)
The existing resolveAttacks/resolveMeleeAttacks reads weapon profiles
from UNIT_STATS[type].weapon — a hardcoded local lookup. This needs
to read from gameData in Firebase instead, using the unit's actual
loaded stats.

Add a helper `getUnitDef(faction, unitId)` that returns the full unit
definition from the already-loaded gameData (cache it at game load,
don't re-fetch per shot). Wire this into resolveAttacks and
resolveMeleeAttacks so weapon profiles come from the real datasheet,
not UNIT_STATS.

UNIT_STATS can stay for now as a fallback/display layer (token size,
base radius) but should not be the source of combat stats going
forward.

## Explicitly OUT of scope
- Army builder UI (no picking units in-game)
- Wargear dropdown choices (selectedLoadout is empty, use defaults
  from gameData)
- Points enforcement (rosters are trusted as valid)
- Any change to terrain, board size, or phase logic

## Done when
- Two roster IDs exist in Firebase and are shareable
- Pasting a roster ID in the lobby shows a preview of that roster
- Creating a game with a roster ID stores it on the game doc
- The game generates real units from the roster (not the hardcoded
  2-model squads) with correct model counts and compositions
- Shooting and melee resolution reads weapon profiles from gameData,
  not UNIT_STATS hardcoded values
- A full game can be started on two different machines using the two
  roster IDs, with both players seeing their correct units on the board

Report back: the two roster IDs, confirm the attack pipeline now reads
from gameData (test with a real shot and confirm the weapon stats match
the datasheet, not the old hardcoded values), and flag any unit
compositions from gameData that couldn't be cleanly generated into
model instances.
