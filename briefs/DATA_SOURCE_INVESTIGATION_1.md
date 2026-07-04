# Data Source Investigation Brief

## Goal
Before building more scraping/parsing infrastructure, investigate
whether better structured data sources exist that would give us
cleaner unit stats, weapon profiles, weapon keywords, points costs,
ploys, and stratagems than our current Wahapedia HTML scrape.

This is an investigation brief — output is a recommendation and
evidence, not working code. Do not start building anything until
Nox approves a direction.

---

## What you need (checklist to verify against each source)

For Kill Team:
- [ ] Operative stats (APL, Move, DF, Save, Wounds)
- [ ] Weapon profiles (ATK, HIT, DMG normal/crit, Range)
- [ ] Weapon special rules as structured data (not raw text)
  e.g. { rule: "BALANCED" } or ["BALANCED", "LETHAL 5+"]
- [ ] Points costs per operative
- [ ] Strategic Ploys (name, CP cost, description, timing)
- [ ] Tactical Ploys (name, CP cost, description, timing)
- [ ] Operative abilities/unique actions
- [ ] Faction composition rules

For Warhammer 40k:
- [ ] Unit stats (M, T, SV, W, LD, OC)
- [ ] Weapon profiles (Range, A, BS/WS, S, AP, D)
- [ ] Weapon keywords (RAPID FIRE, HEAVY, BLAST, LETHAL HITS,
  SUSTAINED HITS, etc.) as structured data
- [ ] Points costs (base + per-model)
- [ ] Stratagems (name, CP cost, description, timing, phase)
- [ ] Unit abilities
- [ ] Wargear/loadout options (structured, not raw text blobs)
- [ ] Detachment rules

---

## Source 1 — BSData GitHub repositories (investigate first)

BSData is a community-maintained open-source project with structured
XML data files for Battlescribe army builder, covering every GW game.

### Kill Team
Repo: https://github.com/BSData/kill-team
- Clone or download the repo locally to WSL
- Find the data files for Tau Pathfinders and Void-dancer Troupe
  (these are our two current KT factions)
- Parse one XML file and check against the checklist above
- Note: BSData XML uses a specific schema — look for
  <selectionEntry>, <characteristic>, <rule>, <profile> elements

### Warhammer 40k 10th edition
Repo: https://github.com/BSData/wh40k-10e
- Same process — find Astra Militarum and Craftworlds Eldar data
- Check for stratagems and detachment rules specifically — these
  are often in separate files from unit stats in BSData

### Commands to run (WSL terminal)
```bash
# Clone both repos to a temp folder for inspection
cd ~/projects
git clone https://github.com/BSData/kill-team.git bsdata-killteam
git clone https://github.com/BSData/wh40k-10e.git bsdata-40k

# List what's in each repo — understand the file structure
ls bsdata-killteam/
ls bsdata-40k/

# Find Tau Pathfinders data
find bsdata-killteam -name "*.cat" -o -name "*.gst" | head -20
grep -r "Pathfinder" bsdata-killteam/ --include="*.cat" -l

# Find Astra Militarum data
grep -r "Astra Militarum\|Cadian" bsdata-40k/ --include="*.cat" -l | head -5
```

### What to look for
- Are weapon special rules (Balanced, Lethal, etc.) stored as
  structured rule references, or just text descriptions?
- Are ploys/stratagems present as data entries with CP costs?
- Are points costs current (10th edition for 40k, 3rd ed for KT)?
- How complex is the XML structure — can it be reasonably parsed
  into our Firebase schema?

---

## Source 2 — Community JSON repos on GitHub

Search for existing parsed/cleaned versions of the data:

```bash
# Don't clone yet — just check what exists
# Search GitHub via browser for:
# "warhammer 40k 10th edition JSON data"
# "kill team 3rd edition data JSON"
# "wh40k-10e data"
```

Key repos to check manually in the browser (Nox does this step):
- https://github.com/BSData/wh40k-10e (already above)
- Search GitHub for: `warhammer-40k-data` `kill-team-data`
  `wh40k-json` — look for repos with recent commits and stars

Report back which ones exist and whether they have structured
weapon keywords and ploys.

---

## Source 3 — Current Wahapedia scrape (what we have)

Assess what's missing vs what we need:
- Weapon keywords: currently in WR as raw text string
  "Balanced, Lethal 5+" — not structured
- Ploys/Stratagems: completely absent, scraper explicitly skipped them
- Everything else: present and reasonably clean

---

## What to report back

For each source investigated:

1. **Does it have the data?** Go through the checklist for at
   least one KT faction and one 40k faction
2. **Is it current?** Check when it was last updated — 40k
   points change frequently with the MFM
3. **How hard is it to parse?** A rough estimate of work to
   transform into our Firebase schema
4. **License/usage** — is it open for non-commercial use?

Format your report as a comparison table:

| Need | Wahapedia | BSData | Community JSON |
|------|-----------|--------|----------------|
| KT operative stats | ✓ | ? | ? |
| KT weapon profiles | ✓ | ? | ? |
| KT weapon keywords (structured) | ✗ (raw text) | ? | ? |
| KT ploys | ✗ | ? | ? |
| 40k unit stats | ✓ | ? | ? |
| 40k weapon profiles | ✓ | ? | ? |
| 40k weapon keywords (structured) | ✗ (raw text) | ? | ? |
| 40k stratagems | ✗ | ? | ? |
| 40k wargear (structured) | ✗ (raw text) | ? | ? |
| Points current | ✓ | ? | ? |
| Parse complexity | Medium | ? | ? |

---

## What NOX needs to do (browser steps)

While Nyx investigates the repos via terminal, you do these
in a browser in parallel:

1. Go to https://github.com/BSData/kill-team and look at:
   - When was the last commit? (check the main branch)
   - How many contributors? (community health signal)
   - Does it have a folder structure that looks like faction data?

2. Go to https://github.com/BSData/wh40k-10e and same checks

3. Search GitHub for "kill team 3rd edition data" and note any
   repos with 50+ stars and recent commits — paste the URLs
   in your report back

4. Check if Wahapedia has a data export or API:
   - Go to wahapedia.ru and look for any "export", "API",
     or "data" links in the footer or about page
   - They sometimes have community-maintained exports

---

## Done when
A recommendation is ready: which source(s) to use for which
data types, with evidence from actually looking at the data.
This may be "BSData for ploys/keywords, keep Wahapedia for
stats" or "BSData for everything" or "stick with Wahapedia
and fix the WR parsing" — whatever the evidence supports.

Do NOT start any migration or parsing work until Nox has
reviewed the recommendation and approved a direction.
