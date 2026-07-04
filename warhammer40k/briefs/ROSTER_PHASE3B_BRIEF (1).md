# Roster Phase 3b Brief — 40k Roster Flow

## Overview
Four coordinated pieces, built in this order:
1. Wargear parser + lazy migration (unit search → auto-transform → confirm → library)
2. 40k roster builder flow (pick units, squad size, wargear, live points, publish)
3. Sim integration (sim reads chosenLoadout from export, not all weapons)

Do not skip ahead. Each piece depends on the previous one.

---

## Architecture decision: lazy migration

The 231 units already in Firebase at `gameData/warhammer-40k/{factionSlug}/{unitId}`
are the SOURCE POOL. They stay there, untouched.

The roster builder's working library lives at
`gameData/warhammer-40k/factions/{factionSlug}/units/{unitId}` — the
CONFIRMED LIBRARY. Units only enter this path after a human has
reviewed and confirmed their structured data.

The flow: search source pool → auto-transform → preview → human
confirms → writes to confirmed library. On-demand, not batch.

---

## Part 1 — Unit Search & Lazy Migration

### New screen: Unit Search (40k only)
Add a route: `#unit-search/warhammer-40k/{factionSlug}`

Accessible from the 40k roster builder when a player wants to add
a unit that isn't yet in the confirmed library.

### Search UI
- Text input: player types unit name (e.g. "chimera", "dire avengers")
- App queries the source pool: searches unit names in
  `gameData/warhammer-40k/{factionSlug}/` (client-side filter on
  already-loaded data is fine — 134/97 units is not a performance
  concern)
- Results list shows matching unit names + category + points
- Player clicks a result → triggers the auto-transform preview

### Auto-transform
Transform the source pool unit into the confirmed library schema.
This is the same transform Nyx identified:

**Path:** source `gameData/warhammer-40k/{factionSlug}/{unitId}`
→ target `gameData/warhammer-40k/factions/{factionSlug}/units/{unitId}`

**Stats:** copy as-is (M, T, SV, W, LD, OC already match)

**Weapons — object → array transform:**
```js
// Input (source pool)
"weapons": {
  "bolt-pistol": {
    "name": "Bolt pistol", "type": "ranged",
    "range": 12, "attacks": 1, "skill": 4, "S": 4, "AP": 0, "D": 1,
    "keywords": ["PISTOL"]
  }
}

// Output (confirmed library)
"weapons": [
  {
    "id": "bolt-pistol",
    "name": "Bolt pistol",
    "type": "ranged",
    "isDefault": true,
    "profiles": {
      "RANGE": "12\"",
      "A": "1",
      "BS/WS": "4+",
      "S": "4",
      "AP": "0",
      "D": "1"
    },
    "keywords": ["PISTOL"]
  }
]
```

Field mapping:
- `range` → `profiles.RANGE` as string, append `"` if > 0, use
  `"Melee"` if type is melee and range is 0
- `attacks` → `profiles.A` as string
- `skill` → `profiles.BS/WS` as string with `+` suffix (e.g. 4 → "4+")
- `S`, `AP`, `D` → `profiles.S`, `profiles.AP`, `profiles.D` as strings
  (AP: prepend `-` if negative, e.g. -1 → "-1"; 0 stays "0")
- `keywords` → keep as separate array on the weapon object
- `isDefault: true` for all weapons initially (player can change in
  the preview)

**Wargear auto-parse — attempt structured options from raw text:**
The source pool has `wargearOptions` as a raw text string. Parse it
into structured `loadoutSlots` using these pattern rules:

Pattern 1 — replacement choice:
`"X can be replaced with one of the following: A, B, C"`
→ `{ name: "Replace X", type: "one-of", replaces: "X", options: ["A","B","C"] }`

Pattern 2 — optional addition:
`"This model can be equipped with Y"`
→ `{ name: "Optional: Y", type: "optional", options: ["Y"] }`

