# Data Pipeline Brief — BSData Migration + Ploys/Stratagems

## Context & Long-Term Goals

This project has three game apps sharing one Firebase project:
- Warhammer 40k Simulator (warhammer40k repo)
- Kill Team Game App (killteam repo)  
- Roster Builder (roster repo)

The long-term goal is a platform where:
1. A player builds an army/kill team in the Roster Builder
2. Publishes it to Firebase
3. Loads it into whichever game app matches the system
4. Plays a rules-as-written game with full keyword/special rule
   resolution, stratagems/ploys available as CP-spendable actions,
   and correct wargear on every unit

Right now the data pipeline is the bottleneck. Weapon special rules
are buried in raw text strings. Ploys and stratagems don't exist
in Firebase at all. Wargear options for 40k aren't structured.
This brief fixes all of that through a standalone data pipeline
that feeds Firebase without touching any live projects.

---

## Architecture Decision

**Primary data source: BSData GitHub repos**
- Kill Team: https://github.com/BSData/wh40k-killteam (2024/ folder)
- 40k: https://github.com/BSData/wh40k-10e
- Strictly better than our Wahapedia HTML scrape: structured XML,
  versioned, community-maintained, includes wargear trees for 40k
  and points costs
- Both repos already cloned locally at:
  ~/projects/bsdata-killteam/
  ~/projects/bsdata-40k/

**Ploys and stratagems: hand-authored JSON**
- BSData doesn't contain ploys or stratagems for either game
  (confirmed in investigation)
- These are small enough to write manually (6-10 entries per
  faction) and are better owned as files we control than
  scraped from an external source
- Nox authors these; Nyx builds the upload mechanism

**Standalone data pipeline: no live project changes**
- All parser/migration work happens in ~/projects/data-pipeline/
- No changes to roster/, warhammer40k/, or killteam/ repos
  until data is confirmed correct and approved
- Output is JSON files → Nox reviews → Nyx uploads to Firebase

---

## Folder Structure

```
~/projects/data-pipeline/
  parsers/
    parse-kt.js          ← Kill Team BSData XML parser
    parse-40k.js         ← 40k BSData XML parser  
    extract-glossary.js  ← Rule glossary from .gst files
    upload.js            ← Firebase upload (runs AFTER review)
  output/
    kt-tau-pathfinders.json
    kt-void-dancer-troupe.json
    kt-ork-kommandos.json
    kt-kasrkin.json
    40k-astra-militarum.json
    40k-craftworlds-eldar.json
    rules-glossary-kt.json
    rules-glossary-40k.json
  ploys/                 ← Hand-authored by Nox
    tau-pathfinders.json
    void-dancer-troupe.json
    ork-kommandos.json
    kasrkin.json
  stratagems/            ← Hand-authored by Nox
    astra-militarum.json
    craftworlds-eldar.json
```

Create this structure first before writing any parser code:
```bash
mkdir -p ~/projects/data-pipeline/parsers
mkdir -p ~/projects/data-pipeline/output
mkdir -p ~/projects/data-pipeline/ploys
mkdir -p ~/projects/data-pipeline/stratagems
```

---

## Phase A — Rule Glossary Extractor

### Why first
The glossary is needed by both parsers to convert WR/Keywords
strings into structured arrays. Extract it once, use it everywhere.

### extract-glossary.js
Reads the .gst files from both BSData repos and outputs two
glossary JSON files.

**Input:** 
- ~/projects/bsdata-killteam/ (find *.gst file)
- ~/projects/bsdata-40k/ (find *.gst file)

**Extract per rule:**
- id (generate from name: "Lethal 5+" → "lethal-5plus")
- name (canonical display name)
- aliases (all instantiated variants, e.g. ["Lethal 3+",
  "Lethal 4+", "Lethal 5+", "Lethal 6+"])
- description (full rule text from <description> element)
- category: "weapon-rule" | "ability" | "core-rule"

**Output:**
- output/rules-glossary-kt.json (array of rule objects)
- output/rules-glossary-40k.json (array of rule objects)

### parseWeaponRules helper (shared by both parsers)
```javascript
function parseWeaponRules(wrString, glossary) {
  if (!wrString || wrString.trim() === '-') return [];
  return wrString.split(', ').map(token => {
    const clean = token.trim().replace(/\*$/, '');
    // Extract Range specially — pull into rng field, not keywords
    if (/^Range \d+"?$/.test(clean)) return null; // handled separately
    const match = glossary.find(r =>
      r.aliases.includes(clean) || r.name === clean
    );
    return {
      raw: clean,
      id: match ? match.id : null,
      name: match ? match.name : clean,
      custom: token.trim().endsWith('*'),
      unknown: !match && !token.trim().endsWith('*')
    };
  }).filter(Boolean);
}

function extractRange(wrString) {
  if (!wrString) return null;
  const match = wrString.match(/Range (\d+)"/);
  return match ? match[1] + '"' : null;
}
```

