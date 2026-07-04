# Phase 14 Brief — Wahapedia Scrape → Review → Firebase

## Goal
Scrape unit data from Wahapedia for both Warhammer 40k (Astra
Militarum + Craftworlds Eldar) and Kill Team (Kasrkin + whatever
Eldar Kill Team faction applies), output clean JSON files for manual
review, then write approved data to Firebase under gameData/warhammer-40k
and gameData/kill-team.

## Important: isolation requirements
- Run ALL scraping from the WSL terminal (Claude Code), NOT from
  any browser context or Firebase-connected code
- No credentials, Firebase config, or API keys should be in scope
  during the scrape phase — this is a pure data-extraction job
- The scrape outputs static JSON files to a local folder for review
  before anything touches Firebase

## Step 1 — Scrape

### Target URLs
Wahapedia organizes data by faction. Start with:

**Warhammer 40k:**
- Astra Militarum datasheets: https://wahapedia.ru/wh40k10ed/factions/astra-militarum/
- Craftworlds datasheets: https://wahapedia.ru/wh40k10ed/factions/craftworlds/

**Kill Team:**
- Kasrkin: https://wahapedia.ru/kill-team/teams/kasrkin/
- Corsair Voidscarred or Craftworld operatives (whichever is the
  correct Eldar Kill Team faction): check the Kill Team section and
  use the right URL

### What to extract per unit (40k)
Match the rosterSchemas/warhammer-40k structure already in Firebase:
- Unit name, faction
- Stats: M, T, SV, W, LD, OC
- Points cost (from the datasheet or points section)
- Weapons: name, RANGE, A, BS/WS, S, AP, D, type (ranged/melee),
  special rules/keywords on the weapon
- Wargear options (as written on the datasheet)
- Unit keywords
- Model composition (how many models, what types)
- Squad size min/max
- Any special abilities (copy text verbatim, don't summarize)
- Category: infantry / vehicle / character / beast / monster
- Flags: isCharacter, isPsyker, isVehicle, explodes (with profile
  if applicable)

### What to extract per operative (Kill Team)
Match the rosterSchemas/kill-team structure already in Firebase:
- Operative name, faction, role
- Stats: APL, MOVE, SAVE, WOUNDS
- Points cost
- Weapons: name, ATK, HIT, DMG, WR, type, isDefault
- Abilities (name + description text)
- Keywords
- Loadout options
- Composition rules (min/max per operative type, any "exactly 1"
  or "max 2" rules)

### Scrape approach
Use curl or Python requests + BeautifulSoup — whatever is already
available in the WSL environment. Don't install heavy dependencies
if basic tools work. Parse the HTML structure of Wahapedia's datasheet
pages to extract the stat blocks, weapon tables, and ability text.

If Wahapedia's HTML is difficult to parse consistently (it often is —
the markup isn't always clean), prioritize getting the stat blocks
and weapon profiles correctly over getting every ability text
perfectly. Flag any field you couldn't reliably extract rather than
guessing.

## Step 2 — Output JSON for review

Write scraped data to local files (NOT Firebase yet):
```
~/projects/warhammer40k/scraped-data/
  wh40k-astra-militarum.json
  wh40k-craftworlds.json
  killteam-kasrkin.json
  killteam-eldar.json    (whatever faction name applies)
```

Each file should be an array of unit/operative objects matching the
schema described above.

Include a scrape-report.txt alongside the JSON files listing:
- How many units/operatives were extracted per faction
- Any fields that couldn't be reliably parsed (with which units
  were affected)
- Any units that were skipped entirely and why
- Any structural inconsistencies found in Wahapedia's HTML that
  required workarounds

## Step 3 — STOP. Do not write to Firebase yet.

Once the JSON files exist, stop and report back. Nox will review the
JSON output before any Firebase writes happen. Do not proceed to Step
4 without explicit confirmation.

## Step 4 — Write to Firebase (only after review approval)
This step will be briefed separately once the JSON has been reviewed.
Do not build the Firebase write logic yet — keeping it separate
prevents any accidental writes during the scrape/review phase.

## Explicitly OUT of scope for this brief
- Any Firebase reads or writes during Steps 1-3
- Modifying the game's existing unit logic (UNIT_STATS, shooting.js,
  etc.) — that comes after the data is confirmed correct
- Building any UI against this data
- Scraping any factions beyond the four listed above in this first
  pass

## Done when (Step 3 checkpoint)
- 4 JSON files exist in scraped-data/ with unit data in the correct
  schema shape
- scrape-report.txt exists with a clear summary of what was extracted
  and what was missed
- Nothing has been written to Firebase

Report back with: the scrape-report.txt contents, one example unit
entry from each JSON file so the schema shape can be visually verified,
and the total unit/operative counts per faction.
