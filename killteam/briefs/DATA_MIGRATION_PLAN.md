# Data Migration Plan — BSData + Hand-Authored Ploys

## Decision
Switch to BSData as the primary source for unit stats, weapon
profiles, wargear options, and points costs. Hand-author ploys
and stratagems as JSON files since BSData doesn't contain them.

---

## Phase A — BSData Parser (Nyx builds this)

### Kill Team
Source: ~/projects/bsdata-killteam/2024 - *.cat files
Target: gameData/kill-team/factions/{slug}/units/{unitId}
         gameData/kill-team/factions/{slug}/info

Parser needs to extract per faction .cat file:
- Operative stats: APL, Move, Save, Wounds (DF hardcoded to 3)
- Weapon profiles: ATK, HIT, DMG, RNG, WR string
- WR → structured keywords: split on ", ", strip trailing *,
  match against alias table from .gst glossary, flag unknowns
- Abilities: name + description text
- Faction composition rules: min/max operative counts

### Warhammer 40k  
Source: ~/projects/bsdata-40k/
Target: gameData/warhammer-40k/factions/{slug}/units/{unitId}
         gameData/warhammer-40k/factions/{slug}/info

Parser needs to extract per Library .cat file:
- Unit stats: M, T, SV, W, LD, OC
- Weapon profiles: Range, A, BS/WS, S, AP, D, Keywords string
- Keywords → structured array: same comma-split approach as KT
- Wargear/loadout trees: selectionEntryGroup → loadoutSlots
  in our schema (this is the big win over Wahapedia)
- Points costs: from <cost name="pts"> entries
- Abilities: name + description

Both parsers output to the same Firebase schema already
established. The confirmed library (factions/ path) gets
populated directly — no more lazy migration needed since
BSData data quality is high enough to trust without
per-unit human review.

---

## Phase B — Hand-authored ploy/stratagem files (Nox authors these)

These are JSON files you write manually, stored in the repo
under a /data folder, loaded into Firebase once confirmed.

### Kill Team ploy schema
```json
{
  "faction": "tau-pathfinders",
  "system": "kill-team",
  "strategicPloys": [
    {
      "id": "saviour-protocols",
      "name": "Saviour Protocols",
      "cp": 0,
      "phase": "strategy",
      "timing": "when a friendly operative is selected as target",
      "description": "Full rule text here",
      "restrictions": []
    }
  ],
  "tacticalPloys": [
    {
      "id": "for-the-greater-good",
      "name": "For the Greater Good",
      "cp": 1,
      "phase": "firefight",
      "timing": "start of activation",
      "description": "Full rule text here",
      "restrictions": []
    }
  ]
}
```

Firebase path: gameData/kill-team/factions/{slug}/ploys

### 40k stratagem schema
```json
{
  "faction": "astra-militarum",
  "detachment": "cadian-shock-force",
  "system": "warhammer-40k",
  "stratagems": [
    {
      "id": "armour-of-contempt",
      "name": "Armour of Contempt",
      "cp": 1,
      "phase": "any",
      "timing": "when a saving throw is failed",
      "description": "Full rule text here",
      "restrictions": ["ADEPTUS ASTARTES units only"]
    }
  ]
}
```

Firebase path: gameData/warhammer-40k/factions/{slug}/stratagems

### Files to author (Nox writes these, not Nyx)
Start with the two active factions per game:

Kill Team:
- data/ploys/tau-pathfinders.json
- data/ploys/void-dancer-troupe.json

40k:
- data/stratagems/astra-militarum.json (Cadian detachment)
- data/stratagems/craftworlds-eldar.json

Source: Wahapedia or your physical datacards/rulebook.
These are small files — each faction has ~6-10 ploys total.

---

## Phase C — Roster builder updates (after A and B)

Once Firebase has good data:
1. Roster builder reads ploys from gameData/.../ploys when
   building a KT roster — displays them as reference
2. 40k roster builder reads stratagems from
   gameData/.../stratagems — displays them as reference
3. Export includes ploys/stratagems so the game apps can
   read them

---

## Keyword/rule resolution (both games)

The WR/Keywords string → structured array is now solvable.
Build a shared parseWeaponRules(wrString, ruleGlossary) function:

```javascript
function parseWeaponRules(wrString, glossary) {
  if (!wrString || wrString === '-') return [];
  return wrString.split(', ').map(token => {
    const clean = token.trim().replace(/\*$/, '');
    const match = glossary.find(r =>
      r.aliases.includes(clean) || r.name === clean
    );
    return {
      raw: clean,
      id: match ? match.id : null,
      name: match ? match.name : clean,
      custom: token.endsWith('*'),
      unknown: !match && !token.endsWith('*')
    };
  });
}
```

The glossary comes from the BSData .gst file, parsed once
and stored in Firebase as:
gameData/kill-team/rules/{ruleId}
gameData/warhammer-40k/rules/{ruleId}

Each rule entry:
```json
{
  "id": "lethal-5plus",
  "name": "Lethal 5+",
  "canonicalName": "Lethal x+",
  "description": "Each time an attack is made...",
  "aliases": ["Lethal 3+", "Lethal 4+", "Lethal 5+", "Lethal 6+"]
}
```

---

## Summary of what Nyx builds vs what Nox authors

| Task | Who |
|------|-----|
| BSData XML parser for KT | Nyx |
| BSData XML parser for 40k | Nyx |
| Rule glossary extractor from .gst | Nyx |
| Write to Firebase (confirmed library path) | Nyx |
| tau-pathfinders.json ploys | Nox |
| void-dancer-troupe.json ploys | Nox |
| astra-militarum.json stratagems | Nox |
| craftworlds-eldar.json stratagems | Nox |
| Roster builder reads ploys/stratagems | Nyx |
| Game apps read ploys/stratagems | Nyx (later) |