---

## Phase B — Kill Team Parser

### parse-kt.js
Reads all 2024-era faction .cat files from bsdata-killteam
and outputs one JSON file per faction.

**Input:** ~/projects/bsdata-killteam/2024\ -\ *.cat

**Per faction, extract:**

Faction info:
```json
{
  "id": "tau-pathfinders",
  "name": "Pathfinders",
  "system": "kill-team"
}
```

Per operative (profile typeName="Operative"):
```json
{
  "id": "shasla-pathfinder",
  "name": "Shas'la Pathfinder",
  "role": "Shas'la",
  "stats": {
    "APL": "2",
    "Move": "6\"",
    "DF": "3",
    "Save": "5+",
    "Wounds": "7"
  },
  "weapons": [
    {
      "id": "pulse-carbine",
      "name": "Pulse carbine",
      "type": "ranged",
      "isDefault": true,
      "rng": "8\"",
      "profiles": {
        "ATK": "4",
        "HIT": "4+",
        "DMG": "4/5"
      },
      "keywords": [
        { "id": "lethal-5plus", "name": "Lethal 5+", "custom": false }
      ]
    }
  ],
  "abilities": [
    { "name": "Ability Name", "description": "Full text..." }
  ],
  "keywords": ["AELDARI", "SPEC OPS", "PATHFINDER"]
}
```

Note: DF is hardcoded to "3" for all operatives (KT3 universal)

**Composition rules** (from selectionEntry constraints):
```json
{
  "compositionRules": {
    "totalOperatives": { "min": 8, "max": 12 },
    "required": [{ "role": "Shas'ui", "count": 1 }],
    "max": [{ "role": "Weapons Expert", "count": 3 }]
  }
}
```

**Output per faction:**
output/kt-{faction-slug}.json — array of operative objects
plus faction info and compositionRules at the root level

**Factions to parse (all active KT3 factions in the 2024 folder):**
Parse all of them, not just the ones currently in Firebase.
The pipeline should be exhaustive.

---

## Phase C — 40k Parser

### parse-40k.js
Reads Library .cat files from bsdata-40k.

**Important:** Unit data is in files named
"Faction - Library.cat" not the main faction .cat.
The main faction .cat just has entry links.

**Per unit, extract:**

```json
{
  "id": "cadian-shock-troops",
  "name": "Cadian Shock Troops",
  "faction": "astra-militarum",
  "category": "infantry",
  "stats": {
    "M": "6\"",
    "T": "3",
    "SV": "5+",
    "W": "1",
    "LD": "7+",
    "OC": "2"
  },
  "points": 65,
  "pointsTable": [
    { "models": "10 models", "points": 65 },
    { "models": "20 models", "points": 130 }
  ],
  "squadSize": { "min": 10, "max": 20 },
  "weapons": [
    {
      "id": "lasgun",
      "name": "Lasgun",
      "type": "ranged",
      "isDefault": true,
      "profiles": {
        "RANGE": "24\"",
        "A": "2",
        "BS/WS": "4+",
        "S": "3",
        "AP": "0",
        "D": "1"
      },
      "keywords": [
        { "id": "rapid-fire-1", "name": "Rapid Fire 1", "custom": false }
      ]
    }
  ],
  "loadoutSlots": [
    {
      "name": "Replace lasgun",
      "type": "one-of",
      "maxCount": 2,
      "options": [
        { "weaponId": "plasma-gun-standard", "name": "Plasma gun (standard)" },
        { "weaponId": "plasma-gun-supercharge", "name": "Plasma gun (supercharge)" }
      ]
    }
  ],
  "abilities": [...],
  "keywords": ["INFANTRY", "BATTLELINE", "IMPERIUM", "ASTRA MILITARUM"],
  "isCharacter": false,
  "isVehicle": false,
  "isPsyker": false
}
```

**Loadout slots** come from selectionEntryGroup trees in BSData —
this is the big improvement over our Wahapedia scrape which only
had raw text. Parse the constraint trees into the loadoutSlots
schema the roster builder already uses.

**Points** come from <cost name="pts"> entries. If a unit has
multiple size options, capture all as pointsTable entries.

**Category detection:**
- Check keywords for VEHICLE, MONSTER, CHARACTER, INFANTRY,
  BEAST — derive category from these
- isCharacter: keywords includes CHARACTER
- isVehicle: keywords includes VEHICLE or MONSTER
- isPsyker: keywords includes PSYKER

**Factions to parse initially:**
- Astra Militarum (Imperium - Astra Militarum - Library.cat)
- Aeldari/Craftworlds (find the correct Library.cat)

