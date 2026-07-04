# Phase 14 Brief — Wahapedia Scrape → Review → Firebase

## Goal
Scrape unit data from Wahapedia for Warhammer 40k (Astra Militarum +
Craftworlds Eldar only, first pass) and populate gameData/warhammer-40k
in Firebase. Also scrape the keyword/ability glossary to build a
shared keyword repository. Kill Team gap-filling is a stretch goal
if it falls out naturally.

## Answers to Nyx's questions

**1. URL structure**
Wahapedia has one page per unit with a faction index listing all units.
Start at the faction index page, scrape the unit list to get individual
unit URLs, then hit each unit page. Don't assume one page per faction
— it paginates by unit.

**2. Points source**
Wahapedia includes current points on the datasheet pages in a separate
points table. Scrape both the stat block and the points table from
each unit page and merge them. Flag as null if not found rather than
guessing.

**3. Firebase schema shape**
Follow the existing kill-team object shape where field names make
sense, but use the 40k stat/weapon field names from
rosterSchemas/warhammer-40k already in Firebase:
- Stats: M, T, SV, W, LD, OC
- Weapons: RANGE, A, BS/WS, S, AP, D
Same top-level structure as kill-team, different field names. Don't
invent a new structure.

**4. Unit IDs**
Kebab-case of unit name. Faction keys: astra-militarum and
craftworlds-eldar (match the Wahapedia URL slugs so there's a clear
mapping back to source).

**5. rosterSchemas/warhammer-40k**
Already exists in Firebase — do NOT overwrite it, leave it alone.

**6. Attack pipeline**
Firebase only, no local cache file. The sim reads from Firebase at
game load. Offline support is not a current requirement.

**7. Scope**
AM + Aeldari only for this pass. All factions at once sounds
efficient but the review burden scales — prove the pipeline on two
factions cleanly before committing to reviewing every faction.

---

## Important: isolation requirements
- Run ALL scraping from the WSL terminal (Claude Code), NOT from
  any browser context or Firebase-connected code
- No credentials, Firebase config, or API keys should be in scope
  during the scrape phase
- Everything outputs to local JSON files for review before any
  Firebase writes happen

---

## Step 1 — Scrape unit data

### Target URLs
**Warhammer 40k:**
- Astra Militarum index: https://wahapedia.ru/wh40k10ed/factions/astra-militarum/
- Craftworlds index: https://wahapedia.ru/wh40k10ed/factions/craftworlds/

Hit each index page first to discover individual unit page URLs, then
scrape each unit page.

### What to extract per unit
- Unit name, faction (kebab-case slug)
- Stats: M, T, SV, W, LD, OC
- Points cost (merge from points table on the same page, null if missing)
- Weapons: name, RANGE, A, BS/WS, S, AP, D, type (ranged/melee),
  weapon keywords (as IDs referencing the keyword repository — see
  Step 2 below)
- Wargear options (as written on the datasheet)
- Unit keywords (as IDs referencing the keyword repository, NOT full
  text — see Step 2)
- Model composition (model types, counts)
- Squad size min/max
- Special abilities (name + full text verbatim)
- Category: infantry / vehicle / character / beast / monster
- Flags: isCharacter, isPsyker, isVehicle
- Explodes profile if applicable: { roll, range, hits, S, AP, D }

### Scrape approach
Use Python requests + BeautifulSoup (install if needed:
`pip install requests beautifulsoup4 --break-system-packages`).
Prioritize stat blocks and weapon profiles over ability text if the
HTML is inconsistent. Flag anything that couldn't be reliably
extracted rather than guessing.

---

## Step 2 — Scrape keyword/ability repository

### The problem
Wahapedia's keyword definitions are hover-text rendered by JavaScript
— they don't appear in a static HTML scrape of unit pages. Keywords
need to come from a separate source.

### Approach: scrape Wahapedia's glossary page(s) online
While scraping unit pages, also hit Wahapedia's keyword/ability
glossary. Likely URLs to check:
- https://wahapedia.ru/wh40k10ed/the-rules/keywords/
- https://wahapedia.ru/wh40k10ed/the-rules/core-abilities/
- Any other rules reference pages that list keyword definitions

Extract: keyword name + full definition text for every keyword found.

### Fallback
If the glossary pages are also JavaScript-rendered and can't be
statically scraped, extract keyword definitions from your ArmySheets
PDFs using pdftotext — the core rules section should contain universal
keyword definitions. Flag which approach was used.

### Output schema for keywords
```json
{
  "id": "heavy",
  "name": "HEAVY",
  "definition": "Each time a model with this keyword...",
  "category": "weapon-keyword"
}
```

Categories: "weapon-keyword", "unit-keyword", "ability", "core-rule"

### How units reference keywords
Units store keyword IDs, not full text:
```json
{
  "keywords": ["infantry", "imperium", "astra-militarum"],
  "weapons": [
    {
      "name": "Heavy Bolter",
      "keywords": ["heavy", "sustained-hits-1"]
    }
  ]
}
```

The keyword repository is the single source of definitions. If a
keyword appears on a unit but isn't in the repository, flag it —
don't silently drop it or copy the definition inline.

---

## Step 3 — Output JSON for review

Write all scraped data to local files (NOT Firebase yet):
```
~/projects/warhammer40k/scraped-data/
  wh40k-astra-militarum.json
  wh40k-craftworlds.json
  keywords-wh40k.json
  scrape-report.txt
```

scrape-report.txt must include:
- Unit counts per faction
- Keyword count (defined vs referenced-but-missing)
- Fields that couldn't be reliably parsed, and which units were affected
- Units skipped entirely and why
- Any structural inconsistencies in Wahapedia's HTML
- Which approach was used for keyword definitions (glossary scrape
  vs PDF extraction vs manual)

---

## Step 4 — HARD STOP

Do not write anything to Firebase until Nox has reviewed the JSON
files and explicitly approved. Do not build the Firebase write script
yet — keeping it separate prevents accidental writes during
scrape/review.

---

## Step 5 — Firebase write (separate brief, after review approval)
Will be briefed after JSON review. Do not build this yet.

---

## Explicitly OUT of scope
- Any Firebase reads or writes during Steps 1-3
- Modifying the game's existing unit logic (UNIT_STATS, shooting.js)
- Building any UI against this data
- Scraping factions beyond AM + Aeldari in this pass
- Kill Team operative scraping (stretch goal only if it falls
  naturally out of the same scraper with minimal extra work)

## Done when (Step 3 checkpoint)
- wh40k-astra-militarum.json and wh40k-craftworlds.json exist with
  correct schema shape
- keywords-wh40k.json exists with definitions for every keyword
  referenced by scraped units (or a clear flag for missing ones)
- scrape-report.txt exists
- Nothing has been written to Firebase

Report back: scrape-report.txt contents, one complete example unit
from each faction JSON, three example keyword entries from
keywords-wh40k.json, and total counts.