Pattern 3 — counted replacement:
`"Up to N models can replace X with one of the following: A, B"`
→ `{ name: "Replace X (up to N)", type: "counted", max: N, replaces: "X", options: ["A","B"] }`

Pattern 4 — conditional/scaling ("For every N models..."):
→ Flag as `{ type: "unparsed", rawText: "..." }` — don't attempt
to structure these, surface them for manual review

Any sentence in the wargear text that doesn't match patterns 1-3
should be collected as `unparsed` entries. The preview shows these
clearly so the player can manually structure them or ignore them.

**Other fields to carry through:**
- `name`, `points`, `pointsTable`, `squadSize`, `keywords`, `category`
- `isCharacter`, `isPsyker`, `isVehicle` flags
- `abilities` if present

**Faction info node:**
If `gameData/warhammer-40k/factions/{factionSlug}/info` doesn't
exist yet, create it on first unit confirmation:
```js
{
  name: "Astra Militarum", // or "Craftworlds Eldar"
  compositionRules: {}     // 40k has no slot rules — empty object
}
```

### Preview & Confirmation UI
After auto-transform, show a preview panel with three sections:

**Section 1 — Stats & basics**
Show the unit name, category, points, squad size range. Player
confirms these look correct. Simple read-only display, no editing
needed here (stats from Wahapedia are reliable).

**Section 2 — Weapons**
Show each weapon as a card with its transformed profiles. Player
can:
- Toggle `isDefault` on each weapon (which weapons does this unit
  come with by default?)
- Edit any profile field that looks wrong
- Remove a weapon that shouldn't be there

**Section 3 — Wargear options**
Show two sub-sections:
- Parsed options (patterns 1-3): show as structured slot previews,
  player confirms or edits
- Unparsed options: show the raw text, player can either:
  a) Manually structure it using a simple slot builder (name + type
     + options list), or
  b) Mark it as "skip for now" — it won't block the unit from being
     added, just won't have that option in the roster builder

A "Confirm & Add to Library" button at the bottom writes the
confirmed unit to `gameData/warhammer-40k/factions/{factionSlug}/units/{unitId}`
and returns the player to wherever they came from (roster builder
or library).

A "Cancel" button discards and goes back without writing anything.

---

## Part 2 — 40k Roster Builder Flow

### Route
`#roster/new/warhammer-40k/{factionSlug}`

Reuse the existing RosterBuilder object as much as possible.
The 40k flow differs from Kill Team in these specific ways:

### Differences from Kill Team

**Unit picker vs operative picker:**
Kill Team: pick individual operatives one at a time from a fixed list.
40k: pick units, then configure each unit (squad size + wargear).

**Squad size selection:**
Each added unit shows a squad size input (or slider) bounded by
`squadSize.min` and `squadSize.max` from the unit definition.
Points update live based on `pointsTable`:
- If `pointsTable` has entries, find the closest bracket and use
  that cost
- If only one entry, cost is fixed regardless of size

**Wargear selection per unit:**
Each added unit shows its `loadoutSlots` (from the confirmed library)
as dropdown/radio groups. Selected options stored in
`chosenLoadout: { [slotName]: weaponId }` — same shape as Kill Team.

**Legality check (40k is simpler than Kill Team):**
- Total points ≤ roster's points limit (from game size preset, or
  a manual limit set when creating the roster)
- Each unit's modelCount is within its squadSize.min and squadSize.max
- No slot/role rules (compositionRules is empty for 40k)
- No special rules checker needed for standard 40k (no
  cross-unit weapon limits like Void-dancer)

**Points limit input:**
When creating a 40k roster, player sets a points limit (e.g. 500
for Combat Patrol). Store this on the roster meta. The legality
checker uses this value.