---

## Phase D — Hand-authored Ploy/Stratagem Files

### Nox authors these (not Nyx)
These files go in ~/projects/data-pipeline/ploys/ and
~/projects/data-pipeline/stratagems/. Source the rule text
from Wahapedia or physical datacards.

### Kill Team ploy schema
File: ploys/tau-pathfinders.json
```json
{
  "faction": "tau-pathfinders",
  "system": "kill-team",
  "strategicPloys": [
    {
      "id": "for-the-greater-good",
      "name": "For the Greater Good",
      "cp": 1,
      "phase": "strategy",
      "timing": "start of strategy phase",
      "description": "Full rule text copied from datacard",
      "restrictions": []
    }
  ],
  "tacticalPloys": [
    {
      "id": "photon-grenade",
      "name": "Photon Grenade",
      "cp": 1,
      "phase": "firefight",
      "timing": "when a friendly operative shoots",
      "description": "Full rule text copied from datacard",
      "restrictions": []
    }
  ]
}
```

Files to author:
- ploys/tau-pathfinders.json
- ploys/void-dancer-troupe.json
- ploys/ork-kommandos.json
- ploys/kasrkin.json

### 40k stratagem schema  
File: stratagems/astra-militarum.json
```json
{
  "faction": "astra-militarum",
  "detachment": "cadian-shock-force",
  "system": "warhammer-40k",
  "stratagems": [
    {
      "id": "cover-of-darkness",
      "name": "Cover of Darkness",
      "cp": 1,
      "phase": "movement",
      "timing": "start of your Movement phase",
      "description": "Full rule text",
      "restrictions": []
    }
  ]
}
```

Files to author:
- stratagems/astra-militarum.json
- stratagems/craftworlds-eldar.json

---

## Phase E — Review & Firebase Upload

### Nox reviews output JSON files
Before any Firebase writes, Nox checks:
- Do unit stats match what's on the physical datacard?
- Spot-check 3-4 units per faction (one character, one
  infantry, one vehicle, one special)
- Are loadout options correct for 40k units?
- Do weapon keywords look right?

### upload.js (Nyx builds this, Nox runs it)
Reads all output/ and ploys/ and stratagems/ files and
writes to Firebase:

**Firebase paths:**
```
gameData/kill-team/factions/{slug}/info
gameData/kill-team/factions/{slug}/units/{unitId}
gameData/kill-team/factions/{slug}/ploys
gameData/kill-team/rules/{ruleId}

gameData/warhammer-40k/factions/{slug}/info
gameData/warhammer-40k/factions/{slug}/units/{unitId}
gameData/warhammer-40k/factions/{slug}/stratagems
gameData/warhammer-40k/rules/{ruleId}
```

Upload script should:
- Require explicit confirmation before writing ("About to
  write X units to Firebase. Type YES to continue")
- Write atomically per faction (all units for one faction
  in one multi-path update)
- Log successes/failures
- NOT overwrite existing data without a --force flag

---

## Long-term: How This Feeds the Games

Once Firebase has clean structured data:

**Roster Builder:**
- 40k roster builder can show real loadout options from
  loadoutSlots, not raw text
- KT roster builder can display ploys as reference
- Both can include ploys/stratagems in exports so games
  can read them

**Kill Team Game App:**
- Strategy phase: show Strategic Ploys as CP-spendable
  buttons, read from operative's faction ploys
- Combat resolution: read weapon keywords array and apply
  effects (LETHAL 5+ = crits on 5+, BALANCED = reroll one
  die, etc.) instead of ignoring them
- Weapon special rules feel different in play

**40k Simulator:**
- Command phase: show Stratagems as CP-spendable buttons
- Shooting/Fight: weapon keywords resolve correctly
  (BLAST targets multiple, HEAVY locks movement, etc.)
- Leman Russ fires its actual equipped weapons, not all
  10 datasheet options (loadoutSlots fixes this)

---

## Build Order for Nyx

1. Create ~/projects/data-pipeline/ folder structure
2. extract-glossary.js — run it, confirm output files look right
3. parse-kt.js — run on Tau Pathfinders first, review output
4. parse-40k.js — run on Astra Militarum first, review output
5. upload.js — build but DO NOT RUN until Nox approves output

## What Nox Does in Parallel
1. Review output JSON files as Nyx produces them
2. Author ploy JSON files (4 KT factions)
3. Author stratagem JSON files (2 40k factions)
4. Run upload.js once everything is approved

---

## Explicitly Out of Scope for This Pipeline
- Any changes to roster/, warhammer40k/, or killteam/ repos
  (those happen AFTER Firebase has good data)
- Implementing keyword effects in the game engines
  (that's the brief after this one)
- Age of Sigmar or other game systems
- All factions beyond the ones listed above in first pass