### State shape for a 40k roster operative entry
Same instanceId/unitId/unitName pattern as Kill Team, plus:
```js
{
  instanceId: "unit-001",
  unitId: "cadian-shock-troops",
  unitName: "Cadian Shock Troops",
  category: "infantry",
  modelCount: 10,        // NEW — squad size chosen by player
  points: 65,            // derived from pointsTable + modelCount
  chosenLoadout: {       // wargear selections
    "Replace lasgun": "plasma-gun-standard"
  },
  notes: ""
}
```

### Publish format (must match what the 40k sim reads)
The export written to `exports/warhammer-40k/{rosterId}` and
`rosters/{rosterId}` must match the format the sim's
`buildUnitsFromRoster()` already reads:
```js
// rosters/{rosterId}/units (array or object)
{
  "unit-001": {
    instanceId: "unit-001",
    unitId: "cadian-shock-troops",
    unitName: "Cadian Shock Troops",
    category: "infantry",
    modelCount: 10,
    points: 65,
    chosenLoadout: { "Replace lasgun": "plasma-gun-standard" }
  }
}
```

The export at `exports/warhammer-40k/{rosterId}` should include
denormalized data (full stats, resolved weapon objects for chosen
loadout) so the sim doesn't need to do multiple Firebase fetches.
Pattern is already established for Kill Team — follow the same
_doPublish() denormalization logic.

---

## Part 3 — Sim Integration (Phase 17 KL-2)

### In the 40k sim (warhammer40k project)
`buildUnitsFromRoster()` already reads the roster and creates model
instances. It currently ignores `chosenLoadout`.

Change `getAllRangedWeapons(unit)` and `getAllMeleeWeapons(unit)` in
shooting.js:

```js
function getAllRangedWeapons(unit) {
  const def = getRosterUnitDef(unit.faction, unit.unitId);
  if (!def) return getFallbackWeapons(unit, 'ranged');

  // If the unit has a chosenLoadout, filter weapons to only those selected
  if (unit.chosenLoadout && Object.keys(unit.chosenLoadout).length > 0) {
    return getWeaponsFromLoadout(def, unit.chosenLoadout, 'ranged');
  }

  // Otherwise use all isDefault weapons (same as current behaviour)
  return def.weapons.filter(w => w.type === 'ranged' && w.isDefault);
}
```

`getWeaponsFromLoadout(def, chosenLoadout, type)`:
- Start with the unit's default weapons
- For each slot in chosenLoadout, replace the weapon being replaced
  with the chosen weapon
- Return the resulting weapon list filtered by type

This is a small conditional change — if chosenLoadout is empty
(which it is for the two mock rosters), behaviour is identical to
current. If populated, it uses the player's actual selections.

---

## Explicitly OUT of scope
- Authoring wargear for all 231 units upfront — lazy migration only
- Age of Sigmar or other game systems
- Transport rules, character attachment (Leader keyword effects) —
  separate features
- Printing/PDF export of the roster (noted as a future feature,
  not this brief)

---

## Done when

**Part 1:**
- Searching "chimera" in the 40k unit search finds the Chimera from
  the source pool, auto-transforms it, shows a preview with stats,
  weapons (as array with profiles), and parsed/unparsed wargear
- Confirming writes it to the confirmed library path
- The confirmed unit appears in the 40k library at
  `#library/warhammer-40k`

**Part 2:**
- A player can create a 40k roster, search and add units (triggering
  lazy migration if needed), set squad sizes with live points
  updates, select wargear from structured options, pass legality
  check, save draft, and publish
- Published roster appears in `rosters/{rosterId}` and
  `exports/warhammer-40k/{rosterId}` in the correct format

**Part 3:**
- The 40k sim reads `chosenLoadout` from the roster and fires only
  the chosen weapons, not all weapons in gameData
- Confirmed with a test: create a Leman Russ roster entry, select
  only the battle cannon (not lascannon), load it in the sim, fire —
  confirm only the battle cannon fires

Report back: one complete confirmed unit entry (show the full
Firebase write for the Chimera), one complete published 40k roster
(show the export structure for one unit with chosenLoadout populated),
and confirm the sim test passes for the Leman Russ weapon selection.
